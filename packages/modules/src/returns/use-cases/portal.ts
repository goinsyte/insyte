import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  type LineRefusal,
  normaliseNumber,
  OrderNotFound,
  PhotoRequired,
  PortalNotFound,
  PortalOrder,
  PortalStarted,
  type PortalStartInput,
  PortalStore,
  PortalTokenExpired
} from "../domain/Portal.ts"
import { type Carrier, LineNotReturnable, ResolutionNotAllowed } from "../domain/Returns.ts"
import {
  type Resolution,
  resolutionsFor,
  type ReturnKind,
  type ReturnStatus,
  REVIEW_HOURS,
  ruleFor,
  windowCheck,
  windowDaysFor
} from "../domain/Rules.ts"
import { DELIVERED_AT, freeLines } from "./returns.ts"
import { load, type Loaded } from "./settings.ts"

/*
 * The public returns portal (M9.3; widgets/03 `/retour/$storeHandle`). The shopper is no principal: the handle finds the
 * workspace through `route_portal`, and everything after runs in that workspace as `system`, one order at a time. The
 * order number and the address it was placed with find the order and answer a sealed token that names it for two
 * hours; uploads and the request carry the token, never an order id. The rules are the console's (`Rules.ts`), and a
 * line the shopper may not send back says why, as facts the screen words. A request lands in Te beoordelen like one
 * the team started, and the team hears of it (`return.requested`). The edge (rate limits, Turnstile) is the
 * transport's.
 */

const TOKEN_MS = 2 * 60 * 60 * 1000
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTOS_PER_ORDER = 12
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif"
}

interface Claims {
  readonly workspaceId: WorkspaceId
  readonly orderId: string
}

const route = Effect.fn("Portal.route")(function*(handle: string) {
  const db = yield* Db
  const [found] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId; portalOn: boolean }>`select workspace_id, portal_on from route_portal(${handle})`
  )
  return found
})

const inWorkspace = <A, E, R>(workspaceId: WorkspaceId, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f)).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

const seal = (claims: Claims) =>
  Effect.flatMap(
    Effect.service(Sealer),
    (sealer) => sealer.seal(JSON.stringify({ w: claims.workspaceId, o: claims.orderId, x: Date.now() + TOKEN_MS }))
  ).pipe(Effect.map(({ sealed }) => sealed))

/** What a token names, while it is good. Tampered, sealed elsewhere or past its time, it is expired. */
export const openToken = Effect.fn("Portal.openToken")(function*(token: string) {
  const sealer = yield* Sealer
  const plain = yield* sealer.open(token).pipe(Effect.mapError(() => new PortalTokenExpired()))
  const claims = yield* Effect.try({
    try: () => JSON.parse(Redacted.value(plain)) as { w?: unknown; o?: unknown; x?: unknown },
    catch: () => new PortalTokenExpired()
  })
  if (typeof claims.w !== "string" || typeof claims.o !== "string" || typeof claims.x !== "number") {
    return yield* new PortalTokenExpired()
  }
  if (claims.x < Date.now()) return yield* new PortalTokenExpired()
  return { workspaceId: claims.w as WorkspaceId, orderId: claims.o } satisfies Claims
})

/** The store's name as the shopper knows it: its one store's, else the workspace's. */
const storeName = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const stores = yield* sql<{ name: string }>`
      select name from stores where status <> 'disconnected' order by created_at limit 2`
    if (stores.length === 1) return stores[0]!.name
    const [ws] = yield* sql<{ name: string }>`select name from workspaces where id = app_workspace_id()`
    return ws?.name ?? ""
  })

export const store = Effect.fn("Portal.store")(function*(handle: string) {
  const routed = yield* route(handle)
  if (routed === undefined) return yield* new PortalNotFound()
  return yield* inWorkspace(routed.workspaceId, (sql) =>
    Effect.gen(function*() {
      const s = yield* load(sql)
      return new PortalStore({
        handle,
        name: yield* storeName(sql),
        on: s.portal.on,
        intro: s.portal.intro,
        done: s.portal.done,
        returnDays: s.returnDays,
        claimDays: s.claimDays,
        reasons: s.reasons.map((r) => ({
          id: r.id,
          label: r.label,
          claim: r.type === "claim",
          photoRequired: r.photoRequired
        })),
        offered: [...s.offered],
        giftCardBonusPct: s.giftCardBonusPct,
        claimSteps: [...s.claimSteps]
      })
    }))
})

