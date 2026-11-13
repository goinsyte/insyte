import { Db } from "@insyte/database/Db"
import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import type { AcceptInput, ReportProblemInput, SaveStockInput, SetReportingInput, ShipInput } from "../domain/Inputs.ts"
import { CurrentSupplierContact, StockChange, SupplierOrderChange } from "../domain/Portal.ts"
import { orderRows, productRows, record, requireScope } from "./queries.ts"
import { productDetail } from "./reads.ts"

/*
 * The portal's writes (M16 step 2; widgets/06 Part A "Actions"). Each runs as the contact (`Db.scopedPartner`): it
 * changes the supplier's own work, its leg and its stock, nothing else. What reaches beyond the supplier's projection
 * is done for it: the order's own status by `supplier_order_settle` (0075), which reads every leg; the brand's ticket
 * and notes by the relay as `system`, once the undo window has passed. What leaves Insyte (Shopify's fulfilment with
 * the customer's tracking mail) waits in the outbox until the window has passed, so "Ongedaan maken" cancels it.
 */

/** Each portal command's undo, run by `SupplierPortal.undo` (the compensation registered as `supplier_portal.restore`). */
export const RESTORE = "supplier_portal.restore"

/** A leg and its work as they were, as their own rows' JSON, put back by `restore`. */
const Snap = Schema.Struct({ orderId: Schema.String, work: Schema.Unknown, leg: Schema.NullOr(Schema.Unknown) })

const Restore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("orders"), snaps: Schema.Array(Snap) }),
  Schema.Struct({
    kind: Schema.Literal("stock"),
    productId: Schema.String,
    leadDays: Schema.Int,
    levels: Schema.Array(Schema.Struct({ variantId: Schema.String, available: Schema.NullOr(Schema.Int) }))
  })
])
type Restore = typeof Restore.Type

const snapshot = (sql: SqlClient.SqlClient, supplierId: string, orderIds: ReadonlyArray<string>) =>
  orderIds.length === 0
    ? Effect.succeed([] as Array<typeof Snap.Type>)
    : sql<{ orderId: string; work: unknown; leg: unknown }>`
        select w.order_id, to_jsonb(w) as work,
               (select to_jsonb(f) from forwarding_items f
                where f.order_id = w.order_id and f.supplier_id = w.supplier_id and f.state <> 'cancelled'
                order by f.created_at desc limit 1) as leg
        from supplier_work w where w.supplier_id = ${supplierId} and w.order_id in ${sql.in([...orderIds])}
        for update of w`.pipe(Effect.map((rows) => rows.map((r) => ({ ...r, leg: r.leg ?? null }))))

/** The leg reached the supplier and it has it: confirmed, by this contact. */
const confirmLeg = (sql: SqlClient.SqlClient, supplierId: string, contactId: string, orderId: string) =>
  sql`update forwarding_items set state = 'confirmed', since = now(), confirmed_at = coalesce(confirmed_at, now()),
        confirmed_by = coalesce(confirmed_by, ${contactId})
      where order_id = ${orderId} and supplier_id = ${supplierId} and state in ('sending', 'awaiting', 'error')`

const settle = (sql: SqlClient.SqlClient, orderId: string) => sql`select supplier_order_settle(${orderId})`

/** "Accepteren" (bulk): what waits to be accepted moves to ship; the rest is skipped, with why. */
export const accept = Effect.fn("SupplierPortal.orders.accept")(function*(input: AcceptInput) {
  yield* requireScope("orders")
  const contact = yield* CurrentSupplierContact
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const rows = yield* orderRows(sql, { ids: input.orderIds })
      const found = new Map(rows.map((r) => [r.id, r]))
      const ok = rows.filter((r) => r.status === "to_accept").map((r) => r.id)
      const skipped = input.orderIds.filter((id) => !ok.includes(id)).map((id) => ({
        id,
        reason: found.get(id)?.status ?? "not_found"
      }))
      if (ok.length === 0) return new SupplierOrderChange({ ok, skipped, undo: null })
      const snaps = yield* snapshot(sql, contact.supplierId, ok)
      for (const id of ok) {
        yield* confirmLeg(sql, contact.supplierId, contact.contactId, id)
        yield* sql`update supplier_work set accepted_at = coalesce(accepted_at, now()),
                     accepted_by = coalesce(accepted_by, ${contact.contactId}),
                     status = case when status = 'to_accept' then 'to_ship' else status end, updated_at = now()
                   where order_id = ${id} and supplier_id = ${contact.supplierId}`
        yield* settle(sql, id)
      }
      yield* record(sql, {
        action: "order.supplier_accepted",
        subjectType: "order",
        subjectIds: ok,
        kind: "supplier_orders"
      })
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { kind: "orders", snaps } })
      return new SupplierOrderChange({ ok, skipped, undo })
    })
  )
})

