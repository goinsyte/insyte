import { Forbidden } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"

/**
 * Billing is people's (M13; `billing` is `api: false`): a key, an agent or a flow's service account is refused before
 * any level is looked at, whatever its role would allow.
 */
export const peopleOnly = Effect.gen(function*() {
  const principal = yield* CurrentPrincipal
  if (principal.kind === "member") return
  return yield* new Forbidden({ permission: "billing", level: 1, roleLabel: principal.role.label })
})
