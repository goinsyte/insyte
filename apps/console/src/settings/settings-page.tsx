import { Forbidden } from "@insyte/domain/Errors"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ReadOnlyNotice } from "@insyte/ui/app/access/read-only-notice"
import { EmptyState } from "@insyte/ui/app/common/empty-state"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import type { IconComponent } from "@insyte/ui/icons"
import { Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { useGate } from "../frame/refusals.ts"

/*
 * A settings page over one read (M3.1): the settings skeleton until it is in, the denied panel when the role may not
 * read it, a line that says it did not load with a way to ask again, and otherwise the page in the settings sheet. A
 * role that may read but not change it reads it under the Alleen lezen line, its fields disabled, as the reference's
 * settings layout does for its form pages.
 */

const isForbidden = Schema.is(Forbidden)

export function SettingsPending({ title }: { title: string }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title={title} />
    </div>
  )
}

export function SettingsPage<A>({
  result,
  title,
  icon,
  denied,
  action,
  edit,
  retry,
  children
}: {
  result: AsyncResult.AsyncResult<A, unknown>
  title: string
  icon: IconComponent
  /** "Je rol kan … niet zien". */
  denied: string
  /** The read that was refused, for the access request. */
  action: string
  /** What changing the page's fields takes. */
  edit: { area: Permission; level: Level }
  retry: () => void
  children: (value: A) => ReactNode
}) {
  const gate = useGate(edit.area, edit.level)
  const value = Option.getOrUndefined(AsyncResult.value(result))
  const sheet = (body: ReactNode) => (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title={title} icon={icon}>{body}</SettingsSheet>
    </div>
  )
  if (value !== undefined) {
    return sheet(
      gate.ok ? children(value) : (
        <>
          <ReadOnlyNotice reason={gate.reason} />
          <fieldset disabled className="contents">
            {children(value)}
          </fieldset>
        </>
      )
    )
  }
  if (!AsyncResult.isFailure(result)) return <SettingsPending title={title} />
  const refused = result.cause.reasons.find((r) => r._tag === "Fail")
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return sheet(
      <DeniedPanel
        title={denied}
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action
        }}
      />
    )
  }
  return sheet(
    <EmptyState
      kind="activity"
      title="Deze instellingen konden niet worden geladen"
      body="Er ging iets mis bij het ophalen. Probeer het zo opnieuw."
      action={{ label: "Opnieuw proberen", onClick: retry }}
    />
  )
}
