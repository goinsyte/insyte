import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { Labels } from "../domain/Ports.ts"
import { type ListInput, Returnable, ReturnDetail, ReturnList, ReturnRow } from "../domain/Returns.ts"
import {
  type Resolution,
  resolutionAmount,
  resolutionsFor,
  type ReturnKind,
  ruleFor,
  windowCheck,
  windowDaysFor
} from "../domain/Rules.ts"
import type { StoredResolution } from "../domain/Shopify.ts"
import { load, type Loaded } from "./settings.ts"

/*
 * `Returns.list`, `Returns.get` and `Returns.returnable` (M9.1), at Retouren · Bekijken, inside the role's stores. What
 * the screens used to work out in the browser (the window, the rule, the resolutions an item allows and what each
 * moves, the shopper's earlier returns) is worked out here, from the one copy of the rules.
 */

/** When the window opened: delivery as Shopify or the carrier saw it, else shipping. */
export const DELIVERED_AT = `coalesce(
  (select max(f.delivered_at) from fulfilments f where f.order_id = o.id),
  (select max(d.delivered_at) from deliveries d where d.order_id = o.id),
  o.shipped_at)`

export const SELECT = `r.id, r.number, r.type, r.order_id, o.number as order_number, r.customer_id, r.customer_name,
  r.customer_email, r.store_id, r.country, r.currency, r.source, r.status, r.reason_id,
  coalesce(rr.label, r.reason_id) as reason_label, r.customer_note, r.requested_resolution, r.exchange_to, r.keep_item,
  (select coalesce(sum(rl.quantity), 0) from return_lines rl where rl.return_id = r.id)::int as units,
  (select coalesce(sum(rl.quantity * ol.unit_price_minor), 0) from return_lines rl
     join order_lines ol on ol.id = rl.order_line_id where rl.return_id = r.id)::bigint as amount_minor,
  r.created_at, r.review_deadline, r.delivered_at, r.assignee_id, r.quality, r.tags, r.label::text as label,
  r.resolution, r.resolution_minor, r.resolved_at, r.resolved_by,
  coalesce((select u.name from members m join auth."user" u on u.id = m.user_id where m.id = r.resolved_by),
           (select k.label from api_keys k where k.id = r.resolved_by), r.resolved_by) as resolver_name,
  r.replacement_order_id,
  ro.number as replacement_number, r.rejected_reason, r.resolution_shopify::text as resolution_shopify`

export const FROM = `returns r join orders o on o.id = r.order_id
  left join return_reasons rr on rr.workspace_id = r.workspace_id and rr.id = r.reason_id
  left join orders ro on ro.id = r.replacement_order_id`

export interface Row {
  readonly id: string
  readonly number: string
  readonly type: ReturnKind
  readonly orderId: string
  readonly orderNumber: string
  readonly customerId: string | null
  readonly customerName: string
  readonly customerEmail: string | null
  readonly storeId: string
  readonly country: string | null
  readonly currency: string
  readonly source: ReturnRow["source"]
  readonly status: ReturnRow["status"]
  readonly reasonId: string
  readonly reasonLabel: string
  readonly customerNote: string
  readonly requestedResolution: Resolution
  readonly exchangeTo: string | null
  readonly keepItem: boolean
  readonly units: number
  readonly amountMinor: string
  readonly createdAt: Date
  readonly reviewDeadline: Date
  readonly deliveredAt: Date | null
  readonly assigneeId: string | null
  readonly quality: boolean
  readonly tags: ReadonlyArray<string>
  readonly label: string | null
  readonly resolution: Resolution | null
  readonly resolutionMinor: string | null
  readonly resolvedAt: Date | null
  readonly resolvedBy: string | null
  readonly resolverName: string | null
  readonly replacementOrderId: string | null
  readonly replacementNumber: string | null
  readonly rejectedReason: string | null
  readonly resolutionShopify: string | null
}

