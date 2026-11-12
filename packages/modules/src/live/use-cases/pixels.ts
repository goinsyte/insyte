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
 * Insyte pixel extension on Shopify (`webPixelCreate`, or `webPixelUpdate` when the store has one), and keeps only the
 * key's hash and the storefront origins it may post from. Repairing is installing again: the old key stops working the
 * moment the new hash is written. It needs the store to have granted `write_pixels` and the app's pixel extension to
 * be deployed (`shopify app deploy`); Shopify's refusal is said as it is, never as success.
 */

const PRIMARY_DOMAIN = `query { shop { primaryDomain { url } } }`
const CREATE = `mutation ($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) { userErrors { code field message } webPixel { id } }
}`
const UPDATE = `mutation ($id: ID!, $webPixel: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $webPixel) { userErrors { code field message } webPixel { id } }
}`

/** 32 random bytes, URL-safe: the pixel's key, shown to no one and kept by Shopify in the pixel's settings. */
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
        sql<{ connectionId: string; shopDomain: string; pixelId: string | null }>`
        select s.connection_id, s.shop_domain, p.shopify_web_pixel_id as pixel_id
        from stores s left join store_pixels p on p.store_id = s.id
        where s.id = ${input.storeId} and s.status = 'connected' and ${scope}`
    )
  )
  if (store === undefined) return yield* new NotFound({ entity: "store", id: input.storeId })

  const target = { connectionId: store.connectionId, shop: store.shopDomain }
  const key = newKey()
  const webPixel = { settings: JSON.stringify({ storeId: input.storeId, ingestKey: key, endpoint }) }
  const shopify = Effect.gen(function*() {
    const domain = yield* mutate(target, PRIMARY_DOMAIN, {}, "shop")
    const primary = (domain.data as { shop?: { primaryDomain?: { url?: string } } } | null)?.shop?.primaryDomain?.url
    let pixelId: string | null = null
    if (store.pixelId !== null) {
      const updated = yield* mutate(target, UPDATE, { id: store.pixelId, webPixel }, "webPixelUpdate")
      if (updated.errors.length === 0) pixelId = idOf(updated.data, "webPixelUpdate") ?? store.pixelId
    }
    if (pixelId === null) {
      const created = yield* mutate(target, CREATE, { webPixel }, "webPixelCreate")
      if (created.errors.length > 0) {
        return yield* new PixelInstallFailed({ reason: "shopify", message: created.errors[0]!.message })
      }
      pixelId = idOf(created.data, "webPixelCreate")
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
    )
  )
  const installed = yield* shopify
  const hash = yield* keyHash(key)
  const origins = [...new Set([installed.primary, `https://${store.shopDomain}`].filter((o) => o !== null))]
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`
        insert into store_pixels (store_id, workspace_id, shopify_web_pixel_id, ingest_key_hash, origins, installed_by)
        values (${input.storeId}, ${principal.workspaceId}, ${installed.pixelId}, ${hash}, ${origins},
                ${principal.id})
        on conflict (store_id) do update set shopify_web_pixel_id = excluded.shopify_web_pixel_id,
          ingest_key_hash = excluded.ingest_key_hash, origins = excluded.origins, installed_at = now(),
          installed_by = excluded.installed_by`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: store.pixelId === null ? "store.pixel_installed" : "store.pixel_repaired",
        subjectType: "store",
        subjectId: input.storeId
      })
    })
  )
  forgetRoute(input.storeId)
  return yield* list()
})

const idOf = (data: unknown, root: string): string | null =>
  ((data as Record<string, { webPixel?: { id?: string } | null } | null> | null)?.[root]?.webPixel?.id) ?? null
