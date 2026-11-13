import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  CurrentSupplierContact,
  type Due,
  type OrderCounts,
  type PortalScope,
  ScopeMissing,
  type StockReporting,
  type StockState,
  type SupplierLine,
  SupplierOrderRow,
  SupplierProductRow,
  type SupplierStatus,
  type SupplierView
} from "../domain/Portal.ts"

/*
 * What the portal's use cases share: the scope check, the order and product rows read from the supplier views
 * (`supplier_orders_v`, `supplier_lines_v`, `supplier_products_v`, 0075) as the contact, and the audit line with its
 * frame to the supplier's own room. Every statement here runs inside `Db.scopedPartner`, so RLS holds it to the
 * supplier's projection whatever the SQL asks.
 */

/** The brand opened `scope` to the contact, or `ScopeMissing`. */
export const requireScope = Effect.fn("SupplierPortal.requireScope")(function*(scope: PortalScope) {
  const contact = yield* CurrentSupplierContact
  if (scope !== "orders" && !contact.scopes.includes(scope)) return yield* new ScopeMissing({ scope })
})

interface OrderRowSql {
  readonly id: string
  readonly number: string
  readonly orderStatus: string
  readonly workStatus: SupplierStatus
  readonly legState: string | null
  readonly handoffBy: Date | null
  readonly placedAt: Date
  readonly due: Due
  readonly currency: string
  readonly city: string
  readonly country: string
  readonly lines: ReadonlyArray<SupplierLine>
}

/** The status the supplier sees (domain.md §12.2): a closed order is closed; a leg the brand confirmed is to ship. */
export const statusOf = (r: Pick<OrderRowSql, "orderStatus" | "workStatus" | "legState">): SupplierStatus =>
  r.orderStatus === "cancelled" || r.orderStatus === "refunded"
    ? "closed"
    : r.workStatus === "to_accept" && r.legState === "confirmed"
    ? "to_ship"
    : r.workStatus

const OPEN = new Set<SupplierStatus>(["to_accept", "to_ship", "problem"])

/** Which rows a view holds; the area panel's counts and the list's cut are the same rule. */
export const inView = (r: SupplierOrderRow, view: SupplierView): boolean =>
  view === "all"
    ? true
    : view === "open"
    ? OPEN.has(r.status)
    : view === "late"
    ? (r.status === "to_accept" || r.status === "to_ship") && r.due === "late"
    : r.status === view

export const countsOf = (rows: ReadonlyArray<SupplierOrderRow>): OrderCounts => ({
  toAccept: rows.filter((r) => inView(r, "to_accept")).length,
  toShip: rows.filter((r) => inView(r, "to_ship")).length,
  late: rows.filter((r) => inView(r, "late")).length,
  today: rows.filter((r) => (r.status === "to_accept" || r.status === "to_ship") && r.due === "today").length,
  problem: rows.filter((r) => inView(r, "problem")).length,
  shipped: rows.filter((r) => inView(r, "shipped")).length,
  all: rows.length
})

const rowOf = (r: OrderRowSql): SupplierOrderRow => {
  const status = statusOf(r)
  const costed = r.lines.filter((l) => l.unitCostMinor !== null)
  return new SupplierOrderRow({
    id: r.id,
    number: r.number,
    status,
    due: r.due,
    handoffBy: r.handoffBy?.getTime() ?? null,
    placedAt: r.placedAt.getTime(),
    lines: r.lines,
    units: r.lines.reduce((n, l) => n + l.quantity, 0),
    amountMinor: costed.reduce((n, l) => n + (l.unitCostMinor ?? 0) * l.quantity, 0),
    costMissing: costed.length < r.lines.length,
    currency: r.currency,
    city: r.city,
    country: r.country
  })
}

/** Where a deadline falls against the supplier's own today: late, today, within three days, or later. */
const dueSql = (sql: SqlClient.SqlClient) =>
  sql`case
        when o.handoff_by is null then 'later'
        when o.handoff_by < (date_trunc('day', now() at time zone s.timezone) at time zone s.timezone) then 'late'
        when o.handoff_by < ((date_trunc('day', now() at time zone s.timezone) + interval '1 day')
                             at time zone s.timezone) then 'today'
        when o.handoff_by < ((date_trunc('day', now() at time zone s.timezone) + interval '3 days')
                             at time zone s.timezone) then 'soon'
        else 'later' end`

