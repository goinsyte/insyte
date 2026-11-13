import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId, gidOf, toMinor } from "../../stores/domain/Mirror.ts"
import { ConnectionGate } from "../../stores/domain/Ports.ts"
import { StoreMirror } from "../../stores/Mirror.ts"
import {
  FULFILLABLE,
  FULFILLMENT_CREATE,
  FULFILLMENT_ORDERS,
  ORDER_CANCEL,
  ORDER_UPDATE,
  type OrderWrite,
  REFUND_CREATE,
  SUGGESTED_REFUND,
  TAGS_ADD,
  TAGS_REMOVE
} from "../domain/WriteBack.ts"

/*
 * Shopify hears what changed in Insyte (M7.1), one order at a time, from the `ShopifyWrite` Workflow's steps: the undo
 * window has passed (or, for a cancellation, there was none). Tags go as the change, so a tag Shopify gained since
 * stays; the address is read as it is now. Shopify refusing is final for that order: the mirror reads the order again
 * from Shopify, so Insyte shows what the store holds, and the refusal is in the audit log. A throttled or unreachable
 * Shopify fails the step, which retries. A refund (M7.2) that does not reach Shopify is marked failed, so its amount
 * stops counting against the order; one Shopify took makes the order read refunded.
 */

interface FulfillmentOrder {
  readonly id: string
  readonly status: string
  readonly lineItems?: {
    readonly nodes: ReadonlyArray<{ id: string; remainingQuantity: number; lineItem: { id: string } }>
  }
}

interface Target {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
  readonly shopifyId: string
  readonly shippingAddress: Record<string, string | null> | null
}

/** Shopify's MailingAddressInput from the mirror's address: a region sent only where it is a code. */
const mailingAddress = (a: Record<string, string | null>) => {
  const [first, ...rest] = (a["name"] ?? "").trim().split(/\s+/)
  const region = a["region"] ?? ""
  return {
    address1: a["line1"],
    address2: a["line2"],
    city: a["city"],
    zip: a["postcode"],
    countryCode: a["country"],
    ...(/^[A-Z0-9]{1,3}$/.test(region) ? { provinceCode: region } : {}),
    ...(first === undefined || first === "" ? {} : { firstName: first, lastName: rest.join(" ") }),
    ...(a["phone"] ? { phone: a["phone"] } : {})
  }
}

const send = Effect.fn("Orders.writeBack.send")(function*(
  write: Exclude<OrderWrite, { type: "refund.requested" }>,
  target: Target
) {
  const gid = gidOf("Order", target.shopifyId)
  if (write.type === "order.cancelled") {
    const { errors } = yield* mutate(
      target,
      ORDER_CANCEL,
      { orderId: gid, restock: write.restock, notify: write.notify },
      "orderCancel",
      "orderCancelUserErrors"
    )
    return errors
  }
  switch (write.change) {
    case "tags": {
      const added = write.add.length === 0
        ? []
        : (yield* mutate(target, TAGS_ADD, { id: gid, tags: write.add }, "tagsAdd")).errors
      if (added.length > 0) return added
      return write.remove.length === 0
        ? []
        : (yield* mutate(target, TAGS_REMOVE, { id: gid, tags: write.remove }, "tagsRemove")).errors
    }
    case "shipping": {
      if (target.shippingAddress === null) return []
      const input = { id: gid, shippingAddress: mailingAddress(target.shippingAddress) }
      return (yield* mutate(target, ORDER_UPDATE, { input }, "orderUpdate")).errors
    }
    case "fulfil": {
      const { data } = yield* mutate(target, FULFILLMENT_ORDERS, { id: gid }, "order")
      const nodes = ((data as { order?: { fulfillmentOrders?: { nodes?: ReadonlyArray<FulfillmentOrder> } } })
        ?.order?.fulfillmentOrders?.nodes) ?? []
      const open = nodes.filter((n) => FULFILLABLE.has(n.status))
      // A supplier's parcel carries only its own lines (M8.3); without lines, everything still open.
      const only = write.lines === undefined ? undefined : new Set(write.lines)
      const byOrder = open.flatMap((n) => {
        if (only === undefined) return [{ fulfillmentOrderId: n.id }]
        const items = (n.lineItems?.nodes ?? []).filter((li) =>
          li.remainingQuantity > 0 && only.has(li.lineItem.id.split("/").pop() ?? "")
        )
        return items.length === 0 ? [] : [{
          fulfillmentOrderId: n.id,
          fulfillmentOrderLineItems: items.map((li) => ({ id: li.id, quantity: li.remainingQuantity }))
        }]
      })
      // Fulfilled in Shopify already (by hand, or by the supplier's app): nothing left to do.
      if (byOrder.length === 0) return []
      const fulfillment = {
        lineItemsByFulfillmentOrder: byOrder,
        // The supplier portal's parcel mails the customer the tracking (M16); an operator's does not.
        notifyCustomer: write.notify ?? false,
        ...(write.tracking === undefined ? {} : { trackingInfo: write.tracking })
      }
      return (yield* mutate(target, FULFILLMENT_CREATE, { fulfillment }, "fulfillmentCreate")).errors
    }
  }
})

