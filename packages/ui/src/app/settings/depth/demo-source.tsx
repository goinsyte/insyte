import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { useMyName } from "../../ask/agent-demo"
import type { DnsRecord, Domain, Retention } from "../../lib/settings-depth"
import { undoable } from "../../lib/undo"
import { useSettingsDepth } from "../../stores/settings-depth-store"
import { useWorkspace } from "../../stores/workspace-store"
import { type FieldChange, type SettingsDepthSource, SettingsDepthSourceProvider } from "./source"

/*
 * The settings-depth pages in the design app: the demo's settings-depth store, which writes every save into its own
 * Logboek and hands back the Undo, the demo's stores for Btw, a dry run that reads the seeded counts, and a DNS check
 * that finds the records as they come in.
 */

/* What a shorter period would catch: the seeded count is for the period set; a shorter one finds more. */
const would = (c: Retention, months: number | null) =>
  months === null ? 0 : Math.round(c.count * Math.max(0.2, (c.months ?? months) / months))

export function DemoSettingsDepthSource({ children }: { children: ReactNode }) {
  const state = useSettingsDepth()
  const stores = useWorkspace((s) => s.stores)
  const me = useMyName()
  const countedAt = state.privacy.countedAt ?? null
  const [checking, setChecking] = useState(false)
  const check = () => {
    const d = useSettingsDepth.getState().domain
    setChecking(true)
    const pending: Domain = {
      ...d,
      records: d.records.map((r) => (r.status === "found" ? r : { ...r, status: "pending" as const }))
    }
    useSettingsDepth.setState({ domain: pending })
    window.setTimeout(() => {
      const n = d.checks + 1
      /* The reference's DNS: DKIM appears on the first check, MX on the second, as records propagate. */
      const records = d.records.map((
        r
      ): DnsRecord => (r.status === "found" || r.id === "dkim" || n >= 2
        ? { ...r, status: "found", why: undefined }
        : { ...r, status: "missing" })
      )
      const before = d.records.filter((r) => r.status === "found").length
      const after = records.filter((r) => r.status === "found").length
      useSettingsDepth.getState().save("domain", { ...d, records, checks: n, checkedAt: new Date().toISOString() }, {
        who: me,
        page: "E-mail en domein",
        to: "/settings/email-domain",
        changes: [["DNS-records gevonden", `${before} van 4`, `${after} van 4`]]
      })
      setChecking(false)
      toast(after === records.length ? "Alle records gevonden" : `${after} van ${records.length} records gevonden`, {
        description: after === records.length
          ? "Mail van je domein is nu ondertekend en komt beter aan."
          : "De rest kan tot 24 uur duren. Controleer het later nog eens."
      })
    }, 1400)
  }
  const source: SettingsDepthSource = {
    saved: {
      shipping: state.shipping,
      links: state.links,
      brand: state.brand,
      domain: state.domain,
      vat: state.vat,
      privacy: state.privacy
    },
    save: (key, next, said, log) => {
      const changes: ReadonlyArray<FieldChange> = log.changes.length > 0
        ? log.changes
        : [["Instellingen", "", "gewijzigd"]]
      const undo = useSettingsDepth.getState().save(key, next, { who: me, ...log, changes })
      undoable(said.label, undo, said.detail)
      return Promise.resolve(true)
    },
    stores: stores.map((s) => ({ id: s.id, name: s.name })),
    domain: { state: "ready", checking, check },
    privacy: {
      erasing: state.privacy.erasing,
      countedAt,
      countOf: (c, months) => (countedAt === null ? null : would(c, months)),
      counting: false,
      count: () => {
        const at = new Date().toISOString()
        useSettingsDepth.setState({ privacy: { ...useSettingsDepth.getState().privacy, countedAt: at } })
      },
      setErasing: (on, said) => {
        const live = useSettingsDepth.getState().privacy
        const undo = useSettingsDepth.getState().save("privacy", { ...live, erasing: on }, {
          who: me,
          page: "Gegevens en privacy",
          to: "/settings/privacy",
          changes: [["Verwijderen", on ? "uit" : "aan", on ? "aan" : "uit"]]
        })
        undoable(said.label, undo, said.detail)
      }
    }
  }
  return <SettingsDepthSourceProvider value={source}>{children}</SettingsDepthSourceProvider>
}
