import { getRouteApi } from "@tanstack/react-router"
import { DemoNotificationsSource } from "./demo-source"
import { NotificationsPage } from "./notifications-page"

const Route = getRouteApi("/_admin/notifications")

export function AdminNotifications() {
  const { view, source } = Route.useSearch()
  return (
    <DemoNotificationsSource>
      <NotificationsPage
        persona="admin"
        base="/notifications"
        settingsTo="/settings/notifications"
        view={view}
        source={source}
      />
    </DemoNotificationsSource>
  )
}
