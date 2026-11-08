import { DeveloperRpcs } from "@insyte/api/rpc/DeveloperRpcs"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Effect } from "effect"

export const DeveloperHandlers = DeveloperRpcs.toLayer(Effect.gen(function*() {
  const keys = yield* ApiKeys
  return DeveloperRpcs.of({
    "ApiKeys.list": () => keys.list,
    "ApiKeys.activity": ({ id }) => keys.activity(id),
    "ApiKeys.create": (input) => keys.create(input),
    "ApiKeys.update": (input) => keys.update(input),
    "ApiKeys.rotate": ({ id, graceMs }) => keys.rotate(id, graceMs),
    "ApiKeys.endGrace": ({ id }) => keys.endGrace(id),
    "ApiKeys.revoke": ({ id }) => keys.revoke(id),
    "ApiKeys.restore": ({ id }) => keys.restore(id)
  })
}))