interface OrderFacts {
  readonly id: string
  readonly number: string
  readonly storeId: string
  readonly customerId: string | null
  readonly customerName: string
  readonly customerEmail: string | null
  readonly country: string | null
  readonly currency: string
  readonly placedAt: Date
  readonly deliveredAt: Date | null
}

const ORDER_COLUMNS = `o.id, o.number, o.store_id, o.customer_id, o.customer_name, o.customer_email,
  o.shipping_address ->> 'country' as country, o.currency, o.placed_at`

type Line = Effect.Success<ReturnType<typeof freeLines>>[number]

/** Why a line may not go back as `kind` (with the reason's own window, once there is a reason), or `null`. */
const refusal = (
  s: Loaded,
  order: OrderFacts,
  line: Line,
  takenBy: { readonly number: string; readonly status: ReturnStatus } | undefined,
  kind: ReturnKind,
  reasonId?: string
): LineRefusal | null => {
  if (line.quantity - line.taken <= 0) {
    return { kind: "taken", number: takenBy?.number ?? "", status: takenBy?.status ?? "review" }
  }
  if (order.deliveredAt === null) return { kind: "not_delivered" }
  const reason = reasonId === undefined ? undefined : s.reasons.find((r) => r.id === reasonId)
  const window = windowCheck(order.deliveredAt, windowDaysFor(kind, reason, s, order.placedAt), Date.now())
  if (!window.inside) return { kind: "window", days: window.days, closesOn: window.closesOn }
  const rule = ruleFor(s.rules, { productId: line.productId, variantId: line.variantId, tags: line.tags ?? [] })
  if (rule !== undefined && resolutionsFor(s.offered, rule, kind).length === 0) return { kind: "rule", note: rule.note }
  return null
}

/** The latest return still counting each taken line, for "Al aangevraagd in R-…". */
const takers = (sql: SqlClient.SqlClient, orderId: string) =>
  Effect.map(
    sql<{ orderLineId: string; number: string; status: ReturnStatus }>`
      select distinct on (rl.order_line_id) rl.order_line_id, r.number, r.status
      from return_lines rl join returns r on r.id = rl.return_id
      where r.order_id = ${orderId} and r.status <> 'rejected'
      order by rl.order_line_id, r.created_at desc`,
    (rows) => new Map(rows.map((r) => [r.orderLineId, { number: r.number, status: r.status }]))
  )

/** The other variants of each product, in stock where the store counts stock, to exchange to. */
const exchanges = (sql: SqlClient.SqlClient, productIds: ReadonlyArray<string>) =>
  productIds.length === 0
    ? Effect.succeed(new Map<string, ReadonlyArray<{ id: string; title: string }>>())
    : Effect.map(
      sql<{ productId: string; id: string; title: string; stock: number | null }>`
        select v.product_id, v.id, v.title,
               (select sum(i.available) from inventory_levels i where i.variant_id = v.id)::int as stock
        from variants v where v.product_id in ${sql.in([...new Set(productIds)])}
        order by v.product_id, v.position, v.id`,
      (rows) => {
        const by = new Map<string, Array<{ id: string; title: string }>>()
        for (const r of rows) {
          if (r.title === "Default Title" || (r.stock !== null && r.stock <= 0)) continue
          by.set(r.productId, [...(by.get(r.productId) ?? []), { id: r.id, title: r.title }])
        }
        return by
      }
    )

const portalOrder = (sql: SqlClient.SqlClient, s: Loaded, order: OrderFacts, token: string) =>
  Effect.gen(function*() {
    const lines = yield* freeLines(sql, order.id)
    const taken = yield* takers(sql, order.id)
    const others = yield* exchanges(sql, lines.flatMap((l) => (l.productId === null ? [] : [l.productId])))
    const [open] = yield* sql<{ number: string; status: ReturnStatus; carrier: typeof Carrier.Type | null }>`
      select number, status, label ->> 'carrier' as carrier from returns
      where order_id = ${order.id} and status not in ('resolved', 'rejected') order by created_at desc limit 1`
    return new PortalOrder({
      token,
      number: order.number,
      firstName: order.customerName.trim().split(/\s+/)[0] ?? "",
      currency: order.currency,
      deliveredAt: order.deliveredAt?.getTime() ?? null,
      open: open === undefined
        ? null
        : { number: open.number, status: open.status, labelCarrier: open.carrier === null ? null : open.carrier },
      lines: lines.map((l) => {
        const rule = ruleFor(s.rules, { productId: l.productId, variantId: l.variantId, tags: l.tags ?? [] })
        return {
          id: l.id,
          title: l.title,
          variantTitle: l.variantTitle ?? "",
          unitPriceMinor: Number(l.unitPriceMinor),
          image: l.image,
          return: refusal(s, order, l, taken.get(l.id), "return"),
          claim: refusal(s, order, l, taken.get(l.id), "claim"),
          rule: rule === undefined ? null : { kind: rule.policy, note: rule.note },
          exchange: (l.productId === null ? [] : others.get(l.productId) ?? [])
            .filter((v) => v.id !== l.variantId)
            .map((v) => v.title)
        }
      })
    })
  })

