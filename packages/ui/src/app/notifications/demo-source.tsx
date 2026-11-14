import type { ReactNode } from "react"
import { useNotifications } from "../stores/notifications-store"
import { DemoReply, useDemoRecord } from "./demo-preview"
import { NotificationsSourceProvider } from "./source"

/**
 * The notifications page in the design app: the demo's notifications store, every note there at once, and the preview
 * reading each note's record from the demo workspace.
 */
export function DemoNotificationsSource({ children }: { children: ReactNode }) {
  const { notes, prefs, setRead, snooze, clear, restore, pick, put, setEventApp } = useNotifications()
  return (
    <NotificationsSourceProvider
      value={{
        notes,
        prefs,
        setRead,
        snooze,
        clear,
        restore,
        pick,
        put,
        setEventApp,
        useRecord: useDemoRecord,
        Reply: DemoReply
      }}
    >
      {children}
    </NotificationsSourceProvider>
  )
}