/**
 * "Markeren als verzonden": per order its parcel (carrier, tracking, the supplier's lines in it). The work is shipped
 * now, the brand sees the tracking at once; Shopify's `fulfillmentCreate` (which mails the customer the tracking) waits
 * out the undo window. A row that is closed, shipped already, or names a line that is not the supplier's is skipped.
 */
export const ship = Effect.fn("SupplierPortal.orders.ship")(function*(input: ShipInput) {
  yield* requireScope("orders")
  const contact = yield* CurrentSupplierContact
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const ids = [...new Set(input.items.map((i) => i.orderId))]
      const rows = new Map((yield* orderRows(sql, { ids })).map((r) => [r.id, r]))
      const skipped: Array<{ id: string; reason: string }> = []
      const ready: Array<{ item: ShipInput["items"][number]; lineIds: ReadonlyArray<string> }> = []
      for (const item of input.items) {
        const row = rows.get(item.orderId)
        if (row === undefined) skipped.push({ id: item.orderId, reason: "not_found" })
        else if (row.status === "closed") skipped.push({ id: item.orderId, reason: "closed" })
        else if (row.status === "shipped") skipped.push({ id: item.orderId, reason: "shipped" })
        else if (ready.some((r) => r.item.orderId === item.orderId)) skipped.push({ id: item.orderId, reason: "twice" })
        else {
          const own = new Set(row.lines.map((l) => l.id))
          const lineIds = item.lineIds ?? [...own]
          if (lineIds.some((l) => !own.has(l))) skipped.push({ id: item.orderId, reason: "lines" })
          else ready.push({ item, lineIds })
        }
      }
      const ok = ready.map((r) => r.item.orderId)
      if (ok.length === 0) return { change: new SupplierOrderChange({ ok, skipped, undo: null }), outboxIds: [] }
      const snaps = yield* snapshot(sql, contact.supplierId, ok)
      const held: Array<string> = []
      for (const { item, lineIds } of ready) {
        const tracking = item.tracking.trim()
        yield* confirmLeg(sql, contact.supplierId, contact.contactId, item.orderId)
        yield* sql`update supplier_work set status = 'shipped', shipped_at = now(), shipped_by = ${contact.contactId},
                     accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, ${contact.contactId}),
                     carrier = ${item.carrier}, tracking_number = ${tracking}, tracking_url = null,
                     problem_resolved_at = case when status = 'problem' then now() else problem_resolved_at end,
                     updated_at = now()
                   where order_id = ${item.orderId} and supplier_id = ${contact.supplierId}`
        yield* settle(sql, item.orderId)
        // The view hides Shopify's ids for nothing: they are the supplier's own lines.
        const lines = yield* sql<{ shopifyId: string }>`
          select shopify_id from order_lines where id in ${sql.in([...lineIds])}`
        held.push(
          yield* Outbox.write(sql, principal.workspaceId, {
            type: "order.updated",
            workspaceId: principal.workspaceId,
            userId: `supplier_contact:${contact.contactId}`,
            orderIds: [item.orderId],
            change: "fulfil",
            add: [],
            remove: [],
            lines: lines.map((l) => l.shopifyId),
            tracking: { company: item.carrier, number: tracking, url: null },
            supplierId: contact.supplierId,
            notify: true
          }, { afterSeconds: UNDO_SECONDS })
        )
      }
      yield* record(sql, {
        action: "order.supplier_shipped",
        subjectType: "order",
        subjectIds: ok,
        kind: "supplier_orders",
        diff: { carriers: [...new Set(ready.map((r) => r.item.carrier))] }
      })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "orders", snaps },
        outboxIds: held
      })
      return { change: new SupplierOrderChange({ ok, skipped, undo }), outboxIds: held }
    })
  )
  yield* (yield* Relay).kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * "Probleem melden": the work shows the problem (a stock or address problem puts the leg in error, in the supplier's
 * words); a new date moves the hand-off to its 17:00. The brand's ticket and its notes follow once the window passed.
 */
