import { Member, namesOtherWorkspace, WORKSPACE_HEADER } from "@insyte/api/rpc/Member"
import { NoWorkspace, WorkspaceMismatch } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Layer } from "effect"

/**
 * `CurrentPrincipal` from the person's memberships: the session's workspace (pinned on its first request), else the
 * newest. Read per call, so a role changed a moment ago applies now. A tab that names another workspace than that one
 * (another tab switched, or the person left it) is refused before anything is done, so it never writes into the
 * workspace the session moved to.
 */
export const MemberLive = Layer.effect(
  Member,
  Effect.map(
    Effect.service(Workspaces),
    (workspaces) =>
      Member.of((effect, { headers }) =>
        Effect.flatMap(workspaces.current, (memberships) => {
          const active = memberships[0]
          if (active === undefined) return Effect.fail(new NoWorkspace())
          if (
            namesOtherWorkspace((headers as Record<string, string | undefined>)[WORKSPACE_HEADER], active.workspaceId)
          ) {
            return Effect.fail(new WorkspaceMismatch())
          }
          return Effect.provideService(effect, CurrentPrincipal, active.principal)
        })
      )
  )
)
