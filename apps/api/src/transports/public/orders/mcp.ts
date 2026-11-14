import { OrdersTools } from "@insyte/api/mcp/tools/OrdersTools"
import { Effect, Layer } from "effect"
import { governed, type Plan, token } from "../mcp/Governance.ts"
import { kicker } from "../mcp/Outbox.ts"
import { OrdersV1 } from "./OrdersV1.ts"

const euro = (minor: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(minor / 100)

export const OrdersMcp = OrdersTools.toLayer(Effect.gen(function*() {
  const read = yield* OrdersV1
  const kicking = yield* kicker
  const orderSubject = (id: string) =>
    Effect.map(read.order(id), (o) => ({
      order: o,
      subject: { type: "order", id: o.id, label: o.number },
      storeId: o.store_id
    }))
  return {
    get_order: ({ order_id }) => read.order(order_id),
    tag_order: ({ order_id, idempotency_key, ...body }) =>
      governed(
        "tag_order",
        idempotency_key,
        Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => {
          const add = (body.add ?? []).filter((t) => !order.tags.includes(t))
          const remove = (body.remove ?? []).filter((t) => order.tags.includes(t))
          return {
            action: "ApplyLabel",
            storeId,
            subject,
            sentence: `Labels van bestelling ${order.number} aangepast`,
            before: order.tags.join(", ") || "Geen labels",
            after: order.tags.filter((t) => !remove.includes(t)).concat(add).join(", ") || "Geen labels",
            ask: { _tag: "TagOrder", orderId: order_id, add: body.add ?? [], remove: body.remove ?? [] },
            effect: () => ({ kind: "order.tags", orderId: order_id, add, remove })
          }
        }),
        kicking(read.tagOrder(order_id, body, idempotency_key))
      ),
    set_order_note: ({ order_id, idempotency_key, body }) =>
      governed(
        "set_order_note",
        idempotency_key,
        Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
          action: "AddNote",
          storeId,
          subject,
          sentence: body.trim() === ""
            ? `Interne notitie van bestelling ${order.number} gewist`
            : `Interne notitie bij bestelling ${order.number} gezet`,
          before: order.internal_note,
          after: body,
          ask: { _tag: "SetOrderNote", orderId: order_id, body },
          effect: () => ({ kind: "order.note", orderId: order_id, before: order.internal_note ?? "" })
        })),
        kicking(read.noteOrder(order_id, { body }, idempotency_key))
      ),
    update_shipping_address: ({ order_id, idempotency_key, ...address }) =>
      kicking(read.shipOrderTo(order_id, address, idempotency_key)),
    // Like the address, outside the autonomy catalogue (no agent action names a delay yet): run as the key may.
    flag_order_delayed: ({ order_id, idempotency_key }) => kicking(read.delayOrder(order_id, idempotency_key)),
    clear_order_delay: ({ order_id, idempotency_key }) => kicking(read.clearOrderDelay(order_id, idempotency_key)),
    cancel_order: ({ order_id, idempotency_key, ...body }) =>
      governed(
        "cancel_order",
        idempotency_key,
        Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
          action: "CancelOrder",
          storeId,
          subject,
          sentence: `Bestelling ${order.number} geannuleerd`,
          before: order.status,
          after: "Geannuleerd",
          ask: { _tag: "CancelOrder", orderId: order_id, restock: body.restock, notify: body.notify_customer },
          effect: token
        })),
        kicking(read.cancelOrder(order_id, body, idempotency_key))
      ),
    refund_order: ({ order_id, idempotency_key, ...body }) =>
      governed(
        "refund_order",
        idempotency_key,
        Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
          action: "RefundOrder",
          amountMinor: body.amount_minor,
          storeId,
          subject,
          sentence: `${euro(body.amount_minor)} terugbetaald op bestelling ${order.number}`,
          after: euro(body.amount_minor),
          ask: { _tag: "RefundOrder", orderId: order_id, amountMinor: body.amount_minor, note: body.note ?? null },
          effect: token
        })),
        kicking(read.refundOrder(order_id, body, idempotency_key))
      ),
    get_order_tracking: ({ order_id }) => read.tracking(order_id)
  }
})).pipe(Layer.provide(OrdersV1.layer))
