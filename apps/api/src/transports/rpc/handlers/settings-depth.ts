import { SettingsDepthRpcs } from "@insyte/api/rpc/SettingsDepthRpcs"
import { SettingsDepth } from "@insyte/modules/settings/SettingsDepth"
import { Effect } from "effect"

export const SettingsDepthHandlers = SettingsDepthRpcs.toLayer(Effect.gen(function*() {
  const settings = yield* SettingsDepth
  return SettingsDepthRpcs.of({
    "WorkspaceSettings.get": (input) => settings.get(input),
    "WorkspaceSettings.save": (input) => settings.save(input),
    "Shipping.statusCounts": () => settings.statusCounts,
    "Templates.linkUsage": () => settings.linkUsage,
    "Brand.uploadLogo": (input) => settings.uploadLogo(input),
    "Retention.count": (input) => settings.count(input),
    "Retention.setErasing": (input) => settings.setErasing(input)
  })
}))
