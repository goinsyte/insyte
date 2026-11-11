import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { useSettings } from "../stores/settings-store"
import { useWorkspace } from "../stores/workspace-store"
import {
  type AccountSource,
  AccountSourceProvider,
  type RegionalFields,
  RegionalSourceProvider
} from "./workspace-source"

/*
 * Account and Regio over the design app's stores, as they were before the seam (`workspace-source.tsx`): the workspace
 * store's account, members and stores, the settings store's thresholds and retention, the download built in the
 * browser, and deletion switched off for the demo. Every write takes at once.
 */

/* The stored value stays the English name the account keeps; the label is what the operator reads. */
const COUNTRIES = [
  { value: "Netherlands", label: "Nederland" },
  { value: "Belgium", label: "België" },
  { value: "Germany", label: "Duitsland" },
  { value: "France", label: "Frankrijk" },
  { value: "United Kingdom", label: "Verenigd Koninkrijk" },
  { value: "United States", label: "Verenigde Staten" }
]

export function DemoAccountSource({ children }: { children: ReactNode }) {
  const stored = useWorkspace((s) => s.account)
  const saveAccount = useWorkspace((s) => s.saveAccount)
  const members = useWorkspace((s) => s.members)
  const stores = useWorkspace((s) => s.stores)
  const alerts = useSettings((s) => s.alerts)
  const setAlerts = useSettings((s) => s.setAlerts)
  const retentionDays = useSettings((s) => s.retentionDays)
  const setRetention = useSettings((s) => s.setRetention)
  const source: AccountSource = {
    account: stored,
    countries: COUNTRIES,
    alerts,
    disputePrefix: "$",
    retentionDays,
    members: members.length,
    stores: { connected: stores.filter((s) => s.status === "connected").length, total: stores.length },
    manage: { ok: true, reason: "" },
    saveAccount: (next) => {
      saveAccount({ ...stored, ...next })
      return Promise.resolve(true)
    },
    setAlerts: (next) => {
      setAlerts(next)
      return Promise.resolve(true)
    },
    setRetention: (days) => {
      setRetention(days)
      return Promise.resolve(true)
    },
    download: () => {
      const blob = new Blob([JSON.stringify({ account: stored, members, stores }, null, 2)], {
        type: "application/json"
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "insyte-workspace.json"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Je werkruimte wordt gedownload")
    },
    remove: {
      note: (
        <span className="mt-3 block rounded-md bg-mist px-3 py-2 text-ink-2 text-sm">
          Verwijderen staat uit in deze demo, dus bevestigen laat de werkruimte precies zoals hij is.
        </span>
      ),
      confirm: () => toast("Er is niets verwijderd. Verwijderen staat uit in deze demo.")
    }
  }
  return <AccountSourceProvider value={source}>{children}</AccountSourceProvider>
}

const REGIONAL: RegionalFields = {
  language: "nl-NL",
  currency: "EUR",
  dateFormat: "DD MMM YYYY",
  timeFormat: "24h",
  weekStart: "mon",
  timezone: "Europe/Amsterdam"
}

/** The demo keeps Regio on the page only, as it always has: back to the defaults on the next visit. */
export function DemoRegionalSource({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState(REGIONAL)
  return (
    <RegionalSourceProvider
      value={{
        saved,
        save: (next) => {
          setSaved(next)
          return Promise.resolve(true)
        }
      }}
    >
      {children}
    </RegionalSourceProvider>
  )
}
