import { DeveloperRpcs } from "@insyte/api/rpc/DeveloperRpcs"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Webhooks } from "@insyte/modules/developer/Webhooks"
import { Config, Effect } from "effect"

export const DeveloperHandlers = DeveloperRpcs.toLayer(Effect.gen(function*() {
  const keys = yield* ApiKeys
  const hooks = yield* Webhooks
  return DeveloperRpcs.of({
    "ApiKeys.list": () => keys.list,
    "ApiKeys.activity": ({ id }) => keys.activity(id),
    "ApiKeys.create": (input) => keys.create(input),
    "ApiKeys.update": (input) => keys.update(input),
    "ApiKeys.rotate": ({ id, graceMs }) => keys.rotate(id, graceMs),
    "ApiKeys.endGrace": ({ id }) => keys.endGrace(id),
    "ApiKeys.revoke": ({ id }) => keys.revoke(id),
    "ApiKeys.restore": ({ id }) => keys.restore(id),
    "ApiKeys.endpoints": () =>
      Config.String("PUBLIC_API_HOST").pipe(
        Config.option,
        Effect.map((host) =>
          host._tag === "None"
            ? { api: null, mcp: null }
            : { api: `https://${host.value}/v1`, mcp: `https://${host.value}/mcp` }
        ),
        Effect.orDie
      ),
    "Webhooks.list": () => hooks.list,
    "Webhooks.deliveries": ({ endpointId }) => hooks.deliveries(endpointId),
    "Webhooks.delivery": ({ id }) => hooks.delivery(id),
    "Webhooks.create": (input) => hooks.create(input),
    "Webhooks.update": (input) => hooks.update(input),
    "Webhooks.setActive": ({ id, active }) => hooks.setActive(id, active),
    "Webhooks.remove": ({ id }) => hooks.remove(id),
    "Webhooks.revealSecret": ({ id }) => hooks.revealSecret(id),
    "Webhooks.rotateSecret": ({ id }) => hooks.rotateSecret(id),
    "Webhooks.sendTest": ({ id, event }) => hooks.sendTest(id, event),
    "Webhooks.redeliver": ({ id }) => hooks.redeliver(id)
  })
}))
