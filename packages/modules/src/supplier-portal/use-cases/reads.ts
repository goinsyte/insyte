import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OrdersListInput, QualityListInput } from "../domain/Inputs.ts"
import {
  CurrentSupplierContact,
  type ProblemKind,
  type ShipTo,
  SupplierCheckRow,
  SupplierDashboard,
  SupplierMe,
  SupplierOrderDetail,
  SupplierOrderList,
  type SupplierOrderRow,
  SupplierProductDetail,
  SupplierProductList
} from "../domain/Portal.ts"
import { availableSql, countsOf, inView, orderRows, productRows } from "./queries.ts"

/*
 * The portal's reads (M16 step 2): who the contact is and for which brand, the dashboard, the orders and the products.
 * As the contact, through the supplier views: an order or a product that is not the supplier's does not exist (404,
 * never 403), and nothing the brand keeps to itself is in what comes back.
 */

export const me = Effect.fn("SupplierPortal.me")(function*() {
  const contact = yield* CurrentSupplierContact
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [workspace] = yield* sql<{ id: string; name: string; logoFileId: string | null }>`
        select id, name, logo_file_id from partner_workspace_v`
      const [supplier] = yield* sql<{ timezone: string }>`select timezone from supplier_self_v`
      return new SupplierMe({
        contact: { id: contact.contactId, name: contact.contactName, role: contact.role, scopes: contact.scopes },
        supplier: { id: contact.supplierId, name: contact.supplierName, timezone: supplier?.timezone ?? "UTC" },
        workspace: {
          id: workspace?.id ?? "",
          name: workspace?.name ?? contact.workspaceName,
          logoFileId: workspace?.logoFileId ?? null
        }
      })
    })
  )
})

const RANK: Record<string, number> = { late: 0, today: 1 }

/** "Eerst dit": late first, then today, then what waits to be accepted, then the rest; each by hand-off. */
const ranked = (rows: ReadonlyArray<SupplierOrderRow>) =>
  [...rows].sort((a, b) =>
    (RANK[a.due] ?? (a.status === "to_accept" ? 2 : 3)) - (RANK[b.due] ?? (b.status === "to_accept" ? 2 : 3)) ||
    (a.handoffBy ?? Infinity) - (b.handoffBy ?? Infinity)
  )

export const listOrders = Effect.fn("SupplierPortal.orders.list")(function*(input: OrdersListInput) {
  const db = yield* Db
  const all = yield* db.scopedPartner((sql) =>
    orderRows(sql, input.productId === undefined ? {} : { productId: input.productId })
  )
  const view = input.view ?? "all"
  const rows = all.filter((r) => inView(r, view))
  return new SupplierOrderList({
    rows: input.limit === undefined ? rows : rows.slice(0, input.limit),
    counts: countsOf(all)
  })
})

interface DetailSql {
  readonly acceptedAt: Date | null
  readonly shipTo: ShipTo
  readonly supplierNote: string | null
  readonly problemKind: ProblemKind | null
  readonly problemNote: string | null
  readonly problemNewDate: string | null
  readonly problemReportedAt: Date | null
  readonly problemResolvedAt: Date | null
  readonly shippedAt: Date | null
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly trackingUrl: string | null
}

export const getOrder = Effect.fn("SupplierPortal.orders.get")(function*(orderId: string) {
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [row] = yield* orderRows(sql, { ids: [orderId] })
      const [d] = yield* sql<DetailSql>`
        select accepted_at, ship_to, supplier_note, problem_kind, problem_note, to_char(problem_new_date, 'YYYY-MM-DD')
               as problem_new_date, problem_reported_at, problem_resolved_at, shipped_at, carrier, tracking_number,
               tracking_url
        from supplier_orders_v where id = ${orderId}`
      if (row === undefined || d === undefined) return yield* new NotFound({ entity: "order", id: orderId })
      const problem = d.problemKind !== null && d.problemReportedAt !== null && d.problemResolvedAt === null
        ? {
          kind: d.problemKind,
          note: d.problemNote ?? "",
          newDate: d.problemNewDate,
          at: d.problemReportedAt.getTime()
        }
        : null
      const parcel = d.trackingNumber !== null && d.shippedAt !== null
        ? { carrier: d.carrier, tracking: d.trackingNumber, url: d.trackingUrl, at: d.shippedAt.getTime() }
        : null
      return new SupplierOrderDetail({
        row,
        acceptedAt: d.acceptedAt?.getTime() ?? null,
        shipTo: d.shipTo,
        note: d.supplierNote,
        problem,
        parcel,
        events: [
          { kind: "placed" as const, at: row.placedAt },
          ...(d.acceptedAt === null ? [] : [{ kind: "accepted" as const, at: d.acceptedAt.getTime() }]),
          ...(d.problemKind === null || d.problemReportedAt === null
            ? []
            : [{ kind: "problem_reported" as const, at: d.problemReportedAt.getTime(), problem: d.problemKind }]),
          ...(parcel === null
            ? []
            : [{ kind: "shipped" as const, at: parcel.at, carrier: parcel.carrier, tracking: parcel.tracking }])
        ].sort((a, b) => a.at - b.at)
      })
    })
  )
})

export const listProducts = Effect.fn("SupplierPortal.products.list")(function*() {
  const db = yield* Db
  return new SupplierProductList({ rows: yield* db.scopedPartner((sql) => productRows(sql)) })
})

