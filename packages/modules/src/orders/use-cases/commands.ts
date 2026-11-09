import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
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
  type CancelInput,
  normaliseTag,
  OrderChange,
  OrdersRestore,
  type ShippingInput,
  SYSTEM_TAGS,
  type TagInput
} from "../domain/Commands.ts"
import { type Row, SELECT, toRow } from "./orders.ts"

/*
 * The order commands (M7.1; api.md §2.4), at `orders` Bewerken, inside the role's stores. Each changes the mirror at
 * once, records the change, and tells Shopify through the outbox: after the undo window for what can be taken back
 * (tags, the shipping address, marking fulfilled; one undo token per command, `Shared.undo` restores what was), at
 * once and without undo for a cancellation (ADR-0023). The internal note is Insyte's own and never reaches Shopify.
 */

const RESTORE = "orders.restore"

interface Locked {
  readonly id: string
  readonly tags: ReadonlyArray<string>
  readonly status: string
  readonly fulfillmentStatus: string
  readonly shippingAddress: unknown
  readonly shippedAt: Date | null
}

/** The orders, locked, inside the role's stores; any one missing is `NotFound`. */
const lock = Effect.fn("Orders.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* inScope(sql, "o.store_id")
  const rows = yield* sql<Locked>`
    select o.id, o.tags, o.status, o.fulfillment_status, o.shipping_address, o.shipped_at from orders o
    where o.id in ${sql.in([...new Set(ids)])} and ${scope} order by o.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "order", id: missing })
  return rows
})

/** The orders as the list shows them, after the change. */
const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  Effect.map(
    sql<Row>`select ${sql.literal(SELECT)} from orders o where o.id in ${sql.in([...ids])}
             order by o.placed_at desc, o.id desc`,
    (rows) => rows.map(toRow)
  )

const audit = (sql: SqlClient.SqlClient, action: string, orderId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "order",
        subjectId: orderId,
        diff
      })
  )

const iso = (d: Date | null) => (d === null ? null : d.toISOString())
const closed = (o: Locked) => o.status === "cancelled" || o.status === "refunded"

/** Writes the outbox event for Shopify and the undo token that can still cancel it; kicks it after commit. */
const later = Effect.fn("Orders.later")(function*(
  sql: SqlClient.SqlClient,
  event: { readonly orderIds: ReadonlyArray<string>; readonly change: "tags" | "shipping" | "fulfil" } & {
    readonly add?: ReadonlyArray<string>
    readonly remove?: ReadonlyArray<string>
  },
  restore: OrdersRestore
) {
  const p = yield* CurrentPrincipal
  const outboxId = yield* Outbox.write(sql, p.workspaceId, {
    type: "order.updated",
    workspaceId: p.workspaceId,
    userId: p.userId ?? p.id,
    orderIds: [...event.orderIds],
    change: event.change,
    add: [...(event.add ?? [])],
    remove: [...(event.remove ?? [])]
  }, { afterSeconds: UNDO_SECONDS })
  const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds: [outboxId] })
  return { outboxId, undo }
})

/** Adds and takes off the operator's tags; orders where nothing changes are left out of the change. */
export const tag = Effect.fn("Orders.tag")(function*(input: typeof TagInput.Type) {
  yield* Policy.require("orders", 2)
  const add = [...new Set(input.add.map(normaliseTag).filter((t) => t !== ""))]
  const remove = [...new Set(input.remove)]
  const system = [...add, ...remove].find((t) => SYSTEM_TAGS.has(t))
  if (system !== undefined) return yield* new Invalid({ fields: { tags: "system" } })
  if (add.length === 0 && remove.length === 0) return yield* new Invalid({ fields: { tags: "empty" } })
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const changed = locked.flatMap((o) => {
        const tags = [...o.tags.filter((t) => !remove.includes(t)), ...add.filter((t) => !o.tags.includes(t))]
        return tags.length === o.tags.length && tags.every((t) => o.tags.includes(t)) ? [] : [{ before: o, tags }]
      })
      if (changed.length === 0) return { change: new OrderChange({ orders: [], undo: null }), outboxId: null }
      for (const { before, tags } of changed) {
        yield* sql`update orders set tags = ${tags}::text[] where id = ${before.id}`
        yield* audit(sql, "order.tagged", before.id, { tags: [before.tags, tags] })
      }
      const ids = changed.map((c) => c.before.id)
      const { outboxId, undo } = yield* later(sql, { orderIds: ids, change: "tags", add, remove }, {
        orders: changed.map((c) => ({ id: c.before.id, tags: [...c.before.tags] }))
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, ids), undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** Marks orders fulfilled without tracking (Shopify's `fulfillmentCreate` after the window). */
export const markFulfilled = Effect.fn("Orders.markFulfilled")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("orders", 2)
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, ids)
      if (locked.some(closed)) return yield* new Conflict({ entity: "order", reason: "closed" })
      if (locked.some((o) => o.fulfillmentStatus === "fulfilled")) {
        return yield* new Conflict({ entity: "order", reason: "fulfilled" })
      }
      for (const o of locked) {
        yield* sql`update orders set fulfillment_status = 'fulfilled', shipped_at = coalesce(shipped_at, now()),
                     status = case when status = 'delivered' then status else 'shipped' end
                   where id = ${o.id}`
        yield* audit(sql, "order.fulfilled", o.id, { fulfillmentStatus: [o.fulfillmentStatus, "fulfilled"] })
      }
      const orderIds = locked.map((o) => o.id)
      const { outboxId, undo } = yield* later(sql, { orderIds, change: "fulfil" }, {
        orders: locked.map((o) => ({
          id: o.id,
          status: o.status,
          fulfillmentStatus: o.fulfillmentStatus,
          shippedAt: iso(o.shippedAt)
        }))
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, orderIds), undo }), outboxId }
    })
  )
  yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** The order's shipping address; the name and phone on it stay (Shopify's `orderUpdate` after the window). */
export const updateShipping = Effect.fn("Orders.updateShipping")(function*(input: typeof ShippingInput.Type) {
  yield* Policy.require("orders", 2)
  const a = input.address
  const wrong: Record<string, string> = Object.fromEntries(
    (["line1", "city", "country"] as const).filter((f) => a[f].trim() === "").map((f) => [`address.${f}`, "required"])
  )
  if (a.country.trim() !== "" && !/^[a-z]{2}$/i.test(a.country.trim())) wrong["address.country"] = "format"
  if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* lock(sql, [input.id])
      if (closed(before!)) return yield* new Conflict({ entity: "order", reason: "closed" })
      const previous = (before!.shippingAddress ?? {}) as Record<string, unknown>
      const address = {
        name: previous["name"] ?? null,
        line1: a.line1.trim(),
        line2: a.line2?.trim() || null,
        city: a.city.trim(),
        postcode: a.postcode.trim(),
        region: a.region.trim() || null,
        country: a.country.trim().toUpperCase(),
        phone: previous["phone"] ?? null
      }
      yield* sql`update orders set shipping_address = ${JSON.stringify(address)}::jsonb where id = ${input.id}`
      // The address itself stays out of the audit diff: personal data is read where it lives.
      yield* audit(sql, "order.shipping_updated", input.id)
      const { outboxId, undo } = yield* later(sql, { orderIds: [input.id], change: "shipping" }, {
        orders: [{ id: input.id, shippingAddress: before!.shippingAddress }]
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, [input.id]), undo }), outboxId }
    })
  )
  yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * Cancels orders: irreversible (api.md §1.1), so the console confirms first and there is no undo token; Shopify's
 * `orderCancel` goes at once. An order already closed, or with parcels on their way, cannot be cancelled.
 */
export const cancel = Effect.fn("Orders.cancel")(function*(input: typeof CancelInput.Type) {
  yield* Policy.require("orders", 2)
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      if (locked.some(closed)) return yield* new Conflict({ entity: "order", reason: "closed" })
      if (locked.some((o) => o.fulfillmentStatus !== "unfulfilled")) {
        return yield* new Conflict({ entity: "order", reason: "fulfilled" })
      }
      for (const o of locked) {
        yield* sql`update orders set status = 'cancelled', cancelled_at = now() where id = ${o.id}`
        // Legs not yet with a supplier are not sent (M8.2); one a supplier has stays, for the supplier to hear of it.
        yield* sql`update forwarding_items set state = 'cancelled', since = now()
                   where order_id = ${o.id} and state in ('to_forward', 'sending', 'error')`
        yield* sql`update supplier_work set status = 'closed', updated_at = now()
                   where order_id = ${o.id} and status in ('to_accept', 'to_ship', 'problem')`
        yield* audit(sql, "order.cancelled", o.id, {
          status: [o.status, "cancelled"],
          restock: input.restock,
          notify: input.notify
        })
      }
      const p = yield* CurrentPrincipal
      const orderIds = locked.map((o) => o.id)
      const outboxId = yield* Outbox.write(sql, p.workspaceId, {
        type: "order.cancelled",
        workspaceId: p.workspaceId,
        userId: p.userId ?? p.id,
        orderIds,
        restock: input.restock,
        notify: input.notify
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, orderIds), undo: null }), outboxId }
    })
  )
  yield* relay.kick([sent])
  return change
})

/** The internal note: written, replaced, or cleared when empty. Insyte's alone, so no outbox and no undo. */
export const setNote = Effect.fn("Orders.setNote")(function*(id: string, body: string) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lock(sql, [id])
      const text = body.trim()
      if (text === "") yield* sql`delete from order_notes where order_id = ${id}`
      else {
        yield* sql`insert into order_notes (order_id, workspace_id, body, updated_by)
                   values (${id}, ${principal.workspaceId}, ${text}, ${principal.id})
                   on conflict (order_id) do update set body = excluded.body, updated_by = excluded.updated_by,
                                                        updated_at = now()`
      }
      yield* audit(sql, text === "" ? "order.note_cleared" : "order.note_set", id)
    })
  )
})

/** The operator's tags in the role's stores with how many orders carry each, the most used first. */
export const tags = Effect.fn("Orders.tags")(function*() {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  const rows = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      return yield* sql<{ tag: string; count: number }>`
        select t as tag, count(*)::int as count from orders o, unnest(o.tags) as t
        where ${scope} group by t order by count(*) desc, t limit 200`
    })
  )
  return rows.filter((r) => !SYSTEM_TAGS.has(r.tag))
})

const decodeRestore = Schema.decodeUnknownEffect(OrdersRestore)

/**
 * `Shared.undo` of an order command: each order's fields as they were. Run on the undo's transaction, after the token
 * is spent and Shopify's write cancelled, so nothing reaches Shopify.
 */
export const restore = Effect.fn("Orders.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("orders", 2)
  const { orders } = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* lock(sql, orders.map((o) => o.id)).pipe(
    Effect.catchTag("NotFound", () => Effect.fail(new Conflict({ entity: "order", reason: "gone" })))
  )
  for (const o of orders) {
    if (o.tags !== undefined) yield* sql`update orders set tags = ${[...o.tags]}::text[] where id = ${o.id}`
    if (o.shippingAddress !== undefined) {
      yield* sql`update orders set shipping_address = nullif(${
        JSON.stringify(o.shippingAddress)
      }::jsonb, 'null') where id = ${o.id}`
    }
    if (o.fulfillmentStatus !== undefined) {
      yield* sql`update orders set fulfillment_status = ${o.fulfillmentStatus}, status = ${o.status ?? "paid"},
                   shipped_at = ${o.shippedAt === undefined || o.shippedAt === null ? null : new Date(o.shippedAt)}
                 where id = ${o.id}`
    }
    yield* audit(sql, "order.restored", o.id)
  }
})
