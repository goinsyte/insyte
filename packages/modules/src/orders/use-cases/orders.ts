import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { ListInput } from "../../shared/domain/Filter.ts"
import { likePattern, SearchHit } from "../../shared/domain/Search.ts"
import { compileFilter, decodeCursor, encodeCursor, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { OrderDetail, OrderPage, OrderRow } from "../domain/Orders.ts"

/*
 * `Orders.list` and `Orders.get` (M6.4): at `orders` Bekijken, inside the role's stores. Newest first, keyset on
 * `(placed_at, id)`; the search matches the number, the customer's name and address; the filter is the list's
 * whitelist below. Counts: the total under the filter and search, and per status under the search alone (the
 * status facet).
 */

export const ORDER_FIELDS: Whitelist = {
  status: { column: "o.status", type: "option" },
  payment_status: { column: "o.payment_status", type: "option" },
  fulfillment_status: { column: "o.fulfillment_status", type: "option" },
  store_id: { column: "o.store_id", type: "option" },
  currency: { column: "o.currency", type: "option" },
  number: { column: "o.number", type: "text" },
  customer_name: { column: "o.customer_name", type: "text" },
  customer_email: { column: "o.customer_email", type: "text" },
  total: { column: "o.total_minor", type: "number", scale: 100 },
  placed_at: { column: "o.placed_at", type: "date" },
  tags: { column: "o.tags", type: "tags" }
}

export interface Row {
  readonly id: string
  readonly number: string
  readonly storeId: string
  readonly shopifyId: string
  readonly customerId: string | null
  readonly customerName: string
  readonly customerEmail: string | null
  readonly status: OrderRow["status"]
  readonly paymentStatus: OrderRow["paymentStatus"]
  readonly fulfillmentStatus: OrderRow["fulfillmentStatus"]
  readonly totalMinor: string | number
  readonly currency: string
  readonly tags: ReadonlyArray<string>
  readonly lineCount: number
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly delayedAt: Date | null
  readonly trackingSentAt: Date | null
  readonly trackingFailedAt: Date | null
  readonly suppliers: ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly placedAt: Date
  readonly externalUpdatedAt: Date
}

export const toRow = (r: Row) =>
  new OrderRow({
    id: r.id,
    number: r.number,
    storeId: r.storeId,
    shopifyId: r.shopifyId,
    customerId: r.customerId,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    status: r.status,
    paymentStatus: r.paymentStatus,
    fulfillmentStatus: r.fulfillmentStatus,
    totalMinor: Number(r.totalMinor),
    currency: r.currency,
    tags: r.tags,
    lineCount: r.lineCount,
    hasTracking: r.trackingNumber !== null,
    carrier: r.carrier,
    trackingNumber: r.trackingNumber,
    delayedAt: r.delayedAt?.getTime() ?? null,
    trackingSentAt: r.trackingSentAt?.getTime() ?? null,
    trackingFailedAt: r.trackingFailedAt?.getTime() ?? null,
    suppliers: r.suppliers,
    placedAt: r.placedAt.getTime(),
    updatedAt: r.externalUpdatedAt.getTime()
  })

const ms = (d: Date | null) => (d === null ? null : d.getTime())

/**
 * The columns every order read selects, `o` the order. Its suppliers are those of its legs not called off (M8.2), so an
 * order rerouted names the supplier it went to.
 */
export const SELECT =
  `o.id, o.number, o.store_id, o.shopify_id, o.customer_id, o.customer_name, o.customer_email, o.status,
  o.payment_status, o.fulfillment_status, o.total_minor, o.currency, o.tags, o.placed_at, o.external_updated_at,
  o.delayed_at,
  (select max(m.created_at) from order_mails m where m.order_id = o.id and m.kind = 'tracking'
     and m.state in ('scheduled', 'sent')) as tracking_sent_at,
  case when o.status not in ('delivered', 'cancelled', 'refunded') then
  (select max(m.created_at) from order_mails m where m.order_id = o.id and m.kind = 'tracking' and m.state = 'failed'
     and not exists (select 1 from order_mails n where n.order_id = o.id and n.kind = 'tracking'
                       and n.state in ('scheduled', 'sent') and n.created_at >= m.created_at)) end as tracking_failed_at,
  coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name, s.id) from suppliers s
            where s.id in (select f.supplier_id from forwarding_items f
                           where f.order_id = o.id and f.state <> 'cancelled')), '[]') as suppliers,
  (select count(*) from order_lines l where l.order_id = o.id)::int as line_count,
  (select f.carrier from fulfilments f where f.order_id = o.id and f.tracking_number is not null
     order by f.shipped_at desc nulls last limit 1) as carrier,
  (select f.tracking_number from fulfilments f where f.order_id = o.id and f.tracking_number is not null
     order by f.shipped_at desc nulls last limit 1) as tracking_number`

const searchOf = (sql: SqlClient.SqlClient, q: string | undefined) => {
  const text = q?.trim() ?? ""
  if (text === "") return sql`true`
  const pattern = `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  return sql`(o.number ilike ${pattern} or o.customer_name ilike ${pattern} or o.customer_email ilike ${pattern})`
}

export const list = Effect.fn("Orders.list")(function*(input: ListInput) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  const limit = input.limit ?? 50
  const after = yield* decodeCursor(input.cursor)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id", input.storeId)
      const filter = yield* compileFilter(sql, input.filter, ORDER_FIELDS)
      const search = searchOf(sql, input.q)
      const page = after === undefined
        ? sql`true`
        : sql`(o.placed_at, o.id) < (${new Date(Number(after[0]))}, ${String(after[1])})`
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from orders o
        where ${scope} and ${filter} and ${search} and ${page}
        order by o.placed_at desc, o.id desc limit ${limit + 1}`
      const [total] = yield* sql<{ n: number }>`
        select count(*)::int as n from orders o where ${scope} and ${filter} and ${search}`
      const facets = yield* sql<{ status: string; n: number }>`
        select o.status, count(*)::int as n from orders o where ${scope} and ${search} group by o.status`
      const shown = rows.slice(0, limit)
      const last = shown.at(-1)
      return new OrderPage({
        rows: shown.map(toRow),
        nextCursor: rows.length > limit && last !== undefined ? encodeCursor([last.placedAt.getTime(), last.id]) : null,
        counts: { total: total?.n ?? 0, status: Object.fromEntries(facets.map((f) => [f.status, f.n])) }
      })
    })
  )
})

