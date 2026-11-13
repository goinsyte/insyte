import { ForwardingTools } from "@insyte/api/mcp/tools/ForwardingTools"
import { Effect, Layer } from "effect"
import { governed, type Plan, token } from "../mcp/Governance.ts"
import { kicker } from "../mcp/Outbox.ts"
import { ForwardingV1 } from "./ForwardingV1.ts"

export const ForwardingMcp = ForwardingTools.toLayer(Effect.gen(function*() {
  const read = yield* ForwardingV1
  const kicking = yield* kicker
  return {
    list_suppliers: () => read.suppliers,
    list_supplier_statements: ({ supplier_id }) => read.supplierStatements(supplier_id),
    list_forwarding: ({ view }) => read.legs(view),
    forward_orders: ({ idempotency_key, ...body }) =>
      governed(
        "forward_orders",
        idempotency_key,
        Effect.succeed<Plan<unknown>>({
          action: "ForwardOrder",
          subject: body.leg_ids[0] === undefined
            ? null
            : {
              type: "forwarding_leg",
              id: body.leg_ids[0],
              label: body.leg_ids.length === 1 ? "1 doorsturing" : `${body.leg_ids.length} doorsturingen`
            },
          sentence: body.leg_ids.length === 1
            ? "Bestelling doorgestuurd naar de leverancier"
            : `${body.leg_ids.length} bestellingen doorgestuurd naar hun leveranciers`,
          ask: { _tag: "ForwardOrder", legIds: body.leg_ids, note: body.note ?? null },
          effect: token
        }),
        kicking(read.forwardLegs(body, idempotency_key))
      ),
    reroute_leg: ({ leg_id, idempotency_key, supplier_id }) => read.rerouteLeg(leg_id, { supplier_id }, idempotency_key)
  }
})).pipe(Layer.provide(ForwardingV1.layer))