/** "Bestelling zoeken": the number and the address the order was placed with; which was wrong is never said. */
export const lookup = Effect.fn("Portal.lookup")(function*(input: {
  readonly handle: string
  readonly number: string
  readonly email: string
}) {
  const routed = yield* route(input.handle)
  if (routed === undefined || !routed.portalOn) return yield* new PortalNotFound()
  const number = normaliseNumber(input.number)
  const email = input.email.trim().toLowerCase()
  if (number === "" || email === "") return yield* new OrderNotFound()
  return yield* inWorkspace(routed.workspaceId, (sql) =>
    Effect.gen(function*() {
      const [order] = yield* sql<OrderFacts>`
        select ${sql.literal(ORDER_COLUMNS)}, ${sql.literal(DELIVERED_AT)} as delivered_at
        from orders o
        where lower(o.customer_email) = ${email}
          and regexp_replace(upper(o.number), '^(#|SO-) *', '') = ${number}
        order by o.placed_at desc limit 1`
      if (order === undefined) return yield* new OrderNotFound()
      const s = yield* load(sql)
      return yield* portalOrder(sql, s, order, yield* seal({ workspaceId: routed.workspaceId, orderId: order.id }))
    }))
})

/**
 * A photo for the request, before there is one (`PUT /api/portal/photos`): kept against the token's order, at most
 * twelve per order and ten megabytes each, and taken over by the return it ends up on.
 */
export const upload = Effect.fn("Portal.upload")(function*(input: {
  readonly token: string
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  const claims = yield* openToken(input.token)
  const extension = PHOTO_TYPES[input.mime.toLowerCase()]
  if (extension === undefined) return yield* new Invalid({ fields: { file: "type" } })
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PHOTO_BYTES) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  return yield* inWorkspace(claims.workspaceId, (sql) =>
    Effect.gen(function*() {
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from files where owner_type = 'portal' and owner_id = ${claims.orderId}`
      if ((count?.n ?? 0) >= PHOTOS_PER_ORDER) return yield* new Invalid({ fields: { file: "count" } })
      const id = mintId("fil")
      const key = `${claims.workspaceId}/returns/portal/${claims.orderId}/${id}.${extension}`
      // A bucket that does not take the file is a defect, as a database that does not answer.
      yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, input.mime.toLowerCase()))
        .pipe(Effect.orDie)
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${id}, ${claims.workspaceId}, ${key}, ${input.name.slice(0, 200) || `foto.${extension}`},
                         ${input.mime.toLowerCase()}, ${input.bytes.byteLength}, 'return_photo', 'portal',
                         ${claims.orderId}, 'shopper')`
      return { id }
    }))
})

const REQUESTED_TEXT = { return: "Retour aangevraagd in het retourportaal", claim: "Claim gemeld in het retourportaal" }

/**
 * "Retour aanvragen" / "Probleem melden": the request, checked again against the rules as they are now, in Te
 * beoordelen with its 48 hours. Unlike a return the team starts, nothing outside the window or not yet delivered goes
 * in, and there is no undo: the shopper has their number.
 */
