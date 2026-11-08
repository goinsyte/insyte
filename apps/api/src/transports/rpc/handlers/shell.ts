import { Frame, ShellRpcs } from "@insyte/api/rpc/ShellRpcs"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Members } from "@insyte/modules/members/Members"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

/*
 * The frame, composed here from the slices it shows (a slice never reads another): the workspace and role from the
 * principal, the member's preferences, their notification counts and the team's faces, all at once.
 */

/** What the server counts per area. Nothing yet: each area's step adds its own (orders in M6, tickets in M11, …). */
const countsFor = (_area: string) => Effect.succeed({} as Record<string, number>)

/** The area a path is in: its first segment. */
const areaOf = (path: string) => path.split("/").find((segment) => segment !== "") ?? "dashboard"

export const ShellHandlers = ShellRpcs.toLayer(Effect.gen(function*() {
  const members = yield* Members
  const notes = yield* NotificationsService
  const prefs = yield* PrefsService
  const workspaces = yield* Workspaces
  return ShellRpcs.of({
    "Shell.frame": ({ path }) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const user = yield* CurrentUser
        const [memberships, mine, counts, teammates, nav] = yield* Effect.all([
          workspaces.memberships,
          prefs.get,
          notes.counts,
          members.directory,
          countsFor(areaOf(path))
        ], { concurrency: 1 })
        const workspace = memberships.find((m) => m.workspaceId === principal.workspaceId)
        return new Frame({
          workspace: { id: principal.workspaceId, name: workspace?.workspaceName ?? "" },
          me: { memberId: principal.id, name: user.name, email: user.email, image: user.image },
          role: principal.role,
          prefs: mine,
          notes: counts,
          teammates,
          counts: nav,
          proposals: null
        })
      }),
    "Nav.counts": ({ area }) => countsFor(area)
  })
}))
