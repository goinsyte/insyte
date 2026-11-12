import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { NotePrefs } from "@insyte/modules/notifications/domain/Notifications"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { NotificationSettings } from "@insyte/ui/app/settings/notifications-screen"
import { NotificationSettingsSourceProvider } from "@insyte/ui/app/settings/notifications-source"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Bell } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect } from "react"
import { toast } from "sonner"
import { notifySettingsAtom } from "../data/notifications.ts"
import { slackNotConnected, useConsoleNotificationSettingsSource } from "../notifications/settings-source.ts"

/**
 * Instellingen → Meldingen (M11 step 13.5): the reference's page over `Notifications.prefs`, in the settings sheet.
 * Every member has one, their own; the loader reads it on the server. A read that failed says so and offers to try
 * again, instead of a skeleton that never ends. Slack's approval comes back through the API's callback to here:
 * `?connected=slack`, or `?error=slack_<reason>`, said once and taken out of the address.
 */
export const Route = createFileRoute("/_frame/settings/notifications")({
  validateSearch: (s: Record<string, unknown>): { connected?: "slack"; error?: string } => ({
    ...(s["connected"] === "slack" ? { connected: "slack" as const } : {}),
    ...(typeof s["error"] === "string" ? { error: s["error"] } : {})
  }),
  head: () => ({ meta: [{ title: "Meldingen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(notifySettingsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, notifySettingsAtom)))
  },
  pendingComponent: Pending,
  component: NotificationsRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Meldingen" />
    </div>
  )
}

function NotificationsRoute() {
  const result = useAtomValue(notifySettingsAtom)
  const refresh = useAtomRefresh(notifySettingsAtom)
  const prefs = Option.getOrUndefined(AsyncResult.value(result))
  if (prefs !== undefined) return <Loaded prefs={prefs} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Meldingen" icon={Bell}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">Je meldingen konden niet worden geladen.</p>
            <button
              type="button"
              onClick={refresh}
              className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
            >
              Opnieuw proberen
            </button>
          </div>
        </SettingsSheet>
      </div>
    )
  }
  return <Pending />
}

function Loaded({ prefs }: { prefs: NotePrefs }) {
  const source = useConsoleNotificationSettingsSource(prefs)
  const { connected, error } = Route.useSearch()
  const navigate = Route.useNavigate()

  // Back from Slack: said once, then out of the address so a reload does not say it again.
  useEffect(() => {
    if (connected === undefined && error === undefined) return
    if (connected !== undefined) {
      toast.success(prefs.slackTeam === null ? "Slack is gekoppeld" : `Slack is gekoppeld met ${prefs.slackTeam}`, {
        description: "Kies hieronder waar jouw meldingen in Slack komen."
      })
    } else {
      slackNotConnected(error ?? "")
    }
    void navigate({ search: {}, replace: true })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [connected, error])

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <NotificationSettingsSourceProvider value={source}>
        <SettingsSheet title="Meldingen" icon={Bell}>
          <NotificationSettings />
        </SettingsSheet>
      </NotificationSettingsSourceProvider>
    </div>
  )
}
