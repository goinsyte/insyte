import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { type ForwardView, type LegCounts, LegList, LegRow } from "../domain/Forwarding.ts"

/*
 * Legs, made and read (M8.2). The mirror calls `ensureLegs` after each page: a paid, open, unfulfilled order gets one leg
 * per supplier of its lines (a line's supplier is its product's primary `product_supply`; lines with none make a
 * `no_supplier` leg). A waiting leg picks up lines that arrive in a later page. A supplier set to forward on payment gets
 * its leg sent at once, but only from a live event (a webhook, the sweep), never from a store's first import. An order
 * Shopify reports fulfilled confirms its open legs; one cancelled or refunded cancels them.
 */

const OPEN = "('to_forward', 'sending', 'awaiting', 'error')"

interface Candidate {
  readonly orderId: string
  readonly supplierId: string
  readonly lineIds: ReadonlyArray<string>
  readonly paused: boolean
  readonly auto: boolean
  readonly via: "portal" | "email" | "api" | null
  readonly hasLeg: boolean
}

export const ensureLegs = Effect.fn("Forwarding.ensureLegs")(function*(
  sql: SqlClient.SqlClient,
  storeId: string,
  orderShopifyIds: ReadonlyArray<string>,
  live: boolean
) {
  if (orderShopifyIds.length === 0) return
  const ids = [...new Set(orderShopifyIds)]

  // What Shopify says happened to the order wins over the leg.
  yield* sql`
    update forwarding_items f set state = 'confirmed', since = now(), confirmed_at = now(), confirmed_by = 'shopify'
    from orders o
    where f.order_id = o.id and o.store_id = ${storeId} and o.shopify_id in ${sql.in(ids)}
      and o.fulfillment_status = 'fulfilled' and f.state in ${sql.literal(OPEN)}`
  yield* sql`
    update forwarding_items f set state = 'cancelled', since = now()
    from orders o
    where f.order_id = o.id and o.store_id = ${storeId} and o.shopify_id in ${sql.in(ids)}
      and (o.status in ('cancelled', 'refunded') or o.payment_status in ('refunded', 'voided'))
      and f.state in ('to_forward', 'error')`

  const candidates = yield* sql<Candidate>`
    select o.id as order_id, coalesce(ps.supplier_id, '') as supplier_id, array_agg(l.id order by l.id) as line_ids,
           coalesce(s.paused_at is not null, false) as paused, coalesce(s.auto_forward, false) as auto,
           s.forward_channel as via,
           exists (select 1 from forwarding_items f where f.order_id = o.id
                   and coalesce(f.supplier_id, '') = coalesce(ps.supplier_id, '') and f.state <> 'cancelled') as has_leg
    from orders o
    join order_lines l on l.order_id = o.id
    left join product_supply ps on ps.product_id = l.product_id and ps.is_primary
    left join suppliers s on s.id = ps.supplier_id
    where o.store_id = ${storeId} and o.shopify_id in ${sql.in(ids)}
      and o.payment_status in ('paid', 'partially_refunded') and o.status not in ('cancelled', 'refunded')
      and o.fulfillment_status = 'unfulfilled'
    group by o.id, ps.supplier_id, s.paused_at, s.auto_forward, s.forward_channel`

  // Lines that arrived after their leg was made join it while it waits (not after a reroute: those lines are fixed).
  for (const c of candidates.filter((candidate) => candidate.hasLeg)) {
    yield* sql`
      update forwarding_items set line_ids = ${[...c.lineIds]}::text[]
      where order_id = ${c.orderId} and coalesce(supplier_id, '') = ${c.supplierId}
        and state in ('to_forward', 'error') and from_supplier_id is null`
  }

  const fresh = candidates.filter((c) => !c.hasLeg).map((c) => {
    const state = c.supplierId === "" || c.paused ? "error" : live && c.auto ? "sending" : "to_forward"
    return {
      id: mintId("fwd"),
      order_id: c.orderId,
      supplier_id: c.supplierId === "" ? null : c.supplierId,
      line_ids: c.lineIds,
      state,
      via: state === "sending" ? c.via : null,
      error_kind: c.supplierId === "" ? "no_supplier" : c.paused ? "supplier_paused" : null
    }
  })
  if (fresh.length === 0) return
  yield* sql`
    insert into forwarding_items (id, workspace_id, store_id, order_id, supplier_id, line_ids, state, via, error_kind,
                                  forwarded_at, forwarded_by)
    select r.id, app_workspace_id(), ${storeId}, r.order_id, r.supplier_id, r.line_ids, r.state, r.via, r.error_kind,
           case when r.state = 'sending' then now() end, case when r.state = 'sending' then 'system' end
    from jsonb_to_recordset(${JSON.stringify(fresh)}::jsonb) as r(
      id text, order_id text, supplier_id text, line_ids text[], state text, via text, error_kind text)
    on conflict do nothing`

  // A supplier's standing instruction: forwarded on payment, by Insyte, with no undo window to wait out.
  const sent = fresh.filter((l) => l.state === "sending").map((l) => l.id)
  if (sent.length > 0) {
    const [ws] = yield* sql<{ id: string }>`select app_workspace_id() as id`
    const outboxId = yield* Outbox.write(sql, ws!.id, {
      type: "forwarding.send_requested",
      workspaceId: ws!.id,
      userId: "system",
      legIds: sent
    })
    yield* sql`update forwarding_items set outbox_id = ${outboxId} where id in ${sql.in(sent)}`
  }
})

