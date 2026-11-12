import { AutomationsRpcs } from "@insyte/api/rpc/AutomationsRpcs"
import { AutomationsService } from "@insyte/modules/automations/Automations"
import { Effect } from "effect"

export const AutomationsHandlers = AutomationsRpcs.toLayer(Effect.gen(function*() {
  const automations = yield* AutomationsService
  return AutomationsRpcs.of({
    "Automations.list": (input) => automations.list(input),
    "Automations.get": ({ id }) => automations.get(id),
    "Automations.versions": ({ id }) => automations.versions(id),
    "Automations.fields": ({ triggerVariant }) => automations.fields(triggerVariant),
    "Automations.recommended": () => automations.recommended,
    "Automations.create": (input) => automations.create(input),
    "Automations.saveDraft": (input) => automations.saveDraft(input),
    "Automations.duplicate": ({ id }) => automations.duplicate(id),
    "Automations.remove": ({ id }) => automations.remove(id),
    "Automations.restore": ({ id }) => automations.restore(id),
    "Automations.publish": (input) => automations.publish(input),
    "Automations.setStatus": (input) => automations.setStatus(input),
    "Automations.updateSettings": (input) => automations.updateSettings(input),
    "Automations.test": (input) => automations.test(input)
  })
}))
