import { Members } from "@insyte/modules/members/Members"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { membersV1, rolesV1 } from "./present.ts"

/* The team (M19.2, M19.3), to read: the members and the roles, over the use cases the console calls. */

const make = Effect.gen(function*() {
  const members = yield* Members
  const roles = yield* RolesService
  return {
    members: members.get.pipe(Effect.map(membersV1), Effect.catchTag("Forbidden", scopeMissing)),
    roles: roles.list.pipe(Effect.map(rolesV1), Effect.catchTag("Forbidden", scopeMissing))
  }
})

/**
 * The team, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class TeamV1 extends Context.Service<TeamV1, Effect.Success<typeof make>>()("api-worker/TeamV1") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(Members.layer, RolesService.layer))
  )
}
