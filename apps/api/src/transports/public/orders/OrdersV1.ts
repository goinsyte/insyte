import { CurrentPrincipal } from "@insyte/domain/Principal"
import { OrdersService } from "@insyte/modules/orders/Orders"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { TrackingService } from "@insyte/modules/tracking/Tracking"
import { Context, Effect, Layer } from "effect"
import { orderV1 } from "../commerce/present.ts"
import { notForAgents } from "../mcp/Governance.ts"
import { notFound, refundV1, scopeMissing, writeV1 } from "../shared/errors.ts"
import { keyedId, refundIdOf } from "../shared/refunds.ts"
import { orderDetailV1, refundRowV1, trackingV1 } from "./present.ts"

/*
 * One order (M19.2, M19.3): read with its parcels (M8.4), and the order commands (M7, api.md §6), each once per
 * `Idempotency-Key`, over the use cases the console calls.
 */

const make = Effect.gen(function*() {
  const orders = yield* OrdersService
  const tracking = yield* TrackingService
  return {
    tracking: (id: string) =>
      tracking.forOrder(id).pipe(
        Effect.map(trackingV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    order: (id: string) =>
      orders.get(id).pipe(Effect.map(orderDetailV1), Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })),
    tagOrder: (
      id: string,
      body: { readonly add?: ReadonlyArray<string> | undefined; readonly remove?: ReadonlyArray<string> | undefined },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["tags", id, body],
        Effect.flatMap(
          orders.tag({ ids: [id], add: [...(body.add ?? [])], remove: [...(body.remove ?? [])] }),
          () => Effect.map(orders.get(id), (d) => orderV1(d.order))
        )
      ).pipe(Effect.catch(writeV1)),
    noteOrder: (id: string, body: { body: string }, key?: string) =>
      Idempotency.once(
        key,
        ["note", id, body],
        Effect.flatMap(orders.setNote(id, body.body), () => Effect.map(orders.get(id), orderDetailV1))
      ).pipe(Effect.catch(writeV1)),
    shipOrderTo: (
      id: string,
      a: {
        readonly line1: string
        readonly line2?: string | null | undefined
        readonly city: string
        readonly postcode: string
        readonly region?: string | undefined
        readonly country: string
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["shipping_address", id, a],
        Effect.map(
          orders.updateShipping({
            id,
            address: {
              line1: a.line1,
              line2: a.line2 ?? null,
              city: a.city,
              postcode: a.postcode,
              region: a.region ?? "",
              country: a.country
            }
          }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    cancelOrder: (id: string, body: { restock: boolean; notify_customer: boolean }, key?: string) =>
      Idempotency.once(
        key,
        ["cancel", id, body],
        Effect.map(
          orders.cancel({ ids: [id], restock: body.restock, notify: body.notify_customer }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    delayOrder: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["delay", id],
        Effect.flatMap(orders.flagDelayed([id]), () => Effect.map(orders.get(id), (d) => orderV1(d.order)))
      ).pipe(Effect.catch(writeV1)),
    clearOrderDelay: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["clear_delay", id],
        Effect.flatMap(orders.clearDelay([id]), () => Effect.map(orders.get(id), (d) => orderV1(d.order)))
      ).pipe(Effect.catch(writeV1)),
    // An agent's key may not mail a shopper, over `/v1` as over MCP: no agent action names it yet. The mail's id is
    // the key's, so a retry after the key's answer was let go still sends once.
    emailCustomer: (id: string, body: { readonly subject: string; readonly body: string }, key?: string) =>
      notForAgents(
        "email_order_customer",
        Effect.gen(function*() {
          const principal = yield* CurrentPrincipal
          const mailId = yield* keyedId("oml", key, principal.id)
          return yield* Idempotency.once(
            key,
            ["email", id, body],
            Effect.map(
              orders.emailCustomer({ orderId: id, subject: body.subject, body: body.body, id: mailId }),
              ({ mail }) => ({
                id: mail.id,
                order_id: mail.orderId,
                kind: mail.kind,
                state: mail.state,
                to: mail.to,
                subject: mail.subject
              })
            )
          ).pipe(
            Effect.catchTag(
              "CustomerMailRefused",
              () => Effect.fail({ _tag: "Conflict", entity: "order", reason: "no_email" } as const)
            ),
            Effect.catch(writeV1)
          )
        })
      ),
    refundOrder: (
      id: string,
      body: { readonly amount_minor: number; readonly note?: string | undefined },
      key?: string
    ) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const refundId = yield* refundIdOf(key, principal.id)
        return yield* Idempotency.once(
          key,
          ["refund", id, body],
          Effect.gen(function*() {
            const result = yield* orders.refund({
              id,
              refundId,
              amountMinor: body.amount_minor,
              ...(body.note === undefined ? {} : { note: body.note })
            })
            const detail = yield* orders.get(id)
            return refundRowV1(id, detail.refunds.find((r) => r.id === result.refundId)!)
          })
        )
      }).pipe(
        Effect.catch(refundV1)
      )
  }
})

/**
 * One order, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class OrdersV1 extends Context.Service<OrdersV1, Effect.Success<typeof make>>()("api-worker/OrdersV1") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(OrdersService.layer, TrackingService.layer))
  )
}
