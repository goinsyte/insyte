import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OrderRow } from "../../orders/domain/Orders.ts"
import type { ListInput } from "../../shared/domain/Filter.ts"
import { likePattern, SearchHit } from "../../shared/domain/Search.ts"
import { compileFilter, decodeCursor, encodeCursor, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { CustomerDetail, CustomerPage, CustomerRow } from "../domain/Customers.ts"
import { KlaviyoSyncs } from "../domain/Ports.ts"

/*
 * `Customers.list` and `Customers.get` (M6.4): at `customers` Bekijken, inside the role's stores; a customer Shopify
 * deleted or a privacy request cleared is not listed, nor one merged into another (M7.4), whose orders and value the
 * survivor counts. By name, keyset on `(lower(name), id)`; the search matches the name, the email and the phone.
 */

export const CUSTOMER_FIELDS: Whitelist = {
  store_id: { column: "c.store_id", type: "option" },
  country: { column: "c.country", type: "option" },
  name: { column: "c.name", type: "text" },
  email: { column: "c.email", type: "text" },
  orders_count: { column: "c.orders_count", type: "number" },
  lifetime_value: { column: "c.lifetime_value_minor", type: "number", scale: 100 },
  tags: { column: "c.tags", type: "tags" }
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
  const after = yield* decodeCursor(input.cursor)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id", input.storeId)
      const filter = yield* compileFilter(sql, input.filter, CUSTOMER_FIELDS)
      const search = searchOf(sql, input.q)
      const page = after === undefined
        ? sql`true`
        : sql`(lower(c.name), c.id) > (${String(after[0])}, ${String(after[1])})`
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from customers c
        where c.deleted_at is null and c.merged_into is null and ${scope} and ${filter} and ${search} and ${page}
        order by lower(c.name), c.id limit ${limit + 1}`
      const [total] = yield* sql<{ n: number }>`
        select count(*)::int as n from customers c
        where c.deleted_at is null and c.merged_into is null and ${scope} and ${filter} and ${search}`
      const shown = rows.slice(0, limit)
      const last = shown.at(-1)
      return new CustomerPage({
        rows: shown.map(toRow),
        nextCursor: rows.length > limit && last !== undefined ? encodeCursor([last.name.toLowerCase(), last.id]) : null,
        counts: { total: total?.n ?? 0 }
      })
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