export const start = Effect.fn("Portal.start")(function*(input: typeof PortalStartInput.Type) {
  const claims = yield* openToken(input.token)
  return yield* inWorkspace(claims.workspaceId, (sql) =>
    Effect.gen(function*() {
      const s = yield* load(sql)
      if (!s.portal.on) return yield* new PortalNotFound()
      const [order] = yield* sql<OrderFacts>`
        select ${sql.literal(ORDER_COLUMNS)}, ${sql.literal(DELIVERED_AT)} as delivered_at
        from orders o where o.id = ${claims.orderId} for update of o`
      if (order === undefined) return yield* new PortalTokenExpired()

      const reason = s.reasons.find((r) => r.id === input.reasonId)
      if (reason === undefined || (reason.type === "claim") !== (input.kind === "claim")) {
        return yield* new Invalid({ fields: { reasonId: "unknown" } })
      }
      const fileIds = [...new Set(input.fileIds)]
      if (reason.photoRequired && fileIds.length === 0) return yield* new PhotoRequired()
      if (fileIds.length > 0) {
        const [owned] = yield* sql<{ n: number }>`
          select count(*)::int as n from files
          where id in ${sql.in(fileIds)} and owner_type = 'portal' and owner_id = ${order.id} and deleted_at is null`
        if (owned?.n !== fileIds.length) return yield* new Invalid({ fields: { fileIds: "unknown" } })
      }

      const lines = yield* freeLines(sql, order.id)
      const taken = yield* takers(sql, order.id)
      const wanted = [...new Set(input.lines.map((l) => l.lineId))]
      for (const lineId of wanted) {
        const line = lines.find((l) => l.id === lineId)
        if (line === undefined) return yield* new LineNotReturnable({ lineId, why: "unknown" })
        const no = refusal(s, order, line, taken.get(lineId), input.kind, reason.id)
        if (no !== null) {
          return yield* new LineNotReturnable({ lineId, why: no.kind === "taken" ? "taken" : no.kind })
        }
      }
      const first = lines.find((l) => l.id === wanted[0])!
      const rule = ruleFor(s.rules, { productId: first.productId, variantId: first.variantId, tags: first.tags ?? [] })
      const allowed: ReadonlyArray<Resolution> = resolutionsFor(s.offered, rule, input.kind).filter((r) =>
        r !== "discount"
      )
      if (!allowed.includes(input.resolution)) return yield* new ResolutionNotAllowed({ resolution: input.resolution })
      const exchangeTo = input.exchangeTo?.trim() || null
      if (input.resolution === "exchange" && exchangeTo === null) {
        return yield* new Invalid({ fields: { exchangeTo: "required" } })
      }
      const days = windowDaysFor(input.kind, reason, s, order.placedAt)
      const window = windowCheck(order.deliveredAt, days, Date.now())

      const [counter] = yield* sql<{ n: string }>`
        update workspace_counters set next = next + 1 where kind = 'return' returning next - 1 as n`
      const number = `R-${1000 + Number(counter!.n)}`
      const id = mintId("ret")
      yield* sql`
        insert into returns (id, workspace_id, store_id, number, type, order_id, customer_id, customer_name,
                             customer_email, country, source, status, reason_id, customer_note, requested_resolution,
                             exchange_to, currency, gift_card_bonus_pct, exchange_fee_minor, review_deadline, quality,
                             delivered_at, window_until, outside_window, rule_id, created_by)
        values (${id}, ${claims.workspaceId}, ${order.storeId}, ${number}, ${input.kind}, ${order.id},
                ${order.customerId}, ${order.customerName}, ${order.customerEmail}, ${order.country}, 'portal',
                'review', ${reason.id}, ${input.note?.trim() ?? ""}, ${input.resolution}, ${exchangeTo},
                ${order.currency}, ${s.giftCardBonusPct}, ${s.exchangeFeeMinor},
                now() + make_interval(hours => ${REVIEW_HOURS}), ${reason.countsForQuality}, ${order.deliveredAt},
                ${new Date(window.closesOn)}, false, ${rule?.id ?? null}, 'shopper')`
      for (const [i, lineId] of wanted.entries()) {
        // The photos are the request's: kept on its first line, where the return's page reads them.
        yield* sql`insert into return_lines (id, workspace_id, return_id, order_line_id, quantity, photos)
                   values (${mintId("rln")}, ${claims.workspaceId}, ${id}, ${lineId}, 1,
                           ${i === 0 ? fileIds : []}::text[])`
      }
      if (fileIds.length > 0) {
        yield* sql`update files set owner_type = 'return', owner_id = ${id} where id in ${sql.in(fileIds)}`
      }
      yield* sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text, data)
                 values (${mintId("rev")}, ${claims.workspaceId}, ${id}, 'shopper', ${order.customerName || null},
                         'requested', ${REQUESTED_TEXT[input.kind]}, '{}'::jsonb)`
      yield* Audit.write(sql, claims.workspaceId, { kind: "system", id: "portal" }, {
        action: "return.requested",
        subjectType: "return",
        subjectId: id,
        diff: { number, orderId: order.id, kind: input.kind, reason: reason.id, photos: fileIds.length }
      })
      const outboxId = yield* Outbox.write(sql, claims.workspaceId, {
        type: "return.requested",
        workspaceId: claims.workspaceId,
        userId: "system",
        returnIds: [id]
      })
      ;(yield* PendingEvents)?.add(outboxId)
      return new PortalStarted({ number, kind: input.kind, requested: input.resolution, exchangeTo })
    }))
})
