import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OrderRow } from "../../orders/domain/Orders.ts"
import type { ListInput } from "../../shared/domain/Filter.ts"
import { likePattern, SearchHit } from "../../shared/domain/Search.ts"
import { compileFilter, keyset, type Sorts, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  type CustomerCounts,
  CustomerDetail,
  CustomerPage,
  CustomerRow,
  NEW_UP_TO_ORDERS
} from "../domain/Customers.ts"
import { KlaviyoSyncs } from "../domain/Ports.ts"

/*
 * `Customers.list` and `Customers.get` (M6.4): at `customers` Bekijken, inside the role's stores; a customer Shopify
 * deleted or a privacy request cleared is not listed, nor one merged into another (M7.4), whose orders and value the
 * survivor counts. By name unless sorted (`CUSTOMER_SORTS`), keyset on the sort key and the id; the search matches the
 * name, the email and the phone. Orders and value count the merged profiles in, in the filter and the order as in the
 * row.
 */

const ORDERS =
  "(c.orders_count + coalesce((select sum(m.orders_count) from customers m where m.merged_into = c.id), 0))"
const LIFETIME =
  "(c.lifetime_value_minor + coalesce((select sum(m.lifetime_value_minor) from customers m where m.merged_into = c.id), 0))"
const AOV = `case when ${ORDERS} > 0 then ${LIFETIME}::numeric / ${ORDERS} else 0 end`
/** "Laatste bestelling" as the console shows it: the newest order Insyte holds, else when Shopify last changed them. */
const LAST_ORDER = "coalesce((select max(o.placed_at) from orders o where o.customer_id = c.id), c.external_updated_at)"

export const CUSTOMER_FIELDS: Whitelist = {
  store_id: { column: "c.store_id", type: "option" },
  country: { column: "c.country", type: "option" },
  name: { column: "c.name", type: "text" },
  email: { column: "c.email", type: "text" },
  orders_count: { column: "c.orders_count", type: "number" },
  lifetime_value: { column: "c.lifetime_value_minor", type: "number", scale: 100 },
  tags: { column: "c.tags", type: "tags" },
  // What the console's columns read (widgets/03): the profile by name and address, its id (the duplicates' cut),
  // orders, value and average order with its merged profiles counted in, the newest order.
  id: { column: "c.id", type: "option" },
  customer: { column: "c.name || ' ' || coalesce(c.email, '')", type: "text" },
  orders: { column: ORDERS, type: "number" },
  lifetime: { column: LIFETIME, type: "number", scale: 100 },
  aov: { column: AOV, type: "number", scale: 100 },
  last_order: { column: LAST_ORDER, type: "date" }
}

/** What the list sorts by. */
export const CUSTOMER_SORTS: Sorts = {
  fields: {
    name: { column: "c.name", type: "text", required: true },
    email: { column: "c.email", type: "text" },
    country: { column: "c.country", type: "text" },
    orders: { column: ORDERS, type: "number", required: true },
    lifetime: { column: LIFETIME, type: "number", required: true },
    aov: { column: AOV, type: "number", required: true },
    last_order: { column: LAST_ORDER, type: "date", required: true }
  },
  default: { field: "name", desc: false },
  id: "c.id"
}

export interface Row {
  readonly id: string
  readonly storeId: string
  readonly shopifyId: string
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly country: string | null
  readonly tags: ReadonlyArray<string>
  readonly ordersCount: number
  readonly lifetimeValueMinor: string
  readonly currency: string | null
  readonly lastOrderAt: Date | null
  readonly externalUpdatedAt: Date
}

export const toRow = (r: Row) =>
  new CustomerRow({
    id: r.id,
    storeId: r.storeId,
    shopifyId: r.shopifyId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    country: r.country,
    tags: r.tags,
    ordersCount: r.ordersCount,
    lifetimeValueMinor: Number(r.lifetimeValueMinor),
    currency: r.currency ?? "EUR",
    lastOrderAt: r.lastOrderAt?.getTime() ?? null,
    updatedAt: r.externalUpdatedAt.getTime()
  })

export const SELECT = `c.id, c.store_id, c.shopify_id, c.name, c.email, c.phone, c.country, c.tags,
  c.orders_count + coalesce((select sum(m.orders_count) from customers m where m.merged_into = c.id), 0)::int
    as orders_count,
  c.lifetime_value_minor + coalesce((select sum(m.lifetime_value_minor) from customers m where m.merged_into = c.id), 0)
    as lifetime_value_minor,
  c.currency, c.external_updated_at,
  (select max(o.placed_at) from orders o where o.customer_id = c.id) as last_order_at`

