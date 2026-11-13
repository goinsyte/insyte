import { type ReactNode, useMemo, useState } from "react"
import { exportCsv } from "../lib/bulk"
import { useSettingsDepth } from "../stores/settings-depth-store"
import { type LogFilter, type LogSource, LogSourceProvider } from "./log-source"

/*
 * The Logboek in the design app, as it was before the seam (`log-source.tsx`): the settings-depth store's lines, the
 * seeded history and every save on the new settings pages, filtered here, and Exporteren writing what is shown.
 */

const DAY = 86_400_000

export function DemoLogSource({ children }: { children: ReactNode }) {
  const audit = useSettingsDepth((s) => s.audit)
  const [filter, setFilter] = useState<LogFilter>({ period: "30", who: "", page: "" })
  const people = useMemo(() => [...new Set(audit.map((a) => a.who))].map((p) => ({ id: p, name: p })), [audit])
  const pages = useMemo(() => [...new Set(audit.map((a) => a.page))].sort().map((p) => ({ id: p, label: p })), [audit])
  const lines = audit.filter((a) =>
    (filter.period === "all" || Date.now() - Date.parse(a.at) < Number(filter.period) * DAY) &&
    (!filter.who || a.who === filter.who) && (!filter.page || a.page === filter.page)
  )
  const source: LogSource = {
    lines,
    any: audit.length > 0,
    people,
    pages,
    filter,
    setFilter,
    exportCsv: () =>
      exportCsv(
        "logboek",
        ["Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd"],
        lines.map((r) => [r.at, r.who, r.page, r.field, r.before, r.after])
      )
  }
  return <LogSourceProvider value={source}>{children}</LogSourceProvider>
}