export const get = Effect.fn("Orders.get")(function*(id: string) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [row] = yield* sql<
        Row & {
          subtotalMinor: string
          shippingMinor: string
          taxMinor: string
          discountsMinor: string
          paymentGateway: string | null
          cardLast4: string | null
          shippingAddress: OrderDetail["shippingAddress"]
          note: string | null
          channel: string | null
          paidAt: Date | null
          shippedAt: Date | null
          cancelledAt: Date | null
          refundedAt: Date | null
        }
      >`
        select ${sql.literal(SELECT)}, o.subtotal_minor, o.shipping_minor, o.tax_minor, o.discounts_minor,
               o.payment_gateway, o.card_last4, o.shipping_address, o.note, o.channel, o.paid_at, o.shipped_at,
               o.cancelled_at, o.refunded_at
        from orders o where o.id = ${id} and ${scope}`
      if (row === undefined) return yield* new NotFound({ entity: "order", id })
      const lines = yield* sql<{
        id: string
        productId: string | null
        variantId: string | null
        sku: string | null
        title: string
        variantTitle: string | null
        quantity: number
        unitPriceMinor: string
        imageUrl: string | null
      }>`select l.id, l.product_id, l.variant_id, l.sku, l.title, l.variant_title, l.quantity, l.unit_price_minor,
                (select p.images[1] from products p where p.id = l.product_id) as image_url
         from order_lines l where l.order_id = ${id} order by l.shopify_id`
      const [customer] = row.customerId === null ? [] : yield* sql<{
        ordersCount: number
        lifetimeValueMinor: string
        currency: string | null
      }>`select orders_count, lifetime_value_minor, currency from customers
         where id = ${row.customerId} and deleted_at is null`
      const fulfilments = yield* sql<{
        id: string
        status: string
        carrier: string | null
        trackingNumber: string | null
        trackingUrl: string | null
        trackingStatus: string | null
        shippedAt: Date | null
        deliveredAt: Date | null
        deliveryStatus: string | null
        checkpoint: string | null
        exception: string | null
        lastEventAt: Date | null
        estimatedDelivery: Date | null
      }>`select f.id, f.status, f.carrier, f.tracking_number, f.tracking_url, f.tracking_status, f.shipped_at,
                f.delivered_at, d.status as delivery_status, d.checkpoint, d.exception, d.last_event_at,
                d.estimated_delivery
         from fulfilments f left join deliveries d on d.fulfilment_id = f.id
         where f.order_id = ${id} order by f.shipped_at nulls last, f.id`
      const work = yield* sql<{
        id: string
        name: string
        state: string
        forwardedAt: Date | null
        work: string | null
        acceptedAt: Date | null
        handoffBy: Date | null
        shippedAt: Date | null
      }>`select s.id, s.name, f.state, f.forwarded_at, w.status as work, w.accepted_at, w.handoff_by, w.shipped_at
         from forwarding_items f join suppliers s on s.id = f.supplier_id
         left join supplier_work w on w.order_id = f.order_id and w.supplier_id = f.supplier_id
         where f.order_id = ${id} and f.state <> 'cancelled'
         order by f.forwarded_at nulls last, s.name, s.id`
      const refunds = yield* sql<{
        id: string
        amountMinor: string
        currency: string
        note: string | null
        status: "pending" | "succeeded" | "failed"
        createdAt: Date
      }>`select id, amount_minor, currency, note, status, created_at from refunds where order_id = ${id}
         order by created_at`
      const [internal] = yield* sql<{ body: string; updatedAt: Date; updatedBy: string | null }>`
        select n.body, n.updated_at, u.name as updated_by from order_notes n
        left join members m on m.id = n.updated_by left join auth."user" u on u.id = m.user_id
        where n.order_id = ${id}`
      return new OrderDetail({
        order: toRow(row),
        customer: customer === undefined
          ? null
          : { ...customer, lifetimeValueMinor: Number(customer.lifetimeValueMinor) },
        subtotalMinor: Number(row.subtotalMinor),
        shippingMinor: Number(row.shippingMinor),
        taxMinor: Number(row.taxMinor),
        discountsMinor: Number(row.discountsMinor),
        paymentGateway: row.paymentGateway,
        cardLast4: row.cardLast4,
        shippingAddress: row.shippingAddress,
        note: row.note,
        internalNote: internal === undefined
          ? null
          : { body: internal.body, updatedAt: internal.updatedAt.getTime(), updatedBy: internal.updatedBy },
        channel: row.channel,
        paidAt: ms(row.paidAt),
        shippedAt: ms(row.shippedAt),
        cancelledAt: ms(row.cancelledAt),
        refundedAt: ms(row.refundedAt),
        lines: lines.map((l) => ({ ...l, unitPriceMinor: Number(l.unitPriceMinor) })),
        fulfilments: fulfilments.map((f) => ({
          id: f.id,
          status: f.status,
          carrier: f.carrier,
          trackingNumber: f.trackingNumber,
          trackingUrl: f.trackingUrl,
          trackingStatus: f.trackingStatus,
          shippedAt: ms(f.shippedAt),
          deliveredAt: ms(f.deliveredAt),
          delivery: f.deliveryStatus === null ? null : {
            status: f.deliveryStatus,
            checkpoint: f.checkpoint,
            exception: f.exception,
            lastEventAt: ms(f.lastEventAt),
            estimatedDelivery: ms(f.estimatedDelivery)
          }
        })),
        refunds: refunds.map((r) => ({ ...r, amountMinor: Number(r.amountMinor), createdAt: r.createdAt.getTime() })),
        supplierWork: work.map((w) => ({
          id: w.id,
          name: w.name,
          state: w.state,
          forwardedAt: ms(w.forwardedAt),
          work: w.work,
          acceptedAt: ms(w.acceptedAt),
          handoffBy: ms(w.handoffBy),
          shippedAt: ms(w.shippedAt),
          late: w.handoffBy !== null && w.handoffBy.getTime() < Date.now() &&
            (w.work === "to_accept" || w.work === "to_ship" || w.work === "problem")
        }))
      })
    })
  )
})

/** Orders per status inside the role's stores: the panel's counts (M6.4). */
export const statusCounts = Effect.fn("Orders.statusCounts")(function*() {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const rows = yield* sql<{ status: string; n: number }>`
        select o.status, count(*)::int as n from orders o where ${scope} group by o.status`
      return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>
    })
  )
})

/** Up to `limit` matches for `Search.records`; nothing for a role without the area. */
export const search = Effect.fn("Orders.search")(function*(q: string, limit: number) {
  const allowed = yield* Policy.require("orders", 1).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )
  if (!allowed || q.trim() === "") return [] as Array<SearchHit>
  const db = yield* Db
  const pattern = likePattern(q)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const rows = yield* sql<{ id: string; title: string; subtitle: string | null }>`
        select o.id, o.number as title, o.customer_name as subtitle from orders o
        where ${scope} and (o.number ilike ${pattern} or o.customer_name ilike ${pattern} or o.customer_email ilike ${pattern})
        order by o.placed_at desc limit ${limit}`
      return rows.map((r) =>
        new SearchHit({ kind: "order", id: r.id, title: r.title, subtitle: r.subtitle, href: `/orders/${r.id}` })
      )
    })
  )
})
