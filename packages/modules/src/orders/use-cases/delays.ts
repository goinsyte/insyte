import { Db } from "@insyte/database/Db"
import { Conflict } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import { DELAY_CLEARED, markDelayed, notClearedAfter } from "../../shared/use-cases/Delays.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { OrderChange, type OrdersRestore } from "../domain/Commands.ts"
import { audit, closed, iso, lock, RESTORE, rowsOf } from "./commands.ts"

/*
 * Delays by hand and by the supplier's clock (M7, M8.3; widgets/03 "Als vertraagd markeren", "Vertraging wissen").
 *
 * - `flagDelayed`: the operator marks open orders delayed. It sets `delayed_at` (the order shows as Vertraagd, Start's
 *   queue and its plate pick it up) and, once the undo window has passed, writes `order.delayed` (`manual`) so the
 *   workspace's automations can react. It does not mail the shopper by itself: the delay mail stays the plate's
 *   deliberate "Versturen" (`Orders.notifyDelay`), and the team is not notified of what one of them just did.
 * - `clearDelay`: takes the mark off, and calls off a manual flag's `order.delayed` still waiting out its window for
 *   those orders (its undo restores the mark, not that event). The detectors honour it (`DELAY_CLEARED` in the audit
 *   log) until something new happens: the carrier reports the parcel again, or the supplier misses a later hand-off.
 * - `supplierLate`: the hourly check. Work a supplier has not shipped by its `handoff_by` (in the last seven days)
 *   delays its order once, and whoever handles orders in that store hears of it (`order.delayed` → `order.late`).
 *
 * Both commands at Bestellingen · Bewerken inside the role's stores, bulk (up to 500), with one undo for the selection.
 */

/** Marks open orders delayed; orders already delayed are left out of the change. */
export const flagDelayed = Effect.fn("Orders.flagDelayed")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, ids)
      if (locked.some(closed)) return yield* new Conflict({ entity: "order", reason: "closed" })
      if (locked.some((o) => o.status === "delivered")) {
        return yield* new Conflict({ entity: "order", reason: "delivered" })
      }
      const fresh = locked.filter((o) => o.delayedAt === null)
      if (fresh.length === 0) return { change: new OrderChange({ orders: [], undo: null }), outboxId: null }
      const orderIds = fresh.map((o) => o.id)
      yield* sql`update orders set delayed_at = now() where id in ${sql.in(orderIds)}`
      for (const o of fresh) yield* audit(sql, "order.delay_flagged", o.id, { delayedAt: [null, "now"] })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "order.delayed",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        orderIds,
        reason: "manual",
        note: null
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { orders: orderIds.map((id) => ({ id, delayedAt: null })) } satisfies OrdersRestore,
        outboxIds: [outboxId]
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, orderIds), undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** Takes the delay off; orders not delayed are left out of the change. Nothing leaves Insyte, so nothing waits. */
export const clearDelay = Effect.fn("Orders.clearDelay")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("orders", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, ids)
      const delayed = locked.filter((o) => o.delayedAt !== null)
      if (delayed.length === 0) return new OrderChange({ orders: [], undo: null })
      const orderIds = delayed.map((o) => o.id)
      yield* sql`update orders set delayed_at = null where id in ${sql.in(orderIds)}`
      for (const o of delayed) yield* audit(sql, DELAY_CLEARED, o.id, { delayedAt: [iso(o.delayedAt), null] })
      // A manual flag still waiting out its window is called off for these orders: no one hears of a delay taken back.
      const held = yield* sql<{ id: string; orderIds: ReadonlyArray<string> }>`
        select id, payload->'orderIds' as order_ids from outbox
        where event = 'order.delayed' and relayed_at is null and cancelled_at is null
          and payload->>'reason' = 'manual' and jsonb_exists_any(payload->'orderIds', ${orderIds}::text[])
        for update`
      for (const h of held) {
        const rest = h.orderIds.filter((id) => !orderIds.includes(id))
        yield* rest.length === 0
          ? sql`update outbox set cancelled_at = now() where id = ${h.id}`
          : sql`update outbox set payload = jsonb_set(payload, '{orderIds}', to_jsonb(${rest}::text[]))
                where id = ${h.id}`
      }
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          orders: delayed.map((o) => ({ id: o.id, delayedAt: iso(o.delayedAt) }))
        } satisfies OrdersRestore
      })
      return new OrderChange({ orders: yield* rowsOf(sql, orderIds), undo })
    })
  )
})