/** What the console may show of a resolution in Shopify: a gift card's code only by its last four. */
const shopifyOf = (kind: Resolution, raw: string | null) => {
  if (raw === null) return null
  const s = JSON.parse(raw) as StoredResolution
  const code = s.code === undefined || s.state !== "done"
    ? null
    : kind === "gift_card"
    ? `•••• ${s.code.slice(-4)}`
    : s.code
  return { state: s.state, reason: s.reason ?? null, scope: s.scope ?? null, code, order: s.orderName ?? null }
}

/**
 * `returns.label` as written (M9.2): asked for (`requested`), made (`issued`, with its tracking and file), or refused by
 * the carrier (`failed`, with why). A label from before M9.2 has no state and counts as made.
 */
export interface StoredLabel {
  readonly state?: "requested" | "issued" | "failed"
  readonly carrier: "PostNL"
  readonly tracking?: string
  readonly trackingUrl?: string | null
  readonly sentAt?: number
  readonly fileId?: string | null
  readonly reason?: string
  /** "Zelf versturen": the shopper's own tracking. */
  readonly self?: boolean
}
export const toRow = (r: Row) => {
  // Read as text: the SQL client camelCases the keys of a jsonb value.
  const label = r.label === null ? null : JSON.parse(r.label) as StoredLabel
  return new ReturnRow({
    id: r.id,
    number: r.number,
    kind: r.type,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    customerId: r.customerId,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    storeId: r.storeId,
    country: r.country,
    currency: r.currency,
    source: r.source,
    status: r.status,
    reasonId: r.reasonId,
    reasonLabel: r.reasonLabel,
    note: r.customerNote,
    requested: r.requestedResolution,
    exchangeTo: r.exchangeTo,
    keepItem: r.keepItem,
    units: r.units,
    amountMinor: Number(r.amountMinor),
    createdAt: r.createdAt.getTime(),
    deadline: r.reviewDeadline.getTime(),
    deliveredAt: r.deliveredAt?.getTime() ?? null,
    assigneeId: r.assigneeId,
    quality: r.quality,
    tags: r.tags,
    label: label === null || label.tracking === undefined || label.sentAt === undefined ? null : {
      carrier: label.carrier,
      tracking: label.tracking,
      sentAt: label.sentAt,
      trackingUrl: label.trackingUrl ?? null,
      fileId: label.fileId ?? null,
      self: label.self === true
    },
    labelRequest: label?.state === "requested" || label?.state === "failed"
      ? { state: label.state, reason: label.reason ?? null }
      : null,
    resolution: r.resolution === null || r.resolvedAt === null ? null : {
      kind: r.resolution,
      amountMinor: Number(r.resolutionMinor ?? 0),
      at: r.resolvedAt.getTime(),
      by: r.resolverName ?? r.resolvedBy ?? "",
      replacementOrder: r.replacementOrderId === null || r.replacementNumber === null
        ? null
        : { id: r.replacementOrderId, number: r.replacementNumber },
      shopify: shopifyOf(r.resolution, r.resolutionShopify)
    },
    rejectReason: r.rejectedReason
  })
}

export const rowsWhere = Effect.fn("Returns.rowsWhere")(function*(
  sql: SqlClient.SqlClient,
  where: Statement.Fragment,
  limit = 500
) {
  const scope = yield* inScope(sql, "r.store_id")
  const rows = yield* sql<Row>`
    select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
    where ${where} and ${scope} order by r.created_at desc, r.id desc limit ${limit}`
  return rows.map(toRow)
})

export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([]) : rowsWhere(sql, sql`r.id in ${sql.in([...new Set(ids)])}`)

const counts = Effect.fn("Returns.counts")(function*(sql: SqlClient.SqlClient) {
  const scope = yield* inScope(sql, "r.store_id")
  const [c] = yield* sql<Record<string, number>>`
    select count(*)::int as total,
           count(*) filter (where status = 'review')::int as review,
           count(*) filter (where status = 'review' and review_deadline < now())::int as late,
           count(*) filter (where status in ('awaiting_parcel', 'in_transit'))::int as awaiting,
           count(*) filter (where status = 'received')::int as received,
           count(*) filter (where status = 'ready')::int as ready,
           count(*) filter (where status = 'resolved')::int as resolved,
           count(*) filter (where status = 'rejected')::int as rejected,
           count(*) filter (where type = 'return')::int as returns,
           count(*) filter (where type = 'claim')::int as claims
    from returns r where ${scope}`
  return c as typeof ReturnList.fields.counts.Type
})

