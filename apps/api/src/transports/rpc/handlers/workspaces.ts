import { WorkspacesRpcs } from "@insyte/api/rpc/WorkspacesRpcs"
import { WorkspaceSettings } from "@insyte/modules/workspaces/WorkspaceSettings"
import { Effect } from "effect"

export const WorkspacesHandlers = WorkspacesRpcs.toLayer(Effect.gen(function*() {
  const settings = yield* WorkspaceSettings
  return WorkspacesRpcs.of({
    "Workspaces.getAccount": () => settings.account,
    "Workspaces.saveAccount": (input) => settings.saveAccount(input),
    "Workspaces.setAlerts": (input) => settings.setAlerts(input),
    "Workspaces.setRetention": (input) => settings.setRetention(input),
    "Workspaces.getRegional": () => settings.regional,
    "Workspaces.saveRegional": (input) => settings.saveRegional(input)
  })
}))