export const getProduct = Effect.fn("SupplierPortal.products.get")(function*(productId: string) {
  const db = yield* Db
  return yield* db.scopedPartner((sql) => productDetail(sql, productId))
})

/** One product with its variants' counts and the open orders that wait for it; `NotFound` when it is not theirs. */
export const productDetail = (sql: SqlClient.SqlClient, productId: string) =>
  Effect.gen(function*() {
    const [row] = yield* productRows(sql, [productId])
    if (row === undefined) return yield* new NotFound({ entity: "product", id: productId })
    const [images] = yield* sql<{ images: ReadonlyArray<string> }>`
      select images from supplier_products_v where id = ${productId}`
    const variants = yield* sql<
      { id: string; title: string; sku: string | null; available: number; reportedAt: Date | null }
    >`
      select v.id, v.title, v.sku, ${availableSql(sql, "v.id")} as available,
             (select max(il.reported_at) from inventory_levels il where il.variant_id = v.id and il.source = 'supplier')
               as reported_at
      from supplier_variants_v v where v.product_id = ${productId} order by v.position, v.id`
    const waiting = (yield* orderRows(sql, { productId })).filter((o) =>
      o.status === "to_accept" || o.status === "to_ship"
    ).slice(0, 6)
    return new SupplierProductDetail({
      row,
      images: images?.images ?? [],
      variants: variants.map((v) => ({ ...v, reportedAt: v.reportedAt?.getTime() ?? null })),
      waiting: waiting.map((o) => ({
        id: o.id,
        number: o.number,
        quantity: o.lines.filter((l) => l.productId === productId).reduce((n, l) => n + l.quantity, 0),
        handoffBy: o.handoffBy
      }))
    })
  })

interface CheckSql {
  readonly id: string
  readonly productId: string
  readonly productTitle: string
  readonly kind: SupplierCheckRow["kind"]
  readonly status: SupplierCheckRow["status"]
  readonly variants: ReadonlyArray<string>
  readonly deliverables: ReadonlyArray<string>
  readonly dueAt: Date
  readonly note: string
  readonly submittedAt: Date | null
  readonly decisionNote: string | null
}

export const listChecks = Effect.fn("SupplierPortal.quality.list")(function*(input: QualityListInput) {
  const db = yield* Db
  const rows = yield* db.scopedPartner((sql) =>
    sql<CheckSql>`
      select q.id, q.product_id, p.title as product_title, q.kind, q.status, q.variants, q.deliverables, q.due_at,
             q.note, q.submitted_at, q.decision_note
      from supplier_checks_v q join supplier_products_v p on p.id = q.product_id
      where ${input.productId === undefined ? sql`true` : sql`q.product_id = ${input.productId}`}
      order by q.requested_at desc, q.id`
  )
  return rows.map((c) =>
    new SupplierCheckRow({
      id: c.id,
      productId: c.productId,
      productTitle: c.productTitle,
      kind: c.kind,
      status: c.status,
      variants: c.variants,
      deliverables: c.deliverables,
      dueAt: c.dueAt.getTime(),
      note: c.note,
      submittedAt: c.submittedAt?.getTime() ?? null,
      rejection: c.status === "rejected" ? c.decisionNote : null
    })
  )
})

const DAY = 86_400_000

/** How many days after its deadline a parcel was handed over; 0 on time. */
const lateDays = (h: { readonly shippedAt: Date; readonly handoffBy: Date | null }) =>
  h.handoffBy === null ? 0 : Math.max(0, (h.shippedAt.getTime() - h.handoffBy.getTime()) / DAY)

export const dashboard = Effect.fn("SupplierPortal.dashboard")(function*() {
  const db = yield* Db
  const checks = yield* listChecks({})
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const orders = yield* orderRows(sql)
      const counts = countsOf(orders)
      const products = yield* productRows(sql)
      const handed = yield* sql<{ shippedAt: Date; handoffBy: Date | null }>`
        select shipped_at, handoff_by from supplier_orders_v
        where shipped_at is not null and shipped_at > now() - interval '56 days'`
      const now = Date.now()
      const recent = handed.filter((h) => h.shippedAt.getTime() > now - 30 * DAY)
      const late = recent.filter((h) => lateDays(h) > 0)
      const weeks = Array.from({ length: 8 }, (_, i) => {
        const end = now - (7 - i) * 7 * DAY
        const inWeek = handed.filter((h) => h.shippedAt.getTime() <= end && h.shippedAt.getTime() > end - 7 * DAY)
        return {
          end: new Date(end).toISOString().slice(0, 10),
          parcels: inWeek.length,
          late: inWeek.filter((h) => lateDays(h) > 0).length
        }
      })
      return new SupplierDashboard({
        figures: {
          toAccept: counts.toAccept,
          today: counts.today,
          late: counts.late,
          problemsOpen: counts.problem,
          totalOrders: counts.all
        },
        work: ranked(orders.filter((o) => inView(o, "open"))).slice(0, 7),
        lowStock: products.filter((p) => p.stock !== "in_stock").sort((a, b) => a.units - b.units).slice(0, 4),
        checks: checks.filter((c) => c.status === "requested" || c.status === "rejected"),
        performance: {
          weeks,
          parcels30d: recent.length,
          onTime30dPct: recent.length === 0 ? null : Math.round(((recent.length - late.length) / recent.length) * 100),
          avgDaysLate: late.length === 0
            ? null
            : Math.round((late.reduce((n, h) => n + lateDays(h), 0) / late.length) * 10) / 10
        }
      })
    })
  )
})
