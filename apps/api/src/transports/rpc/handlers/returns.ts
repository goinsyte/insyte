import { ReturnsRpcs } from "@insyte/api/rpc/ReturnsRpcs"
import { ReturnsService } from "@insyte/modules/returns/Returns"
import { Effect } from "effect"

export const ReturnsHandlers = ReturnsRpcs.toLayer(Effect.gen(function*() {
  const returns = yield* ReturnsService
  return ReturnsRpcs.of({
    "Returns.list": (input) => returns.list(input),
    "Returns.get": ({ id }) => returns.get(id),
    "Returns.returnable": ({ orderId }) => returns.returnable(orderId),
    "Returns.start": (input) => returns.start(input),
    "Returns.approve": (input) => returns.approve(input),
    "Returns.reject": (input) => returns.reject(input),
    "Returns.reopen": ({ id }) => returns.reopen(id),
    "Returns.assign": (input) => returns.assign(input),
    "Returns.markReceived": ({ id }) => returns.markReceived(id),
    "Returns.inspect": (input) => returns.inspect(input),
    "Returns.resolve": (input) => returns.resolve(input),
    "Returns.settings": () => returns.settings,
    "Returns.setSettings": (doc) => returns.setSettings(doc)
  })
}))