interface PendingRefund {
  readonly amountMinor: string
  readonly currency: string
  readonly note: string | null
  readonly status: string
}

/**
 * The refund to Shopify (M7.2): Shopify's own split of the order's payments, up to the amount, under Insyte's refund id
 * as the idempotency key. Taken, the refund carries Shopify's id and the order reads refunded as far as it is.
 */
const sendRefund = Effect.fn("Orders.writeBack.refund")(function*(
  write: Extract<OrderWrite, { type: "refund.requested" }>,
  target: Target,
  orderId: string
) {
  const db = yield* Db
  const [refund] = yield* db.scopedFor((sql) =>
    sql<PendingRefund>`select amount_minor, currency, note, status from refunds where id = ${write.refundId}`
  )
  // Already taken (a step retried after Shopify answered), or never there: nothing to send.
  if (refund === undefined || refund.status !== "pending") return []
  const gid = gidOf("Order", target.shopifyId)
  const { data } = yield* mutate(target, SUGGESTED_REFUND, { id: gid }, "order")
  const suggested = ((data as {
    order?: {
      suggestedRefund?: {
        suggestedTransactions?: Array<
          { parentTransaction: { id: string } | null; gateway: string; amountSet: { shopMoney: { amount: string } } }
        >
      }
    }
  })?.order?.suggestedRefund?.suggestedTransactions) ?? []
  let left = Number(refund.amountMinor)
  const transactions = suggested.flatMap((t) => {
    const take = Math.min(left, toMinor(t.amountSet.shopMoney.amount, refund.currency))
    if (take <= 0 || t.parentTransaction === null) return []
    left -= take
    return [{
      orderId: gid,
      parentId: t.parentTransaction.id,
      kind: "REFUND",
      gateway: t.gateway,
      amount: fromMinor(take, refund.currency)
    }]
  })
  if (left > 0) return [{ message: "Shopify ziet niet genoeg om terug te betalen op deze bestelling" }]
  const input = { orderId: gid, notify: true, transactions, ...(refund.note === null ? {} : { note: refund.note }) }
  const answered = yield* mutate(target, REFUND_CREATE, { input, key: write.refundId }, "refundCreate")
  if (answered.errors.length > 0) return answered.errors
  const shopifyId = (answered.data as { refundCreate?: { refund?: { id: string } | null } })?.refundCreate?.refund?.id
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (shopifyId !== undefined) {
        // Shopify's webhook may have mirrored the refund first: the row Insyte wrote is the one that stays.
        yield* sql`delete from refunds where store_id = ${target.storeId} and shopify_id = ${gidId(shopifyId)}
                   and id <> ${write.refundId}`
      }
      yield* sql`update refunds set status = 'succeeded', shopify_id = ${
        shopifyId === undefined ? `insyte-${write.refundId}` : gidId(shopifyId)
      } where id = ${write.refundId}`
      yield* sql`update orders o set
                   payment_status = case when r.refunded >= o.total_minor then 'refunded' else 'partially_refunded' end,
                   status = case when r.refunded >= o.total_minor and o.status <> 'cancelled' then 'refunded'
                                 else o.status end,
                   refunded_at = case when r.refunded >= o.total_minor then now() else o.refunded_at end
                 from (select coalesce(sum(amount_minor), 0) as refunded from refunds
                       where order_id = ${orderId} and status = 'succeeded') r
                 where o.id = ${orderId}`
    })
  )
  return []
})