export const reportProblem = Effect.fn("SupplierPortal.orders.reportProblem")(function*(input: ReportProblemInput) {
  yield* requireScope("orders")
  const contact = yield* CurrentSupplierContact
  const principal = yield* CurrentPrincipal
  const note = input.note.trim()
  if (note === "") return yield* new Invalid({ fields: { note: "required" } })
  if ((input.kind === "delay" || input.kind === "stock") && input.newDate === undefined) {
    return yield* new Invalid({ fields: { newDate: "required" } })
  }
  const db = yield* Db
  const { change, outboxId } = yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [row] = yield* orderRows(sql, { ids: [input.orderId] })
      if (row === undefined) return yield* new NotFound({ entity: "order", id: input.orderId })
      if (row.status === "problem") return yield* new Conflict({ entity: "order", reason: "problem_open" })
      if (row.status !== "to_accept" && row.status !== "to_ship") {
        return yield* new Conflict({ entity: "order", reason: "closed" })
      }
      const [s] = yield* sql<{ timezone: string; past: boolean }>`
        select timezone, ${input.newDate ?? null}::date < (now() at time zone timezone)::date as past from suppliers`
      if (s?.past === true) return yield* new Invalid({ fields: { newDate: "past" } })
      const snaps = yield* snapshot(sql, contact.supplierId, [input.orderId])
      yield* sql`update supplier_work set status = 'problem', problem_kind = ${input.kind}, problem_note = ${note},
                   problem_new_date = ${input.newDate ?? null}::date, problem_reported_at = now(),
                   problem_resolved_at = null, problem_reported_by = ${contact.contactId},
                   handoff_by = case when ${input.newDate ?? null}::date is null then handoff_by
                     else ((${input.newDate ?? null}::date + interval '17 hours') at time zone ${
        s?.timezone ?? "UTC"
      }) end,
                   updated_at = now()
                 where order_id = ${input.orderId} and supplier_id = ${contact.supplierId}`
      if (input.kind === "stock" || input.kind === "address") {
        yield* sql`update forwarding_items set state = 'error', since = now(), error_kind = ${input.kind},
                     error_note = ${note}
                   where order_id = ${input.orderId} and supplier_id = ${contact.supplierId} and state <> 'cancelled'`
        yield* settle(sql, input.orderId)
      }
      yield* record(sql, {
        action: "order.supplier_problem",
        subjectType: "order",
        subjectIds: [input.orderId],
        kind: "supplier_orders",
        diff: { kind: input.kind, newDate: input.newDate ?? null }
      })
      const reported = yield* Outbox.write(sql, principal.workspaceId, {
        type: "supplier.problem_reported",
        workspaceId: principal.workspaceId,
        orderId: input.orderId,
        supplierId: contact.supplierId,
        contactId: contact.contactId
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "orders", snaps },
        outboxIds: [reported]
      })
      return { change: new SupplierOrderChange({ ok: [input.orderId], skipped: [], undo }), outboxId: reported }
    })
  )
  yield* (yield* Relay).kick([outboxId], { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * "Opslaan" on a product: the counts per variant (as the supplier's report, beside the store's own) and the lead time.
 * A product whose stock comes from the supplier's own system live is not counted by hand.
 */
export const saveStock = Effect.fn("SupplierPortal.products.saveStock")(function*(input: SaveStockInput) {
  yield* requireScope("stock")
  const contact = yield* CurrentSupplierContact
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [row] = yield* productRows(sql, [input.productId])
      if (row === undefined) return yield* new NotFound({ entity: "product", id: input.productId })
      if (row.reporting === "live") return yield* new Conflict({ entity: "product", reason: "reporting_live" })
      const variants = new Set(
        (yield* sql<{ id: string }>`select id from variants where product_id = ${input.productId}`).map((v) => v.id)
      )
      const wanted = Object.entries(input.variantStock)
      const unknown = wanted.filter(([id]) => !variants.has(id))
      if (unknown.length > 0) {
        return yield* new Invalid({
          fields: Object.fromEntries(unknown.map(([id]) => [`variantStock.${id}`, "unknown"]))
        })
      }
      const before = wanted.length === 0 ? [] : yield* sql<{ variantId: string; available: number }>`
        select variant_id, available from inventory_levels
        where source = 'supplier' and location_id = 'supplier' and variant_id in ${sql.in(wanted.map(([id]) => id))}`
      const levels = wanted.map(([variantId]) => ({
        variantId,
        available: before.find((b) => b.variantId === variantId)?.available ?? null
      }))
      for (const [variantId, available] of wanted) {
        yield* sql`insert into inventory_levels (workspace_id, variant_id, location_id, available, source, reported_by,
                                                 reported_at)
                   values (${principal.workspaceId}, ${variantId}, 'supplier', ${available}, 'supplier',
                           ${`supplier_contact:${contact.contactId}`}, now())
                   on conflict (variant_id, location_id, source) do update set available = excluded.available,
                     reported_by = excluded.reported_by, reported_at = excluded.reported_at`
      }
      if (input.leadDays !== undefined) {
        yield* sql`update product_supply set lead_days = ${input.leadDays}
                   where product_id = ${input.productId} and supplier_id = ${contact.supplierId}`
      }
      yield* record(sql, {
        action: "product.supplier_stock",
        subjectType: "product",
        subjectIds: [input.productId],
        kind: "supplier_products",
        diff: { variants: wanted.length, leadDays: input.leadDays ?? null }
      })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "stock", productId: input.productId, leadDays: row.leadDays, levels }
      })
      return new StockChange({ product: yield* productDetail(sql, input.productId), undo })
    })
  )
})

