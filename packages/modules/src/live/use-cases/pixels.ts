import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { mutate } from "../../stores/domain/Gate.ts"
import { missingScope, ShopifyRefused } from "../../stores/domain/Ports.ts"
import { PixelInstallFailed, StorePixels } from "../domain/Live.ts"
import { LiveRooms } from "../domain/Ports.ts"
import { forgetRoute, keyHash } from "./ingest.ts"

/*
 * A store's Web Pixel from Instellingen → Winkels (M14 step 3). Installing makes a fresh ingest key, hands it to the
 * Insyte pixel extension on Shopify (`webPixelCreate`, or `webPixelUpdate` when the store has one; on Shopify's `TAKEN`,
 * the shop's existing pixel is found and updated), and keeps only the key's hash and the storefront origins it may post
 * from. One install per store at a time (a lease on its row). Repairing is installing again: the old key stops working
 * the moment the new hash is promoted. It needs the store to have granted `write_pixels` and the app's pixel extension to
 * be deployed (`shopify app deploy`); Shopify's refusal is said as it is, never as success.
 */

const PRIMARY_DOMAIN = `query { shop { primaryDomain { url } } }`
const CREATE = `mutation ($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) { userErrors { code field message } webPixel { id } }
}`
/** The app's own pixel on the shop: there is at most one. */
const EXISTING = `query { webPixel { id } }`
const UPDATE = `mutation ($id: ID!, $webPixel: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $webPixel) { userErrors { code field message } webPixel { id } }
}`

/**
 * 32 random bytes, URL-safe: the pixel's key, kept by Shopify in the pixel's settings. Not a secret: pixel settings
 * reach the visitor's browser, so anyone who opens the storefront can read it. It names the store's current pixel, so a
 * repair cuts off an old one; the ingest's limits and the room's caps bound what a script that copies it can do.
 */
const newKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const list = Effect.fn("Live.pixels")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  const rows = yield* db.scoped((sql) =>
    sql<{ storeId: string; installedAt: Date | null; lastEventAt: Date | null }>`
      select s.id as store_id, p.installed_at, p.last_event_at
      from stores s left join store_pixels p on p.store_id = s.id
      order by s.created_at`
  )
  return new StorePixels({
    available: (yield* LiveRooms).endpoint("store") !== null,
    pixels: rows.map((r) => ({
      storeId: r.storeId,
      state: r.installedAt === null ? ("none" as const) : ("installed" as const),
      installedAt: r.installedAt?.getTime() ?? null,
      lastEventAt: r.lastEventAt?.getTime() ?? null
    }))
  })
})

/** How long one install may hold the store before another may start: longer than Shopify's three calls take. */
const LEASE = "60 seconds"

