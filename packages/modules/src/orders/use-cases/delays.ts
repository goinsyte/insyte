import { Db } from "@insyte/database/Db"
import { Conflict } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
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
 * - `clearDelay`: takes the mark off. The detectors honour it (`DELAY_CLEARED` in the audit log) until something new
 *   happens: the parcel moves again, or the supplier names a later hand-off.
 * - `supplierLate`: the hourly check. Work a supplier has not shipped by its `handoff_by` delays its order once, and
 *   whoever handles orders in that store hears of it (`order.delayed` → `order.late`).
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

/**
 * One workspace's turn of the hourly supplier check, as `system`: each open order with work past its hand-off and
 * nothing shipped is delayed, once, naming the supplier and how long the order has waited. A delay the operator cleared
 * after that hand-off stays cleared; a later hand-off (the supplier's new date) is checked afresh. Answers the outbox
 * rows to kick.
 */
export const supplierLate = Effect.fn("Orders.supplierLate")(function*() {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const late = yield* sql<{ orderId: string; placedAt: Date; supplier: string }>`
        select distinct on (o.id) o.id as order_id, o.placed_at, s.name as supplier
        from supplier_work w join orders o on o.id = w.order_id join suppliers s on s.id = w.supplier_id
        where w.status in ('to_accept', 'to_ship', 'problem') and w.handoff_by < now()
          and o.delayed_at is null and o.status not in ('delivered', 'cancelled', 'refunded')
          and o.fulfillment_status <> 'fulfilled'
          and ${notClearedAfter(sql, "o.id", "w.handoff_by")}
        order by o.id, w.handoff_by
        limit ${PER_TURN}`
      const sent: Array<string> = []
      for (const l of late) {
        const id = yield* markDelayed(sql, {
          orderId: l.orderId,
          reason: "supplier_late",
          note: null,
          supplier: l.supplier,
          hours: Math.max(0, Math.floor((Date.now() - l.placedAt.getTime()) / HOUR_MS))
        })
        if (id !== undefined) sent.push(id)
      }
      return sent
    })
  )
})

/** The hourly supplier check over every workspace with a store; one workspace failing does not stop the rest. */
export const supplierLateSweep = Effect.fn("Orders.supplierLateSweep")(function*() {
  const db = yield* Db
  const relay = yield* Relay
  const due = yield* db.routing((sql) => sql<{ workspaceId: WorkspaceId }>`select workspace_id from queue_workspaces()`)
  for (const { workspaceId } of new Map(due.map((d) => [d.workspaceId, d])).values()) {
    yield* supplierLate().pipe(
      Effect.flatMap((sent) => relay.kick(sent)),
      Effect.provideService(CurrentWorkspace, { id: workspaceId }),
      Effect.catchCause((cause) =>
        Effect.logWarning("supplier late check failed for a workspace", { workspaceId, cause })
      )
    )
  }
})