/** The panel's counts alone, for the frame (ADR-0028): the list's own, so a badge is what its view lists. */
export const panelCounts = Effect.fn("Returns.panelCounts")(function*() {
  yield* Policy.require("returns", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => counts(sql))
})

export const list = Effect.fn("Returns.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("returns", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const where = sql.and([
        input.orderId === undefined ? sql`true` : sql`r.order_id = ${input.orderId}`,
        input.customerId === undefined ? sql`true` : sql`r.customer_id = ${input.customerId}`,
        input.productId === undefined ? sql`true` : sql`exists (
          select 1 from return_lines rl join order_lines ol on ol.id = rl.order_line_id
          where rl.return_id = r.id and ol.product_id = ${input.productId})`
      ])
      return new ReturnList({
        rows: yield* rowsWhere(sql, where, input.limit ?? 500),
        counts: yield* counts(sql),
        labels: (yield* Labels).configured
      })
    })
  )
})

interface LineFacts {
  readonly id: string
  readonly orderLineId: string
  readonly productId: string | null
  readonly variantId: string | null
  readonly title: string
  readonly variantTitle: string | null
  readonly qty: number
  readonly unitPriceMinor: string
  readonly image: string | null
  readonly tags: ReadonlyArray<string> | null
  readonly condition: "ok" | "damaged" | "missing" | null
  readonly restock: boolean
  readonly photos: ReadonlyArray<string>
}

/** A return's lines with their products' first image and tags. */
export const linesOf = (sql: SqlClient.SqlClient, returnId: string) =>
  sql<LineFacts>`
    select rl.id, rl.order_line_id, ol.product_id, ol.variant_id, coalesce(p.title, ol.title) as title,
           ol.variant_title, rl.quantity as qty, ol.unit_price_minor, p.images[1] as image, p.tags, rl.condition,
           rl.restock, rl.photos
    from return_lines rl join order_lines ol on ol.id = rl.order_line_id
    left join products p on p.id = ol.product_id
    where rl.return_id = ${returnId} order by ol.id`

export interface Facts {
  readonly kind: ReturnKind
  readonly reasonId: string
  readonly deliveredAt: Date | null
  readonly placedAt: Date
  readonly amountMinor: number
  readonly lines: ReadonlyArray<Pick<LineFacts, "productId" | "variantId" | "tags">>
}

/** What the rules say of a return: its window, the rule on its first item, and what it may be settled with. */
export const judge = (s: Loaded, f: Facts, now = Date.now()) => {
  const reason = s.reasons.find((r) => r.id === f.reasonId)
  const window = windowCheck(f.deliveredAt, windowDaysFor(f.kind, reason, s, f.placedAt), now)
  const first = f.lines[0]
  const rule = first === undefined
    ? undefined
    : ruleFor(s.rules, { productId: first.productId, variantId: first.variantId, tags: first.tags ?? [] })
  const allowed = resolutionsFor(s.offered, rule, f.kind).map((kind) => ({
    kind,
    amountMinor: resolutionAmount(kind, f.amountMinor, s)
  }))
  return { reason, window, rule, allowed }
}