export const install = Effect.fn("Live.installPixel")(function*(input: { readonly storeId: string }) {
  yield* Policy.require("settings", 3)
  const principal = yield* CurrentPrincipal
  const endpoint = (yield* LiveRooms).endpoint(input.storeId)
  if (endpoint === null) {
    return yield* new PixelInstallFailed({ reason: "unavailable", message: "This environment has no public API host" })
  }
  const db = yield* Db
  const [store] = yield* db.scoped((sql) =>
    Effect.flatMap(
      inScope(sql, "s.id"),
      (scope) =>
        sql<{ connectionId: string; shopDomain: string }>`
        select s.connection_id, s.shop_domain from stores s
        where s.id = ${input.storeId} and s.status = 'connected' and ${scope}`
    )
  )
  if (store === undefined) return yield* new NotFound({ entity: "store", id: input.storeId })

  // The lease, and the new key's hash as pending: from here the ingest takes the new key as well as the old, so a
  // request that dies after Shopify has the key, before the hash is promoted, leaves a pixel that still works.
  const key = newKey()
  const hash = yield* keyHash(key)
  const [leased] = yield* db.scoped((sql) =>
    sql<{ pixelId: string | null; repaired: boolean }>`
      insert into store_pixels (store_id, workspace_id, pending_key_hash, installing_until)
      values (${input.storeId}, ${principal.workspaceId}, ${hash}, now() + ${LEASE}::interval)
      on conflict (store_id) do update set pending_key_hash = excluded.pending_key_hash,
        installing_until = excluded.installing_until
        where store_pixels.installing_until is null or store_pixels.installing_until < now()
      returning shopify_web_pixel_id as pixel_id, (ingest_key_hash is not null) as repaired`
  )
  if (leased === undefined) {
    return yield* new PixelInstallFailed({
      reason: "busy",
      message: "Another install of this store's pixel is running"
    })
  }
  forgetRoute(input.storeId)

  const target = { connectionId: store.connectionId, shop: store.shopDomain }
  const webPixel = { settings: JSON.stringify({ storeId: input.storeId, ingestKey: key, endpoint }) }
  const update = (id: string) =>
    Effect.map(
      mutate(target, UPDATE, { id, webPixel }, "webPixelUpdate"),
      (updated) => updated.errors.length === 0 ? idOf(updated.data, "webPixelUpdate") ?? id : null
    )
  const shopify = Effect.gen(function*() {
    const domain = yield* mutate(target, PRIMARY_DOMAIN, {}, "shop")
    const primary = (domain.data as { shop?: { primaryDomain?: { url?: string } } } | null)?.shop?.primaryDomain?.url
    let pixelId = leased.pixelId === null ? null : yield* update(leased.pixelId)
    if (pixelId === null) {
      const created = yield* mutate(target, CREATE, { webPixel }, "webPixelCreate")
      if (created.errors.length > 0 && codeOf(created.data) === "TAKEN") {
        // The app's one pixel is on the shop already, but its id is not here (a row lost, or an install that died
        // before it was saved): find it and give it the new key.
        const existing = yield* mutate(target, EXISTING, {}, "webPixel")
        const id = (existing.data as { webPixel?: { id?: string } | null } | null)?.webPixel?.id
        if (id !== undefined) pixelId = yield* update(id)
      }
      if (pixelId === null && created.errors.length > 0) {
        return yield* new PixelInstallFailed({ reason: "shopify", message: created.errors[0]!.message })
      }
      pixelId ??= idOf(created.data, "webPixelCreate")
    }
    return { pixelId, primary: primary === undefined ? null : originOf(primary) }
  }).pipe(
    Effect.provideService(CurrentWorkspace, { id: principal.workspaceId }),
    Effect.catchIf(
      (error) => !(error instanceof PixelInstallFailed),
      (error) =>
        Effect.fail(
          new PixelInstallFailed({
            reason: error instanceof ShopifyRefused && missingScope(error) !== undefined ? "scope" : "shopify",
            message: error instanceof ShopifyRefused ? error.reason : error._tag
          })
        )
    ),
    // Shopify did not take the key: it is nobody's, so it stops counting, and the lease goes.
    Effect.tapError(() =>
      db.scoped((sql) =>
        sql`update store_pixels set pending_key_hash = null, installing_until = null
            where store_id = ${input.storeId} and pending_key_hash = ${hash}`
      ).pipe(Effect.ignore)
    )
  )
  const installed = yield* shopify
  const origins = [...new Set([installed.primary, `https://${store.shopDomain}`].filter((o) => o !== null))]
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`
        update store_pixels set ingest_key_hash = ${hash}, pending_key_hash = null, installing_until = null,
          shopify_web_pixel_id = ${installed.pixelId}, origins = ${origins}, installed_at = now(),
          installed_by = ${principal.id}
        where store_id = ${input.storeId} and pending_key_hash = ${hash}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: leased.repaired ? "store.pixel_repaired" : "store.pixel_installed",
        subjectType: "store",
        subjectId: input.storeId
      })
    })
  )
  forgetRoute(input.storeId)
  return yield* list()
})

const codeOf = (data: unknown): string | undefined =>
  (data as { webPixelCreate?: { userErrors?: ReadonlyArray<{ code?: string }> } } | null)?.webPixelCreate
    ?.userErrors?.[0]?.code

const idOf = (data: unknown, root: string): string | null =>
  ((data as Record<string, { webPixel?: { id?: string } | null } | null> | null)?.[root]?.webPixel?.id) ?? null