const PER_TURN = 200
const HOUR_MS = 3_600_000
/** Work whose hand-off passed longer ago than this is the backlog: never raised by the check (0080). */
const WINDOW_DAYS = 7

/**
 * The open work past its hand-off within the window, at `at`, of orders open and not delayed, whose supplier is still
 * there, and not cleared by the operator after that hand-off; one row per order, its earliest late hand-off.
 */
const lateWork = (sql: SqlClient.SqlClient, at: Date, orderId?: string) =>
  sql<{ orderId: string; handoffBy: Date; supplier: string }>`
    select distinct on (o.id) o.id as order_id, w.handoff_by, s.name as supplier
    from supplier_work w join orders o on o.id = w.order_id join suppliers s on s.id = w.supplier_id
    where w.workspace_id = app_workspace_id() and w.status in ('to_accept', 'to_ship', 'problem')
      and w.handoff_by < ${at} and w.handoff_by > ${at}::timestamptz - make_interval(days => ${WINDOW_DAYS})
      and s.deleted_at is null
      and o.delayed_at is null and o.status not in ('delivered', 'cancelled', 'refunded')
      and o.fulfillment_status <> 'fulfilled'
      and ${notClearedAfter(sql, "o.id", "w.handoff_by")}
      and ${orderId === undefined ? sql`true` : sql`o.id = ${orderId}`}
    order by o.id, w.handoff_by
    limit ${PER_TURN}`

/**
 * One workspace's turn of the hourly supplier check, as `system`, as if at `at` (now by default): each open order with
 * work past its hand-off in the last seven days and nothing shipped is delayed, once, naming the supplier and how many
 * hours past the hand-off it is. Older work is the backlog and is left be, so a first run does not raise it all at once.
 * A delay the operator cleared after that hand-off stays cleared; a later hand-off (the supplier's new date) is checked
 * afresh. The candidates are read first; each order is then marked in a short transaction of its own, checked again
 * there, so a second check running at the same time marks nothing twice. Answers the outbox rows to kick.
 */
export const supplierLate = Effect.fn("Orders.supplierLate")(function*(at: Date = new Date()) {
  const db = yield* Db
  const candidates = yield* db.scopedFor((sql) => lateWork(sql, at))
  const sent: Array<string> = []
  for (const c of candidates) {
    const id = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [still] = yield* lateWork(sql, at, c.orderId)
        if (still === undefined) return undefined
        return yield* markDelayed(sql, {
          orderId: still.orderId,
          reason: "supplier_late",
          note: null,
          supplier: still.supplier,
          hours: Math.max(0, Math.floor((at.getTime() - still.handoffBy.getTime()) / HOUR_MS))
        })
      })
    )
    if (id !== undefined) sent.push(id)
  }
  return sent
})

/** The hourly supplier check over the workspaces with work come due (0080); one failing does not stop the rest. */
export const supplierLateSweep = Effect.fn("Orders.supplierLateSweep")(function*() {
  const db = yield* Db
  const relay = yield* Relay
  const due = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from supplier_late_workspaces()`
  )
  for (const { workspaceId } of due) {
    yield* supplierLate().pipe(
      Effect.flatMap((sent) => relay.kick(sent)),
      Effect.provideService(CurrentWorkspace, { id: workspaceId }),
      Effect.catchCause((cause) =>
        Effect.logWarning("supplier late check failed for a workspace", { workspaceId, cause })
      )
    )
  }
})
