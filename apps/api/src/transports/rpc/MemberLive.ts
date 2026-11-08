import { Member } from "@insyte/api/rpc/Member"
import { NoWorkspace } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Layer } from "effect"

/**
 * `CurrentPrincipal` from the person's memberships: the newest, until the session names another
 * (`Session.switchPrincipal`, with a second workspace). Read per call, so a role changed a moment ago applies now.
 */
export const MemberLive = Layer.effect(
  Member,
  Effect.map(
    Effect.service(Workspaces),
    (workspaces) =>
      Member.of((effect) =>
        Effect.flatMap(workspaces.memberships, (memberships) => {
          const active = memberships[0]
          return active === undefined
            ? Effect.fail(new NoWorkspace())
            : Effect.provideService(effect, CurrentPrincipal, active.principal)
        })
      )
  )
)
