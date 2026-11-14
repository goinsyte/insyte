import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { NotificationsPage } from "@insyte/ui/app/notifications/notifications-page"
import { search } from "@insyte/ui/app/notifications/notifications-search"
import { NotificationsSourceProvider } from "@insyte/ui/app/notifications/source"
import { useShellSource } from "@insyte/ui/app/shell/source"
import { createFileRoute } from "@tanstack/react-router"
import { useConsoleNotificationsSource } from "../notifications/page-source.ts"

/**
 * Meldingen (PLAN 10, M5.2): the reference's notifications page over `Notifications.list` and its writes, in the
 * frame. The area panel picks the view (Primair, Overig, Later, Gewist, or one source, `?view=` and `?source=`) and
 * counts it from the shell's notes; the bell's "Alle meldingen" and `g n` come here. Every member has their own.
 */
export const Route = createFileRoute("/_frame/notifications")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Meldingen · Insyte" }] }),
  component: NotificationsRoute
})

function NotificationsRoute() {
  const { view, source } = Route.useSearch()
  const host = useConsoleNotificationsSource(useShellSource().notifications.prefs)
  if (host === undefined) return <PageSkeleton kind="list" title="Meldingen" />
  return (
    <NotificationsSourceProvider value={host}>
      <NotificationsPage
        persona="admin"
        base="/notifications"
        settingsTo="/settings/notifications"
        {...(view === undefined ? {} : { view })}
        {...(source === undefined ? {} : { source })}
      />
    </NotificationsSourceProvider>
  )
}
