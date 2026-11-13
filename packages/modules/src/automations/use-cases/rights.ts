import { SCOPE_GRANTS } from "@insyte/domain/automations/Scopes"
import { Forbidden } from "@insyte/domain/Errors"
import { type AreaId, canRole, type Level, type SpecialId } from "@insyte/domain/Permissions"
import type { Principal } from "@insyte/domain/Principal"
import { Effect } from "effect"

/**
 * Whether `principal` may hand a flow these rights: each one's grants (`SCOPE_GRANTS`) must be within what the principal
 * holds itself, as a key's rights are within its creator's (12-auth §6 rule 5). Publishing, granting a right in
 * Instellingen, and starting a run by hand ask it, so nobody gets a flow to do what they may not. `Forbidden` names the
 * first permission missing.
 */
export const mayHand = Effect.fn("Automations.mayHand")(function*(principal: Principal, scopes: ReadonlyArray<string>) {
  const role = {
    ...principal.role,
    stores: principal.role.stores === "all" ? "all" as const : [...principal.role.stores]
  }
  for (const scope of scopes) {
    for (const g of SCOPE_GRANTS[scope] ?? []) {
      if (!canRole(role, g.area as AreaId, g.level as Level)) {
        return yield* new Forbidden({ permission: g.area, level: g.level, roleLabel: principal.role.label })
      }
      if (g.special !== undefined && !canRole(role, g.special as SpecialId)) {
        return yield* new Forbidden({ permission: g.special, level: 0, roleLabel: principal.role.label })
      }
    }
  }
})