const searchOf = (sql: SqlClient.SqlClient, q: string | undefined) => {
  const text = q?.trim() ?? ""
  if (text === "") return sql`true`
  const pattern = `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  return sql`(c.name ilike ${pattern} or c.email ilike ${pattern} or c.phone ilike ${pattern})`
}

export const list = Effect.fn("Customers.list")(function*(input: ListInput) {
  yield* Policy.require("customers", 1)
  const db = yield* Db
  const limit = input.limit ?? 50
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id", input.storeId)
      const filter = yield* compileFilter(sql, input.filter, CUSTOMER_FIELDS)
      const order = yield* keyset(sql, input, CUSTOMER_SORTS)
      const search = searchOf(sql, input.q)
      const listed = sql`c.deleted_at is null and c.merged_into is null`
      const rows = yield* sql<Row & { sortKey: string }>`
        select ${sql.literal(SELECT)}, ${order.key} from customers c
        where ${listed} and ${scope} and ${filter} and ${search} and ${order.after}
        ${order.order} limit ${limit + 1}`
      const [total] = yield* sql<{ n: number }>`
        select count(*)::int as n from customers c where ${listed} and ${scope} and ${filter} and ${search}`
      const [facets] = yield* sql<{ new: number; returning: number }>`
        select count(*) filter (where ${sql.literal(ORDERS)} <= ${NEW_UP_TO_ORDERS})::int as new,
               count(*) filter (where ${sql.literal(ORDERS)} > ${NEW_UP_TO_ORDERS})::int as returning
        from customers c where ${listed} and ${scope} and ${search}`
      const shown = rows.slice(0, limit)
      const last = shown.at(-1)
      return new CustomerPage({
        rows: shown.map(toRow),
        nextCursor: rows.length > limit && last !== undefined ? order.cursorOf(last) : null,
        counts: { total: total?.n ?? 0, new: facets?.new ?? 0, returning: facets?.returning ?? 0 }
      })
    })
  )
})

/**
 * The panel's counts alone, for the frame (ADR-0028): the listed profiles (not deleted, not merged away) in the
 * principal's stores, new up to `NEW_UP_TO_ORDERS` orders and returning after, their merged profiles' orders counted
 * in as the list counts them.
 */
export const counts = Effect.fn("Customers.panelCounts")(function*() {
  yield* Policy.require("customers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id")
      const [row] = yield* sql<{ new: number; returning: number }>`
        select count(*) filter (where x.n <= ${NEW_UP_TO_ORDERS})::int as new,
               count(*) filter (where x.n > ${NEW_UP_TO_ORDERS})::int as returning
        from (select c.orders_count + coalesce(m.n, 0) as n from customers c
              left join (select merged_into, sum(orders_count) as n from customers
                         where merged_into is not null group by merged_into) m on m.merged_into = c.id
              where c.deleted_at is null and c.merged_into is null and ${scope}) x`
      return { new: row?.new ?? 0, returning: row?.returning ?? 0 } satisfies CustomerCounts
    })
  )
})

export const get = Effect.fn("Customers.get")(function*(id: string) {
  yield* Policy.require("customers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id")
      const [row] = yield* sql<
        Row & {
          address: CustomerDetail["address"]
          marketingConsent: boolean
          intoId: string | null
          intoName: string | null
        }
      >`
        select ${sql.literal(SELECT)}, c.address, c.marketing_consent, s.id as into_id, s.name as into_name
        from customers c left join customers s on s.id = c.merged_into
        where c.id = ${id} and c.deleted_at is null and ${scope}`
      if (row === undefined) return yield* new NotFound({ entity: "customer", id })
      const orders = yield* sql<
        {
          id: string
          number: string
          status: string
          paymentStatus: OrderRow["paymentStatus"]
          fulfillmentStatus: OrderRow["fulfillmentStatus"]
          totalMinor: string
          currency: string
          placedAt: Date
        }
      >`
        select id, number, status, payment_status, fulfillment_status, total_minor, currency, placed_at from orders
        where customer_id = ${id}
        order by placed_at desc limit 50`
      const klaviyo = yield* (yield* KlaviyoSyncs).lastSyncOf(sql, id)
      const absorbed = yield* sql<{ email: string | null }>`
        select email from customers where merged_into = ${id} order by merged_at`
      return new CustomerDetail({
        customer: toRow(row),
        address: row.address,
        marketingConsent: row.marketingConsent,
        klaviyo,
        merged: {
          into: row.intoId === null ? null : { id: row.intoId, name: row.intoName ?? "" },
          absorbed: absorbed.length,
          alsoEmails: [
            ...new Set(absorbed.flatMap((a) => (a.email === null || a.email === row.email ? [] : [a.email])))
          ]
        },
        orders: orders.map((o) => ({ ...o, totalMinor: Number(o.totalMinor), placedAt: o.placedAt.getTime() }))
      })
    })
  )
})

/** Up to `limit` matches for `Search.records`; nothing for a role without the area. */
export const search = Effect.fn("Customers.search")(function*(q: string, limit: number) {
  const allowed = yield* Policy.require("customers", 1).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )
  if (!allowed || q.trim() === "") return [] as Array<SearchHit>
  const db = yield* Db
  const pattern = likePattern(q)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id")
      const rows = yield* sql<{ id: string; title: string; subtitle: string | null }>`
        select c.id, c.name as title, c.email as subtitle from customers c
        where c.deleted_at is null and c.merged_into is null and ${scope}
          and (c.name ilike ${pattern} or c.email ilike ${pattern})
        order by lower(c.name) limit ${limit}`
      return rows.map((r) =>
        new SearchHit({ kind: "customer", id: r.id, title: r.title, subtitle: r.subtitle, href: `/customers/${r.id}` })
      )
    })
  )
})
