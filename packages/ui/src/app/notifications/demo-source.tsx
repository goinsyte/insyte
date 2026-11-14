import type { ReactNode } from "react"
import { useNotifications } from "../stores/notifications-store"
import { NotificationsSourceProvider } from "./source"

/** The notifications page in the design app: the demo's notifications store, every note there at once. */
export function DemoNotificationsSource({ children }: { children: ReactNode }) {
  const { notes, prefs, setRead, snooze, clear, restore, pick, put, setEventApp } = useNotifications()
  return (
    <NotificationsSourceProvider value={{ notes, prefs, setRead, snooze, clear, restore, pick, put, setEventApp }}>
      {children}
    </NotificationsSourceProvider>
  )
}
