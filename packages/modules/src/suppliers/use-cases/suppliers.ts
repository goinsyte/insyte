import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { type ListInput, SupplierDetail, SupplierList, SupplierRow } from "../domain/Suppliers.ts"

/*
 * `Suppliers.list` and `Suppliers.get` (M8.1), at `suppliers` Bekijken. Suppliers belong to the workspace; the figures
 * beside them count only the orders and products in the role's stores. A line's supplier is its product's primary
 * `product_supply` row, the one rule (M8).
 */

const CLOSED = "('cancelled', 'refunded')"

interface Row {
  readonly id: string
  readonly name: string
  readonly contactEmail: string | null
  readonly contactPhone: string | null
  readonly description: string
  readonly status: SupplierRow["status"]
  readonly pausedAt: Date | null
  readonly autoForward: boolean
  readonly forwardChannel: SupplierRow["forwardChannel"]
  readonly forwardEmail: string | null
  readonly confirmWithinHours: number
  readonly defaultLeadDays: number
  readonly stockMode: SupplierRow["stockMode"]
  readonly vendor: string | null
  readonly apiConnected: boolean
  readonly apiUrl: string | null
  readonly lastPingOk: boolean | null
  readonly lastPingMs: number | null
  readonly lastPingAt: Date | null
  readonly products: number
  readonly open: number
  readonly delayed: number
  readonly shipped: number
  readonly createdAt: Date
}

const toRow = (r: Row) =>
  new SupplierRow({
    id: r.id,
    name: r.name,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    description: r.description,
    status: r.status,
    pausedAt: r.pausedAt?.getTime() ?? null,
    autoForward: r.autoForward,
    forwardChannel: r.forwardChannel,
    forwardEmail: r.forwardEmail,
    confirmWithinHours: r.confirmWithinHours,
    defaultLeadDays: r.defaultLeadDays,
    stockMode: r.stockMode,
    vendor: r.vendor,
    apiConnected: r.apiConnected,
    api: !r.apiConnected || r.apiUrl === null ? null : {
      url: r.apiUrl,
      lastPing: r.lastPingAt === null
        ? null
        : { ok: r.lastPingOk === true, ms: r.lastPingMs, at: r.lastPingAt.getTime() }
    },
    stats: {
      products: r.products,
      open: r.open,
      delayed: r.delayed,
      shipped: r.shipped,
      onTime: r.shipped + r.delayed === 0 ? null : r.shipped / (r.shipped + r.delayed)
    },
    createdAt: r.createdAt.getTime()
  })

/** The suppliers matching `where`, with their figures inside the role's stores, by name. */
export const rowsWhere = Effect.fn("Suppliers.rowsWhere")(function*(
  sql: SqlClient.SqlClient,
  where: Statement.Fragment
) {
  const products = yield* inScope(sql, "p.store_id")
  const orders = yield* inScope(sql, "o.store_id")
  const rows = yield* sql<Row>`
    select s.id, s.name, s.contact_email, s.contact_phone, s.description, s.status, s.paused_at, s.auto_forward,
           s.forward_channel, s.forward_email, s.confirm_within_hours, s.default_lead_days, s.stock_mode, s.vendor,
           s.created_at,
           coalesce(i.kind = 'custom' and i.enabled, false) as api_connected, i.webhook_url as api_url,
           i.last_ping_ok, i.last_ping_ms, i.last_ping_at,
           (select count(*) from product_supply ps join products p on p.id = ps.product_id
            where ps.supplier_id = s.id and ps.is_primary and ${products})::int as products,
           coalesce(f.open, 0)::int as open, coalesce(f.delayed, 0)::int as delayed,
           coalesce(f.shipped, 0)::int as shipped
    from suppliers s
    left join supplier_integrations i on i.supplier_id = s.id
    left join lateral (
      select count(*) filter (where t.status not in ${sql.literal(CLOSED)} and t.status <> 'delivered') as open,
             count(*) filter (where t.at_risk and t.status not in ${sql.literal(CLOSED)}) as delayed,
             count(*) filter (where t.status in ('shipped', 'delivered') and not t.at_risk) as shipped
      from (select distinct o.id, o.status,
                   'at_risk' = any(o.tags) or exists (
                     select 1 from supplier_work w where w.order_id = o.id and w.supplier_id = s.id
                       and w.status in ('to_accept', 'to_ship', 'problem') and w.handoff_by < now()) as at_risk
            from orders o
            join order_lines l on l.order_id = o.id
            join product_supply ps on ps.product_id = l.product_id and ps.is_primary
            where ps.supplier_id = s.id and ${orders}) t
    ) f on true
    where s.deleted_at is null and ${where}
    order by lower(s.name), s.id`
  return rows.map(toRow)
})

export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  rowsWhere(sql, sql.and([sql`s.id in ${sql.in([...ids])}`]))

export const list = Effect.fn("Suppliers.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("suppliers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const carries = [...new Set(input.carries ?? [])]
      const rows = yield* rowsWhere(
        sql,
        sql.and([
          input.notPaused === true ? sql`s.paused_at is null` : sql`true`,
          carries.length === 0 ? sql`true` : sql`(select count(*) from product_supply c
            where c.supplier_id = s.id and c.product_id in ${sql.in(carries)}) = ${carries.length}`
        ])
      )
      const [late] = yield* sql<{ count: number }>`
        select count(distinct o.id)::int as count
        from orders o
        join order_lines l on l.order_id = o.id
        join product_supply ps on ps.product_id = l.product_id and ps.is_primary
        join suppliers s on s.id = ps.supplier_id and s.deleted_at is null
        where 'at_risk' = any(o.tags) and o.status not in ${sql.literal(CLOSED)} and ${yield* inScope(
        sql,
        "o.store_id"
      )}`
      return new SupplierList({
        rows,
        counts: {
          total: rows.length,
          delayedOrders: late?.count ?? 0,
          liveStock: rows.filter((r) => r.stockMode === "live").length,
          // The portal opens in M16; until then nobody is in it.
          portalActive: 0
        }
      })
    })
  )
})

export const get = Effect.fn("Suppliers.get")(function*(id: string) {
  yield* Policy.require("suppliers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [supplier] = yield* rowsOf(sql, [id])
      if (supplier === undefined) return yield* new NotFound({ entity: "supplier", id })
      const products = yield* sql<{
        id: string
        title: string
        image: string | null
        status: "active" | "draft" | "archived"
        available: number | null
      }>`
        select p.id, p.title, p.images[1] as image, p.status,
               (select sum(i.available) from inventory_levels i join variants v on v.id = i.variant_id
                where v.product_id = p.id and i.source = 'shopify')::int as available
        from product_supply ps join products p on p.id = ps.product_id
        where ps.supplier_id = ${id} and ps.is_primary and ${yield* inScope(sql, "p.store_id")}
        order by lower(p.title), p.id limit 50`
      const delayedOrders = yield* sql<{ id: string; number: string }>`
        select o.id, o.number from orders o
        where 'at_risk' = any(o.tags) and o.status not in ${sql.literal(CLOSED)}
          and ${yield* inScope(sql, "o.store_id")}
          and exists (select 1 from order_lines l join product_supply ps on ps.product_id = l.product_id and ps.is_primary
                      where l.order_id = o.id and ps.supplier_id = ${id})
        order by o.placed_at desc limit 8`
      return new SupplierDetail({ supplier, products, delayedOrders })
    })
  )
})
