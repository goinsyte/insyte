import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  AlreadyRefunded,
  type RefundInput,
  RefundOverBalance,
  RefundOverLimit,
  RefundResult
} from "../domain/Refunds.ts"
import { type Row, SELECT, toRow } from "./orders.ts"

/*
 * `Orders.refund` (M7.2; 04 §7): at Bestellingen · Bewerken with Terugbetalen, within the role's limit per order and
 * what is left on it. Irreversible (ADR-0023): the console confirmed, so there is no undo token, and `refund.requested`
 * is relayed at once. The refund is `pending` until Shopify took it (`ShopifyWriteWorkflow`): it counts against the
 * balance at once, so it cannot be asked twice, but the order reads as refunded only once Shopify says so. The same
 * refund id asked again answers the same refund: a request retried refunds once.
 */

/** Refunds that count against the balance: all but those Shopify refused. */
const COUNTED = "status <> 'failed'"

/**
 * The refund on the caller's transaction, inside the role's limit and stores; the caller has checked the policy and
 * kicks the relay with the answered outbox row. `Returns.resolve` refunds a return this way, on its own transaction.
 */
export const refundOn = Effect.fn("Orders.refundOn")(
  function*(sql: SqlClient.SqlClient, input: typeof RefundInput.Type) {
    const principal = yield* CurrentPrincipal
    const limit = principal.role.refundLimit
    if (principal.role.id !== "owner" && limit !== null && input.amountMinor > Math.round(limit * 100)) {
      return yield* new RefundOverLimit({ limitMinor: Math.round(limit * 100) })
    }
    return yield* Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [order] = yield* sql<{
        storeId: string
        totalMinor: string
        currency: string
        paymentStatus: string
        refundedMinor: string
      }>`
        select o.store_id, o.total_minor, o.currency, o.payment_status,
               coalesce((select sum(r.amount_minor) from refunds r
                         where r.order_id = o.id and ${sql.literal(COUNTED)}), 0) as refunded_minor
        from orders o where o.id = ${input.id} and ${scope} for update`
      if (order === undefined) return yield* new NotFound({ entity: "order", id: input.id })

      const readRow = Effect.map(
        sql<Row>`select ${sql.literal(SELECT)} from orders o where o.id = ${input.id}`,
        ([row]) => toRow(row!)
      )
      // Asked before: the same refund, not a second one.
      const [earlier] = yield* sql<{ orderId: string }>`select order_id from refunds where id = ${input.refundId}`
      if (earlier !== undefined) {
        if (earlier.orderId !== input.id) return yield* new Conflict({ entity: "refund", reason: "refund_id_taken" })
        return { result: new RefundResult({ refundId: input.refundId, order: yield* readRow }), outboxId: null }
      }

      const balance = Number(order.totalMinor) - Number(order.refundedMinor)
      if (order.paymentStatus === "pending" || order.paymentStatus === "voided" || balance <= 0) {
        return yield* new AlreadyRefunded({ orderId: input.id })
      }
      if (input.amountMinor > balance) return yield* new RefundOverBalance({ balanceMinor: balance })

      const inserted = yield* sql`
        insert into refunds (id, workspace_id, store_id, order_id, shopify_id, amount_minor, currency, note, status,
                             created_by, created_at)
        values (${input.refundId}, ${principal.workspaceId}, ${order.storeId}, ${input.id}, ${`insyte-${input.refundId}`},
                ${input.amountMinor}, ${order.currency}, ${
        input.note?.trim() || null
      }, 'pending', ${principal.id}, now())
        on conflict (id) do nothing returning id`
      // The id is another workspace's: never this request's to reuse.
      if (inserted.length === 0) return yield* new Conflict({ entity: "refund", reason: "refund_id_taken" })

      const full = input.amountMinor === balance
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "order.refunded",
        subjectType: "order",
        subjectId: input.id,
        diff: { refundId: input.refundId, amountMinor: input.amountMinor, currency: order.currency, full }
      })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "refund.requested",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        orderIds: [input.id],
        refundId: input.refundId
      })
      return { result: new RefundResult({ refundId: input.refundId, order: yield* readRow }), outboxId }
    })
  }
)

export const refund = Effect.fn("Orders.refund")(function*(input: typeof RefundInput.Type) {
  yield* Policy.require("orders", 2)
  yield* Policy.requireAction("refunds.write")
  const relay = yield* Relay
  const db = yield* Db
  const { result, outboxId: requested } = yield* db.scoped((sql) => refundOn(sql, input))
  if (requested !== null) yield* relay.kick([requested])
  return result
})
