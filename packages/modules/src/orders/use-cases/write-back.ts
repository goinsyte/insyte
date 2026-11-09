import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, ShopifyGraphql, type ShopifyRefused } from "../../stores/domain/Ports.ts"
import { throughGate } from "../../stores/use-cases/backfill.ts"
import { mirrorOne } from "../../stores/use-cases/webhooks.ts"
import {
  FULFILLABLE,
  FULFILLMENT_CREATE,
  FULFILLMENT_ORDERS,
  ORDER_CANCEL,
  ORDER_UPDATE,
  type OrderWrite,
  TAGS_ADD,
  TAGS_REMOVE,
  type WriteOutcome
} from "../domain/WriteBack.ts"

/*
 * Shopify hears what changed in Insyte (M7.1), one order at a time, from the `ShopifyWrite` Workflow's steps: the undo
 * window has passed (or, for a cancellation, there was none). Tags go as the change, so a tag Shopify gained since
 * stays; the address is read as it is now. Shopify refusing is final for that order: the mirror reads the order again
 * from Shopify, so Insyte shows what the store holds, and the refusal is in the audit log. A throttled or unreachable
 * Shopify fails the step, which retries.
 */

interface Target {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
  readonly shopifyId: string
  readonly shippingAddress: Record<string, string | null> | null
}

type Errors = ReadonlyArray<{ readonly message: string }>

const errorsAt = (data: unknown, root: string, field = "userErrors"): Errors =>
  ((data as Record<string, Record<string, unknown> | null> | null)?.[root]?.[field] as Errors | undefined) ?? []

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

/** One mutation through the gate: its user errors, or none. */
const mutate = (target: Target, query: string, variables: Record<string, unknown>, root: string, field?: string) =>
  Effect.flatMap(Effect.service(ShopifyGraphql), (graphql) =>
    Effect.map(
      throughGate(target, 10, (token) => graphql.query(target.shop, token, query, variables)),
      ({ data }) => ({ data, errors: errorsAt(data, root, field) })
    ))

const send = Effect.fn("Orders.writeBack.send")(function*(write: OrderWrite, target: Target) {
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
      const nodes = ((data as { order?: { fulfillmentOrders?: { nodes?: Array<{ id: string; status: string }> } } })
        ?.order?.fulfillmentOrders?.nodes) ?? []
      const open = nodes.filter((n) => FULFILLABLE.has(n.status))
      // Fulfilled in Shopify already (by hand, or by the supplier's app): nothing left to do.
      if (open.length === 0) return []
      const fulfillment = {
        lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })),
        notifyCustomer: false
      }
      return (yield* mutate(target, FULFILLMENT_CREATE, { fulfillment }, "fulfillmentCreate")).errors
    }
  }
})

/** A refusal that is Shopify's answer about the order, not a reason to try again. */
const isAnswer = (error: ShopifyRefused) => error.status >= 400 && error.status < 500 && error.status !== 401

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
    orderId,
    outcome: o,
    reason
  })
  // Gone since, or its store disconnected: a reconnect imports the store again, as Shopify holds it.
  if (target === undefined) return outcome("skipped", "gone")
  if (target.status !== "connected" && target.status !== "connecting") return outcome("skipped", "disconnected")
  const store = { id: target.storeId, connectionId: target.connectionId, shop: target.shop, currency: target.currency }

  const answer = yield* send(write, { ...target }).pipe(
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
  if (answer === "disconnected") return outcome("skipped", "disconnected")

  // Shopify said no: Insyte shows the order as the store holds it, and the refusal is recorded.
  yield* mirrorOne(store, "Order", gidOf("Order", target.shopifyId))
  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
      action: "order.shopify_refused",
      subjectType: "order",
      subjectId: orderId,
      diff: { change: write.type === "order.cancelled" ? "cancel" : write.change, reason: answer.slice(0, 300) }
    })
  )
  return outcome("refused", answer)
})
