import { createContext, type ReactNode, useContext } from "react"
import type { AuditEntry } from "../lib/settings-depth"

/**
 * What Instellingen → Logboek reads and does, from whoever hosts it (as `security-source.tsx` is for Beveiliging): the
 * design app from its settings-depth store, which every save on the new settings pages writes into, the console from
 * `Audit.list`, `Audit.facets` and `Audit.export` (M17 step 20.1a). The host holds the filter, so it can ask the server
 * for exactly those lines; the markup is the design's.
 */

export type LogPeriod = "7" | "30" | "all"

export interface LogFilter {
  period: LogPeriod
  /** A person's id from `people`; empty is everyone. */
  who: string
  /** A page's id from `pages`; empty is every page. */
  page: string
}

export interface LogSource {
  /** The lines under the filter, newest first. */
  lines: ReadonlyArray<AuditEntry>
  /** Whether the log holds anything at all, whatever the filter: the empty state says which it is. */
  any: boolean
  /** Everyone and every page in the log, for the filters. */
  people: ReadonlyArray<{ id: string; name: string }>
  pages: ReadonlyArray<{ id: string; label: string }>
  filter: LogFilter
  setFilter: (next: LogFilter) => void
  /** Lines further back, where the host keeps more than one page of them. */
  more?: { load: () => void; busy: boolean }
  /** The lines for this filter did not load; asks again. */
  retry?: () => void
  /** The lines under the filter as a CSV. */
  exportCsv: () => void
}

const LogContext = createContext<LogSource | null>(null)

export function LogSourceProvider({ value, children }: { value: LogSource; children: ReactNode }) {
  return <LogContext.Provider value={value}>{children}</LogContext.Provider>
}

export function useLogSource(): LogSource {
  const source = useContext(LogContext)
  if (source === null) throw new Error("useLogSource outside a LogSourceProvider")
  return source
}
