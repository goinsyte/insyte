import { RolesRpcs } from "@insyte/api/rpc/RolesRpcs"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { Effect } from "effect"

export const RolesHandlers = RolesRpcs.toLayer(Effect.gen(function*() {
  const roles = yield* RolesService
  return RolesRpcs.of({
    "Roles.list": () => roles.list,
    "Roles.create": (input) => roles.create(input),
    "Roles.update": (input) => roles.update(input),
    "Roles.rename": ({ id, label }) => roles.rename(id, label),
    "Roles.reset": ({ id }) => roles.reset(id),
    "Roles.remove": ({ id, to }) => roles.remove(id, to),
    "Roles.restore": ({ id }) => roles.restore(id)
  })
}))