/** The supplier's orders, soonest hand-off first; `ids` narrows to those. */
export const orderRows = (
  sql: SqlClient.SqlClient,
  filter: { readonly ids?: ReadonlyArray<string>; readonly productId?: string } = {}
) =>
  Effect.map(
    sql<OrderRowSql>`
      select o.id, o.number, o.order_status, o.work_status, o.handoff_by, o.placed_at, o.currency,
             coalesce(o.ship_to ->> 'city', '') as city, coalesce(o.ship_to ->> 'country', '') as country,
             ${dueSql(sql)} as due,
             (select f.state from forwarding_items f
              where f.order_id = o.id and f.supplier_id = o.supplier_id and f.state <> 'cancelled'
              order by f.created_at desc limit 1) as leg_state,
             coalesce((select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'productId', l.product_id, 'variantId', l.variant_id, 'sku', l.sku, 'title', l.title,
                 'variantTitle', l.variant_title, 'quantity', l.quantity, 'unitCostMinor', l.unit_cost_minor,
                 'image', l.image) order by l.id)
               from supplier_lines_v l where l.order_id = o.id), '[]'::jsonb) as lines
      from supplier_orders_v o join supplier_self_v s on s.id = o.supplier_id
      where ${filter.ids === undefined ? sql`true` : sql`o.id in ${sql.in([...filter.ids, ""])}`}
        and ${
      filter.productId === undefined
        ? sql`true`
        : sql`exists (select 1 from supplier_lines_v l where l.order_id = o.id and l.product_id = ${filter.productId})`
    }
      order by o.handoff_by asc nulls last, o.placed_at, o.id`,
    (rows) => rows.map(rowOf)
  )

interface ProductRowSql {
  readonly id: string
  readonly title: string
  readonly image: string | null
  readonly variants: number
  readonly units: number
  readonly lowest: number | null
  readonly openOrders: number
  readonly leadDays: number
  readonly reporting: StockReporting
}

/** Sold out at none; low under 60 units or with a variant at none (`lib/catalog.ts`'s rule). */
export const stockOf = (units: number, lowest: number | null): StockState =>
  units <= 0 ? "out" : units < 60 || (lowest !== null && lowest <= 0) ? "low" : "in_stock"

/** A variant's count: what the supplier reported, else what the store holds over its locations. */
export const availableSql = (sql: SqlClient.SqlClient, variant: string) =>
  sql`coalesce(
        (select il.available from inventory_levels il
         where il.variant_id = ${sql.literal(variant)} and il.source = 'supplier' order by il.reported_at desc limit 1),
        (select sum(il.available)::int from inventory_levels il
         where il.variant_id = ${sql.literal(variant)} and il.source = 'shopify'),
        0)`

/** The supplier's products (not archived), by title; `ids` narrows to those. */
export const productRows = (sql: SqlClient.SqlClient, ids?: ReadonlyArray<string>) =>
  Effect.map(
    sql<ProductRowSql>`
      select p.id, p.title, p.images[1] as image, p.lead_days, p.stock_reporting as reporting,
             (select count(*)::int from supplier_variants_v v where v.product_id = p.id) as variants,
             coalesce((select sum(${
      availableSql(sql, "v.id")
    })::int from supplier_variants_v v where v.product_id = p.id), 0)
               as units,
             (select min(${
      availableSql(sql, "v.id")
    })::int from supplier_variants_v v where v.product_id = p.id) as lowest,
             (select count(distinct o.id)::int from supplier_orders_v o join supplier_lines_v l on l.order_id = o.id
              where l.product_id = p.id and o.work_status in ('to_accept', 'to_ship')
                and o.order_status not in ('cancelled', 'refunded')) as open_orders
      from supplier_products_v p
      where ${ids === undefined ? sql`true` : sql`p.id in ${sql.in([...ids, ""])}`}
      order by p.title, p.id`,
    (rows) =>
      rows.map((r) =>
        new SupplierProductRow({
          id: r.id,
          title: r.title,
          image: r.image,
          variants: r.variants,
          units: r.units,
          stock: stockOf(r.units, r.lowest),
          openOrders: r.openOrders,
          leadDays: r.leadDays,
          reporting: r.reporting
        })
      )
  )

/**
 * The contact's audit line on the brand's record (it reads as "Leverancier" in the Logboek), and the frame that tells
 * the supplier's other tabs to refetch `kind`. The brand's tabs hear the audit's own `records.changed`.
 */
export const record = Effect.fn("SupplierPortal.record")(function*(
  sql: SqlClient.SqlClient,
  entry: {
    readonly action: string
    readonly subjectType: "order" | "product" | "quality_check"
    readonly subjectIds: ReadonlyArray<string>
    readonly kind: "supplier_orders" | "supplier_products" | "quality_checks"
    readonly diff?: Record<string, unknown>
  }
) {
  const principal = yield* CurrentPrincipal
  const supplierId = principal.partnerId ?? ""
  for (const id of entry.subjectIds) {
    yield* Audit.write(sql, principal.workspaceId, { kind: "supplier_contact", id: principal.id }, {
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: id,
      diff: { supplier: supplierId, ...entry.diff }
    })
  }
  const frame = yield* Outbox.write(sql, principal.workspaceId, {
    type: "partner.changed",
    workspaceId: principal.workspaceId,
    supplierId,
    kind: entry.kind,
    ids: [...entry.subjectIds]
  })
  ;(yield* PendingEvents)?.add(frame)
})
