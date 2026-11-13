import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { LinkUsage, SettingsSection, StatusCounts } from "@insyte/modules/settings/domain/Settings"
import { SettingsDepthSourceProvider } from "@insyte/ui/app/settings/depth/source"
import type { IconComponent } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { depthSections } from "../data/settings-depth.ts"
import { useConsoleDepthSource } from "./depth-source.ts"
import { SettingsPage } from "./settings-page.tsx"

/*
 * One settings-depth page in the console (M17 step 20.1b): its section read on the server, the settings page's
 * skeleton, denied panel, failure line and Alleen lezen around it, and the design's page over the console's source.
 */

type Key = keyof typeof depthSections

export function DepthPage({
  section,
  title,
  icon,
  denied,
  level = 2,
  counts,
  usage,
  children
}: {
  section: Key
  title: string
  icon: IconComponent
  denied: string
  level?: 2 | 3
  counts?: StatusCounts | undefined
  usage?: LinkUsage | undefined
  children: ReactNode
}) {
  const result = useAtomValue(depthSections[section])
  const retry = useAtomRefresh(depthSections[section])
  return (
    <SettingsPage
      result={result}
      title={title}
      icon={icon}
      denied={denied}
      action="WorkspaceSettings.get"
      edit={{ area: "settings", level }}
      retry={retry}
    >
      {(saved) => <Loaded section={saved} counts={counts} usage={usage}>{children}</Loaded>}
    </SettingsPage>
  )
}

function Loaded({
  section,
  counts,
  usage,
  children
}: {
  section: SettingsSection
  counts: StatusCounts | undefined
  usage: LinkUsage | undefined
  children: ReactNode
}) {
  const source = useConsoleDepthSource(section, { counts, usage })
  return <SettingsDepthSourceProvider value={source}>{children}</SettingsDepthSourceProvider>
}

/** A side read (Verzending's counts, Sjablonen' usage) once it is in; until then, or when it failed, none. */
export const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  Option.getOrUndefined(AsyncResult.value(result))