/** "Hoe je voorraad meldt": at once, no undo. Live needs the supplier's own system connected. */
export const setReporting = Effect.fn("SupplierPortal.products.setReporting")(function*(input: SetReportingInput) {
  yield* requireScope("stock")
  const contact = yield* CurrentSupplierContact
  const db = yield* Db
  return yield* db.scopedPartner((sql) =>
    Effect.gen(function*() {
      const [row] = yield* productRows(sql, [input.productId])
      if (row === undefined) return yield* new NotFound({ entity: "product", id: input.productId })
      if (input.mode === "live") {
        const [api] = yield* sql<{ on: boolean }>`
          select enabled and kind = 'custom' as on from supplier_integrations where supplier_id = ${contact.supplierId}`
        if (api?.on !== true) return yield* new Conflict({ entity: "product", reason: "live_needs_integration" })
      }
      if (row.reporting !== input.mode) {
        yield* sql`update product_supply set stock_reporting = ${input.mode}
                   where product_id = ${input.productId} and supplier_id = ${contact.supplierId}`
        yield* record(sql, {
          action: "product.supplier_reporting",
          subjectType: "product",
          subjectIds: [input.productId],
          kind: "supplier_products",
          diff: { reporting: [row.reporting, input.mode] }
        })
      }
      return yield* productDetail(sql, input.productId)
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(Restore)

/** `SupplierPortal.undo`'s compensation: the work and the leg as they were, the stock and lead time as they were. */
export const restore = Effect.fn("SupplierPortal.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const principal = yield* CurrentPrincipal
  const supplierId = principal.partnerId
  if (principal.kind !== "supplier_contact" || supplierId === null) {
    return yield* new Forbidden({ permission: "supplier_portal", level: 0, roleLabel: principal.role.label })
  }
  const undo: Restore = yield* decodeRestore(compensation).pipe(Effect.orDie)
  if (undo.kind === "stock") {
    for (const l of undo.levels) {
      yield* l.available === null
        ? sql`delete from inventory_levels where variant_id = ${l.variantId} and location_id = 'supplier'
              and source = 'supplier'`
        : sql`update inventory_levels set available = ${l.available}
              where variant_id = ${l.variantId} and location_id = 'supplier' and source = 'supplier'`
    }
    yield* sql`update product_supply set lead_days = ${undo.leadDays}
               where product_id = ${undo.productId} and supplier_id = ${supplierId}`
    yield* record(sql, {
      action: "product.supplier_restored",
      subjectType: "product",
      subjectIds: [undo.productId],
      kind: "supplier_products"
    })
    return
  }
  for (const s of undo.snaps) {
    const work = JSON.stringify(s.work)
    yield* sql`update supplier_work w set (status, accepted_at, accepted_by, handoff_by, problem_kind, problem_note,
                 problem_new_date, problem_reported_at, problem_resolved_at, shipped_at, carrier, tracking_number,
                 tracking_url, shipped_by, problem_reported_by, updated_at) =
                 (select r.status, r.accepted_at, r.accepted_by, r.handoff_by, r.problem_kind, r.problem_note,
                         r.problem_new_date, r.problem_reported_at, r.problem_resolved_at, r.shipped_at, r.carrier,
                         r.tracking_number, r.tracking_url, r.shipped_by, r.problem_reported_by, now()
                  from jsonb_populate_record(null::supplier_work, ${work}::jsonb) r)
               where w.order_id = ${s.orderId} and w.supplier_id = ${supplierId}`
    if (s.leg !== null) {
      const leg = JSON.stringify(s.leg)
      yield* sql`update forwarding_items f set (state, since, confirmed_at, confirmed_by, error_kind, error_note) =
                   (select r.state, r.since, r.confirmed_at, r.confirmed_by, r.error_kind, r.error_note
                    from jsonb_populate_record(null::forwarding_items, ${leg}::jsonb) r)
                 where f.id = (${leg}::jsonb ->> 'id') and f.supplier_id = ${supplierId}`
    }
    yield* settle(sql, s.orderId)
  }
  yield* record(sql, {
    action: "order.supplier_restored",
    subjectType: "order",
    subjectIds: undo.snaps.map((s) => s.orderId),
    kind: "supplier_orders"
  })
})
