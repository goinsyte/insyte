import { PrivacyRpcs } from "@insyte/api/rpc/PrivacyRpcs"
import { PrivacyService } from "@insyte/modules/privacy/Privacy"
import { Effect } from "effect"

export const PrivacyHandlers = PrivacyRpcs.toLayer(Effect.gen(function*() {
  const privacy = yield* PrivacyService
  return PrivacyRpcs.of({
    "Privacy.inventory": () => privacy.inventory,
    "Privacy.requests": () => privacy.requests,
    "Privacy.setExportSchedule": (input) => privacy.setExportSchedule(input),
    "Privacy.requestAccess": (input) => privacy.requestAccess(input),
    "Privacy.requestErasure": (input) => privacy.requestErasure(input),
    "Workspaces.requestExport": () => privacy.requestExport,
    "Workspaces.requestDeletion": (input) => privacy.requestDeletion(input),
    "Workspaces.cancelDeletion": () => privacy.cancelDeletion
  })
}))