export const get = Effect.fn("Returns.get")(function*(id: string) {
  yield* Policy.require("returns", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [record] = yield* rowsWhere(sql, sql`r.id = ${id}`, 1)
      if (record === undefined) return yield* new NotFound({ entity: "return", id })
      const s = yield* load(sql)
      const lines = yield* linesOf(sql, id)
      const [order] = yield* sql<{ placedAt: Date }>`select placed_at from orders where id = ${record.orderId}`
      const { reason, window, rule, allowed } = judge(s, {
        kind: record.kind,
        reasonId: record.reasonId,
        deliveredAt: record.deliveredAt === null ? null : new Date(record.deliveredAt),
        placedAt: order!.placedAt,
        amountMinor: record.amountMinor,
        lines
      })
      const events = yield* sql<{ at: Date; actor: "team"; name: string | null; text: string }>`
        select at, actor, name, text from return_events where return_id = ${id} order by at, id`
      const [earlier] = yield* sql<{ n: number }>`
        select count(*)::int as n from returns
        where id <> ${id} and (customer_id = ${record.customerId}
                               or (customer_id is null and lower(customer_email) = lower(${record.customerEmail})))`
      const country = record.country ?? ""
      const address = s.addresses.find((a) => a.country === country) ?? s.addresses[0]
      const [assignee] = record.assigneeId === null ? [] : yield* sql<{ id: string; name: string }>`
        select m.id, u.name from members m join auth."user" u on u.id = m.user_id where m.id = ${record.assigneeId}`
      const labels = (yield* Labels).configured
      return new ReturnDetail({
        labels,
        record,
        lines: lines.map((l) => ({
          id: l.id,
          orderLineId: l.orderLineId,
          productId: l.productId,
          variantId: l.variantId,
          title: l.title,
          variantTitle: l.variantTitle ?? "",
          qty: l.qty,
          unitPriceMinor: Number(l.unitPriceMinor),
          image: l.image,
          condition: l.condition,
          restock: l.restock
        })),
        photos: lines.flatMap((l) => l.photos).map((f) => `/api/files/${f}`),
        photoRequired: reason?.photoRequired ?? false,
        events: events.map((e) => ({ at: e.at.getTime(), who: e.actor, name: e.name, text: e.text })),
        window,
        rule: rule === undefined ? null : { id: rule.id, kind: rule.policy, note: rule.note },
        allowed,
        earlierReturns: earlier?.n ?? 0,
        address: address === undefined
          ? null
          : { label: address.label, address: address.address, carrier: address.carrier as "PostNL" },
        assignee: assignee ?? null
      })
    })
  )
})

/** The order's lines, and how many of each are still free to send back. */
export const freeLines = (sql: SqlClient.SqlClient, orderId: string) =>
  sql<{
    id: string
    productId: string | null
    variantId: string | null
    title: string
    variantTitle: string | null
    quantity: number
    unitPriceMinor: string
    image: string | null
    tags: ReadonlyArray<string> | null
    taken: number
  }>`
    select ol.id, ol.product_id, ol.variant_id, coalesce(p.title, ol.title) as title, ol.variant_title, ol.quantity,
           ol.unit_price_minor, p.images[1] as image, p.tags,
           (select coalesce(sum(rl.quantity), 0) from return_lines rl join returns r on r.id = rl.return_id
            where rl.order_line_id = ol.id and r.status <> 'rejected')::int as taken
    from order_lines ol left join products p on p.id = ol.product_id
    where ol.order_id = ${orderId} order by ol.id`

export const returnable = Effect.fn("Returns.returnable")(function*(orderId: string) {
  yield* Policy.require("returns", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [order] = yield* sql<
        { id: string; number: string; customerName: string; currency: string; deliveredAt: Date | null }
      >`
        select o.id, o.number, o.customer_name, o.currency, ${sql.literal(DELIVERED_AT)} as delivered_at
        from orders o where o.id = ${orderId} and ${scope}`
      if (order === undefined) return yield* new NotFound({ entity: "order", id: orderId })
      const s = yield* load(sql)
      const lines = yield* freeLines(sql, orderId)
      return new Returnable({
        orderId: order.id,
        orderNumber: order.number,
        customerName: order.customerName,
        currency: order.currency,
        deliveredAt: order.deliveredAt?.getTime() ?? null,
        lines: lines.map((l) => {
          const rule = ruleFor(s.rules, { productId: l.productId, variantId: l.variantId, tags: l.tags ?? [] })
          return {
            id: l.id,
            productId: l.productId,
            variantId: l.variantId,
            title: l.title,
            variantTitle: l.variantTitle ?? "",
            unitPriceMinor: Number(l.unitPriceMinor),
            image: l.image,
            free: Math.max(0, l.quantity - l.taken),
            rule: rule === undefined ? null : { id: rule.id, kind: rule.policy, note: rule.note }
          }
        })
      })
    })
  )
})
