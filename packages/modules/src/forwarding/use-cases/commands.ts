import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type Before,
  ForwardingChange,
  ForwardingRestore,
  type ForwardInput,
  type IdsInput,
  type RerouteInput
} from "../domain/Forwarding.ts"
import { rowsOf } from "./legs.ts"
import { ensureWork } from "./work.ts"

/*
 * The forwarding commands (M8.2; widgets/03 Doorsturen), at `orders` Bewerken, inside the role's stores. A forward
 * waits out the undo window as `sending`; then `send` delivers it. Confirming, rerouting and cancelling apply at once.
 * Each has one undo token (`forwarding.restore`) that puts the legs back as they were.
 */

const RESTORE = "forwarding.restore"

interface Locked {
  readonly id: string
  readonly orderId: string
  readonly state: Before["state"]
  readonly supplierId: string | null
  readonly fromSupplierId: string | null
  readonly via: Before["via"]
  readonly since: Date
  readonly errorKind: Before["errorKind"]
  readonly errorNote: string | null
  readonly operatorNote: string | null
  readonly confirmedAt: Date | null
  readonly paused: boolean
  readonly channel: Before["via"]
}

const lock = Effect.fn("Forwarding.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* inScope(sql, "f.store_id")
  const rows = yield* sql<Locked>`
    select f.id, f.order_id, f.state, f.supplier_id, f.from_supplier_id, f.via, f.since, f.error_kind, f.error_note,
           f.operator_note, f.confirmed_at, coalesce(s.paused_at is not null, false) as paused,
           s.forward_channel as channel
    from forwarding_items f left join suppliers s on s.id = f.supplier_id
    where f.id in ${sql.in([...new Set(ids)])} and ${scope} order by f.id for update of f`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "forwarding_item", id: missing })
  return rows
})

const before = (l: Locked): Before => ({
  id: l.id,
  state: l.state,
  supplierId: l.supplierId,
  fromSupplierId: l.fromSupplierId,
  via: l.via,
  since: l.since.getTime(),
  errorKind: l.errorKind,
  errorNote: l.errorNote,
  operatorNote: l.operatorNote,
  confirmedAt: l.confirmedAt?.getTime() ?? null
})

const audit = (sql: SqlClient.SqlClient, action: string, l: Locked, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "order",
        subjectId: l.orderId,
        diff: { leg: l.id, ...diff }
      })
  )

const answer = (
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>,
  restore: ForwardingRestore,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.gen(function*() {
    const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds })
    return new ForwardingChange({ legs: yield* rowsOf(sql, ids), undo })
  })

const none = () => new ForwardingChange({ legs: [], undo: null })

/**
 * "Doorsturen": legs to forward or in error go to their suppliers once the undo window has passed. A leg without a
 * supplier, or whose supplier is paused, cannot go: it is left as it is, and when nothing can go the answer says why.
 */
export const forward = Effect.fn("Forwarding.forward")(function*(input: typeof ForwardInput.Type) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const legs = (yield* lock(sql, input.ids)).filter((l) => l.state === "to_forward" || l.state === "error")
      const going = legs.filter((l) => l.supplierId !== null && !l.paused)
      if (going.length === 0) {
        if (legs.some((l) => l.supplierId === null)) {
          return yield* new Conflict({ entity: "forwarding_item", reason: "no_supplier" })
        }
        if (legs.some((l) => l.paused)) return yield* new Conflict({ entity: "forwarding_item", reason: "paused" })
        return { change: none(), outboxId: null }
      }
      const ids = going.map((l) => l.id)
      const note = input.note?.trim() || null
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "forwarding.send_requested",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        legIds: ids
      }, { afterSeconds: UNDO_SECONDS })
      for (const l of going) {
        const via = input.via?.[l.supplierId!] ?? l.channel ?? "email"
        yield* sql`update forwarding_items set state = 'sending', since = now(), via = ${via}, error_kind = null,
                     error_note = null, operator_note = coalesce(${note}, operator_note), outbox_id = ${outboxId},
                     forwarded_at = now(), forwarded_by = ${principal.id}
                   where id = ${l.id}`
        yield* audit(sql, "order.forwarded", l, { supplier: l.supplierId, via })
      }
      if (note !== null) {
        yield* sql`update orders set supplier_note = ${note}
                   where id in ${sql.in([...new Set(going.map((l) => l.orderId))])}`
      }
      return {
        change: yield* answer(sql, ids, { legs: going.map(before), orders: [] }, [outboxId]),
        outboxId
      }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** "Als bevestigd markeren": the supplier has it. An order whose every leg is confirmed is at its suppliers. */