/**
 * A refund that will not reach Shopify (refused, disconnected, or Shopify unreachable through every retry) is failed,
 * so its amount no longer counts against the order, and the audit log says why.
 */
export const refundFailed = Effect.fn("Orders.refundFailed")(function*(
  refundId: string,
  orderId: string,
  reason: string
) {
  const db = yield* Db
  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const failed = yield* sql`update refunds set status = 'failed' where id = ${refundId} and status = 'pending'
                                returning id`
      if (failed.length === 0) return
      yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "order.refund_failed",
        subjectType: "order",
        subjectId: orderId,
        diff: { refundId, reason: reason.slice(0, 300) }
      })
    })
  )
})

/** Sends one order's change to Shopify; answers what became of it. */
export const writeBack = Effect.fn("Orders.writeBack")(function*(write: OrderWrite, orderId: string) {
  const db = yield* Db
  const [target] = yield* db.scopedFor((sql) =>
    sql<Target>`
      select s.id as store_id, s.connection_id, s.shop_domain as shop, s.currency, s.status, o.shopify_id,
             o.shipping_address
      from orders o join stores s on s.id = o.store_id where o.id = ${orderId}`
  )
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: orderId,
    outcome: o,
    reason
  })
  // Gone since, or its store disconnected: a reconnect imports the store again, as Shopify holds it.
  const workspace = yield* CurrentWorkspace
  const failRefund = (reason: string) =>
    write.type === "refund.requested" ? refundFailed(write.refundId, orderId, reason) : Effect.void
  if (target === undefined) return outcome("skipped", "gone")
  if (target.status !== "connected" && target.status !== "connecting") {
    yield* failRefund("disconnected")
    return outcome("skipped", "disconnected")
  }
  const store = { id: target.storeId, connectionId: target.connectionId, shop: target.shop, currency: target.currency }

  const sent = write.type === "refund.requested" ? sendRefund(write, target, orderId) : send(write, target)
  const answer = yield* sent.pipe(
    Effect.map((errors) => errors.length === 0 ? null : errors.map((e) => e.message).join("; ")),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed("disconnected" as const),
      ShopifyRefused: (error) =>
        isAnswer(error)
          ? Effect.succeed(error.reason)
          : Effect.flatMap(
            error.status === 401
              ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(target.connectionId))
              : Effect.void,
            () => Effect.fail(error)
          )
    })
  )
  if (answer === null) return outcome("sent")
  if (answer === "disconnected") {
    yield* failRefund("disconnected")
    return outcome("skipped", "disconnected")
  }
  if (write.type === "refund.requested") {
    yield* failRefund(answer)
    return outcome("refused", answer)
  }

  // Shopify said no: Insyte shows the order as the store holds it, and the refusal is recorded.
  yield* (yield* StoreMirror).mirrorOne(store, "Order", gidOf("Order", target.shopifyId))
  yield* db.scopedFor((sql) =>
    Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
      action: "order.shopify_refused",
      subjectType: "order",
      subjectId: orderId,
      diff: { change: write.type === "order.cancelled" ? "cancel" : write.change, reason: answer.slice(0, 300) }
    }).pipe(
      // A parcel the supplier marked shipped in its portal (M16): its contacts and the brand hear it did not go.
      Effect.andThen(
        write.type === "order.updated" && write.change === "fulfil" && write.supplierId !== undefined
          ? Outbox.write(sql, workspace.id, {
            type: "supplier.shipment_refused",
            workspaceId: workspace.id,
            orderId,
            supplierId: write.supplierId
          })
          : Effect.void
      )
    )
  )
  return outcome("refused", answer)
})
