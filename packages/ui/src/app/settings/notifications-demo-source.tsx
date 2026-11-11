import type { ReactNode } from "react"
import { toast } from "sonner"
import { useNotifications } from "../stores/notifications-store"
import { useSettings } from "../stores/settings-store"
import { useWorkspace } from "../stores/workspace-store"
import { type NotificationSettingsSource, NotificationSettingsSourceProvider } from "./notifications-source"

/*
 * Instellingen → Meldingen in the design app: the demo's notifications store, its thresholds from the settings store
 * and Elena's address, with every channel connected and the toast and Undo the design wrote.
 */

const SLACK_CHANNELS = ["#northwind-ops", "#operations", "#customer-service", "Privébericht aan mij"]

export function DemoNotificationSettingsSource({ children }: { children: ReactNode }) {
  const saved = useNotifications((s) => s.prefs)
  const setPrefs = useNotifications((s) => s.setPrefs)
  const notes = useNotifications((s) => s.notes)
  const alerts = useSettings((s) => s.alerts)
  const email = useWorkspace((s) => s.members.find((m) => m.id === "mem_elena")?.email ?? "elena@northwindclothing.co")
  const source: NotificationSettingsSource = {
    saved,
    save: (next, said) => {
      const before = saved
      setPrefs(next)
      toast.success(said.label, {
        description: said.detail,
        action: { label: "Ongedaan maken", onClick: () => setPrefs(before) }
      })
      return Promise.resolve(true)
    },
    notes,
    email,
    timezone: "Europe/Amsterdam",
    thresholds: { delayHours: `Na ${alerts.delayHours} uur`, disputeAmount: `Vanaf $${alerts.disputeAmount}` },
    connected: { push: true, slack: true },
    slackChannels: SLACK_CHANNELS,
    testPush: () =>
      void toast.success("Testmelding verstuurd", {
        description: "Hij komt binnen op elk apparaat waar je push hebt toegestaan."
      })
  }
  return <NotificationSettingsSourceProvider value={source}>{children}</NotificationSettingsSourceProvider>
}
