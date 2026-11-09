import { ForwardingRpcs } from "@insyte/api/rpc/ForwardingRpcs"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { Effect } from "effect"

export const ForwardingHandlers = ForwardingRpcs.toLayer(Effect.gen(function*() {
  const forwarding = yield* ForwardingService
  return ForwardingRpcs.of({
    "Forwarding.list": ({ view }) => forwarding.list(view),
    "Forwarding.forOrder": ({ orderId }) => forwarding.forOrder(orderId),
    "Forwarding.forward": (input) => forwarding.forward(input),
    "Forwarding.markConfirmed": (input) => forwarding.markConfirmed(input),
    "Forwarding.reroute": (input) => forwarding.reroute(input),
    "Forwarding.cancel": (input) => forwarding.cancel(input)
  })
}))
