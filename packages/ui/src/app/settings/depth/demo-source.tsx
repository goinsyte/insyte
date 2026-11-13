import type { ReactNode } from "react"
import { useMyName } from "../../ask/agent-parts"
import type { Retention } from "../../lib/settings-depth"
import { undoable } from "../../lib/undo"
import { useSettingsDepth } from "../../stores/settings-depth-store"
import { useWorkspace } from "../../stores/workspace-store"
import { type FieldChange, type SettingsDepthSource, SettingsDepthSourceProvider } from "./source"

/*
 * The settings-depth pages in the design app: the demo's settings-depth store, which writes every save into its own
 * Logboek and hands back the Undo, the demo's stores for Btw, and a dry run that reads the seeded counts.
 */

/* What a shorter period would catch: the seeded count is for the period set; a shorter one finds more. */
const would = (c: Retention, months: number | null) =>
  months === null ? 0 : Math.round(c.count * Math.max(0.2, (c.months ?? months) / months))

export function DemoSettingsDepthSource({ children }: { children: ReactNode }) {
  const state = useSettingsDepth()
  const stores = useWorkspace((s) => s.stores)
  const me = useMyName()
  const countedAt = state.privacy.countedAt ?? null
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
