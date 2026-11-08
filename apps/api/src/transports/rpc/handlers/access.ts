import { AccessRpcs } from "@insyte/api/rpc/AccessRpcs"
import { Access } from "@insyte/modules/access/Access"
import { Effect } from "effect"

export const AccessHandlers = AccessRpcs.toLayer(Effect.gen(function*() {
  const access = yield* Access
  return AccessRpcs.of({
    "Access.mine": () => access.mine,
    "Access.request": (input) => access.request(input),
    "Access.withdraw": ({ id }) => access.withdraw(id),
    "Access.list": () => access.list,
    "Access.grant": ({ id }) => access.grant(id),
    "Access.decline": ({ id }) => access.decline(id)
  })
}))