export const markConfirmed = Effect.fn("Forwarding.markConfirmed")(function*(input: typeof IdsInput.Type) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const legs = (yield* lock(sql, input.ids)).filter((l) => l.state === "awaiting" || l.state === "sending")
      if (legs.length === 0) return none()
      const ids = legs.map((l) => l.id)
      yield* sql`update forwarding_items set state = 'confirmed', since = now(), confirmed_at = now(),
                   confirmed_by = ${principal.id}
                 where id in ${sql.in(ids)}`
      for (const l of legs) yield* audit(sql, "order.forward_confirmed", l)
      // The supplier confirmed outside Insyte: its work is accepted (M8.3).
      yield* ensureWork(sql, ids)
      yield* sql`update supplier_work w set accepted_at = coalesce(w.accepted_at, now()),
                   accepted_by = coalesce(w.accepted_by, ${principal.id}),
                   status = case when w.status = 'to_accept' then 'to_ship' else w.status end, updated_at = now()
                 from forwarding_items f
                 where f.id in ${sql.in(ids)} and w.order_id = f.order_id and w.supplier_id = f.supplier_id`
      const orders = yield* sql<{ id: string; status: string }>`
        select o.id, o.status from orders o
        where o.id in ${sql.in([...new Set(legs.map((l) => l.orderId))])} and o.status = 'paid'
          and not exists (select 1 from forwarding_items f where f.order_id = o.id
                          and f.state not in ('confirmed', 'cancelled'))`
      if (orders.length > 0) {
        yield* sql`update orders set status = 'at_supplier' where id in ${sql.in(orders.map((o) => o.id))}`
      }
      return yield* answer(sql, ids, { legs: legs.map(before), orders })
    })
  )
})

/** "Andere leverancier": a leg to forward or in error goes to another supplier that is not paused. */
export const reroute = Effect.fn("Forwarding.reroute")(function*(input: typeof RerouteInput.Type) {
  yield* Policy.require("orders", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [leg] = yield* lock(sql, [input.id])
      const l = leg!
      if (l.state !== "to_forward" && l.state !== "error") {
        return yield* new Conflict({ entity: "forwarding_item", reason: "already_sent" })
      }
      if (l.supplierId === input.toSupplierId) return none()
      const [to] = yield* sql<{ paused: boolean }>`
        select paused_at is not null as paused from suppliers where id = ${input.toSupplierId} and deleted_at is null`
      if (to === undefined) return yield* new NotFound({ entity: "supplier", id: input.toSupplierId })
      if (to.paused) return yield* new Conflict({ entity: "supplier", reason: "paused" })
      const [taken] = yield* sql`select 1 from forwarding_items where order_id = ${l.orderId}
                                   and supplier_id = ${input.toSupplierId} and state <> 'cancelled' limit 1`
      if (taken !== undefined) return yield* new Conflict({ entity: "forwarding_item", reason: "supplier_has_leg" })
      yield* sql`update forwarding_items set supplier_id = ${input.toSupplierId},
                   from_supplier_id = coalesce(${l.supplierId}, from_supplier_id), state = 'to_forward', since = now(),
                   error_kind = null, error_note = null
                 where id = ${l.id}`
      yield* audit(sql, "order.forward_rerouted", l, { from: l.supplierId, to: input.toSupplierId })
      return yield* answer(sql, [l.id], { legs: [before(l)], orders: [] })
    })
  )
})

/** "Annuleren": the leg is not sent. One the supplier confirmed stays. */
export const cancel = Effect.fn("Forwarding.cancel")(function*(input: typeof IdsInput.Type) {
  yield* Policy.require("orders", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const legs = (yield* lock(sql, input.ids)).filter((l) => l.state === "to_forward" || l.state === "error")
      if (legs.length === 0) return none()
      const ids = legs.map((l) => l.id)
      yield* sql`update forwarding_items set state = 'cancelled', since = now() where id in ${sql.in(ids)}`
      for (const l of legs) yield* audit(sql, "order.forward_cancelled", l)
      return yield* answer(sql, ids, { legs: legs.map(before), orders: [] })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(ForwardingRestore)

/** `Shared.undo`'s compensation: the legs as they were (a forward's send is cancelled with its outbox row). */
export const restore = Effect.fn("Forwarding.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("orders", 2)
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  for (const l of undo.legs) {
    yield* sql`update forwarding_items set state = ${l.state}, supplier_id = ${l.supplierId},
                 from_supplier_id = ${l.fromSupplierId}, via = ${l.via}, since = ${new Date(l.since)},
                 error_kind = ${l.errorKind}, error_note = ${l.errorNote}, operator_note = ${l.operatorNote},
                 confirmed_at = ${l.confirmedAt === null ? null : new Date(l.confirmedAt)},
                 outbox_id = case when ${l.state} = 'sending' then outbox_id end
               where id = ${l.id}`
  }
  for (const o of undo.orders) {
    yield* sql`update orders set status = ${o.status} where id = ${o.id} and status = 'at_supplier'`
  }
})