interface Row {
  readonly id: string
  readonly orderId: string
  readonly orderNumber: string
  readonly customerName: string
  readonly storeId: string
  readonly totalMinor: string
  readonly currency: string
  readonly supplierId: string | null
  readonly supplierName: string | null
  readonly fromSupplierId: string | null
  readonly fromSupplierName: string | null
  readonly lines: ReadonlyArray<{ title: string; variantTitle: string | null; quantity: number; image: string | null }>
  readonly state: LegRow["state"]
  readonly via: LegRow["via"]
  readonly since: Date
  readonly sendingUntil: Date | null
  readonly confirmBy: Date | null
  readonly errorKind: LegRow["errorKind"]
  readonly errorNote: string | null
  readonly operatorNote: string | null
  readonly forwardedBy: string | null
}

const SELECT = `f.id, f.order_id, o.number as order_number, o.customer_name, f.store_id, o.total_minor, o.currency,
  f.supplier_id, s.name as supplier_name, f.from_supplier_id, fs.name as from_supplier_name,
  coalesce((select json_agg(json_build_object('title', l.title, 'variantTitle', l.variant_title, 'quantity', l.quantity,
                                              'image', p.images[1]) order by l.id)
            from order_lines l left join products p on p.id = l.product_id
            where l.id = any(f.line_ids)), '[]') as lines,
  f.state, f.via, f.since, (select x.not_before from outbox x where x.id = f.outbox_id) as sending_until,
  f.confirm_by, f.error_kind, f.error_note, f.operator_note, f.forwarded_by`

const FROM = `forwarding_items f join orders o on o.id = f.order_id
  left join suppliers s on s.id = f.supplier_id left join suppliers fs on fs.id = f.from_supplier_id`

const toRow = (r: Row) =>
  new LegRow({
    id: r.id,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    storeId: r.storeId,
    totalMinor: Number(r.totalMinor),
    currency: r.currency,
    supplier: r.supplierId === null ? null : { id: r.supplierId, name: r.supplierName ?? "" },
    fromSupplier: r.fromSupplierId === null ? null : { id: r.fromSupplierId, name: r.fromSupplierName ?? "" },
    lines: r.lines,
    state: r.state,
    via: r.via,
    since: r.since.getTime(),
    sendingUntil: r.state === "sending" ? r.sendingUntil?.getTime() ?? null : null,
    confirmBy: r.confirmBy?.getTime() ?? null,
    late: r.state === "awaiting" && r.confirmBy !== null && r.confirmBy.getTime() < Date.now(),
    errorKind: r.errorKind,
    errorNote: r.errorNote,
    operatorNote: r.operatorNote,
    forwardedBy: r.forwardedBy
  })

export const rowsWhere = (sql: SqlClient.SqlClient, where: Statement.Fragment) =>
  Effect.gen(function*() {
    const scope = yield* inScope(sql, "f.store_id")
    const rows = yield* sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
                                 where ${scope} and ${where} order by f.since, f.id limit 500`
    return rows.map(toRow)
  })

export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  rowsWhere(sql, sql`f.id in ${sql.in([...ids])}`)

const STATES: Record<ForwardView, string> = {
  to_forward: "('to_forward')",
  awaiting: "('awaiting', 'sending')",
  forward_error: "('error')"
}

const countsOf = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const scope = yield* inScope(sql, "f.store_id")
    const [c] = yield* sql<typeof LegCounts.Type>`
      select count(*) filter (where f.state = 'to_forward')::int as to_forward,
             count(*) filter (where f.state in ('awaiting', 'sending'))::int as awaiting,
             count(*) filter (where f.state = 'awaiting' and f.confirm_by < now())::int as late,
             count(*) filter (where f.state = 'error')::int as error
      from forwarding_items f where ${scope}`
    return c ?? { toForward: 0, awaiting: 0, late: 0, error: 0 }
  })

/** `Forwarding.list`: one view of the queue, oldest first, with the counts for the header. */
export const list = Effect.fn("Forwarding.list")(function*(view: ForwardView) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* rowsWhere(sql, sql`f.state in ${sql.literal(STATES[view])}`)
      return new LegList({ rows, counts: yield* countsOf(sql) })
    })
  )
})

/** `Forwarding.forOrder`: an order's legs, for its processing tracker. */
export const forOrder = Effect.fn("Forwarding.forOrder")(function*(orderId: string) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => rowsWhere(sql, sql`f.order_id = ${orderId} and f.state <> 'cancelled'`))
})
