import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AuditFacets, AuditLine, AuditPage } from "@insyte/modules/audit/domain/Audit"
import type { AuditEntry } from "@insyte/ui/app/lib/settings-depth"
import type { LogFilter, LogSource } from "@insyte/ui/app/settings/log-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  FIRST_LOG,
  firstLogAtom,
  logAtom,
  logFacetsAtom,
  logKey,
  logPayload,
  type LogQuery,
  logWrites
} from "../data/settings-log.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * The Logboek over `Audit.*` (M17 step 20.1a). The filter is asked of the server: the first view's lines came with the
 * page, another period, person or page is read when picked, and the lines shown stay until the new ones are in. "Meer
 * laden" reads the next page after the last line. Exporteren writes the server's CSV for the filter as it stands.
 */

const queryOf = (filter: LogFilter): LogQuery => ({
  days: filter.period === "all" ? null : filter.period === "7" ? 7 : 30,
  actor: filter.who,
  page: filter.page
})

const FIRST_KEY = logKey(FIRST_LOG)

const entryOf = (line: AuditLine): AuditEntry => ({
  id: line.id,
  at: new Date(line.at).toISOString(),
  who: line.actor.name,
  page: line.page,
  to: line.path ?? "",
  field: line.field,
  before: line.before,
  after: line.after
})

const download = (filename: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const COPY = { gone: "Dat staat niet meer in het logboek" }

export function useConsoleLogSource(facets: AuditFacets | undefined): LogSource {
  const [filter, setFilter] = useState<LogFilter>({ period: "30", who: "", page: "" })
  const query = queryOf(filter)
  const key = logKey(query)
  const atom = key === FIRST_KEY ? firstLogAtom : logAtom(key)
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  const facetsRefresh = useAtomRefresh(logFacetsAtom)
  const readMore = useAtomSet(logWrites.more, { mode: "promiseExit" })
  const exportCsv = useAtomSet(logWrites.exportCsv, { mode: "promiseExit" })

  // The lines shown until the new filter's are in, so the table does not empty between two picks.
  const shown = useRef<AuditPage | undefined>(undefined)
  const value = Option.getOrUndefined(AsyncResult.value(result))
  if (value !== undefined) shown.current = value
  const page = value ?? shown.current

  // The pages read with "Meer laden", for this filter's first page as it came.
  const [extra, setExtra] = useState<{ of: AuditPage; lines: ReadonlyArray<AuditLine>; next: string | null } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const more = extra !== null && extra.of === page ? extra : null
  const next = more === null ? page?.next ?? null : more.next
  const lines = [...(page?.lines ?? []), ...(more?.lines ?? [])]

  return {
    lines: lines.map(entryOf),
    any: (facets?.actors.length ?? 0) > 0 || lines.length > 0,
    people: (facets?.actors ?? []).map((a) => ({ id: a.key, name: a.name })),
    pages: facets?.pages ?? [],
    filter,
    setFilter,
    ...(next === null || page === undefined ? {} : {
      more: {
        busy,
        load: () => {
          setBusy(true)
          void readMore({ payload: { ...logPayload(query), cursor: next } }).then((exit) => {
            setBusy(false)
            if (Exit.isFailure(exit)) return void sayRefusal(failureOf(exit), COPY)
            setExtra({ of: page, lines: [...(more?.lines ?? []), ...exit.value.lines], next: exit.value.next })
          })
        }
      }
    }),
    ...(AsyncResult.isFailure(result) && value === undefined
      ? {
        retry: () => {
          refresh()
          facetsRefresh()
        }
      }
      : {}),
    exportCsv: () =>
      void exportCsv({ payload: logPayload(query) }).then((exit) => {
        if (Exit.isFailure(exit)) return void sayRefusal(failureOf(exit), COPY)
        download(exit.value.filename, exit.value.csv)
        toast(
          `${exit.value.filename} geëxporteerd`,
          exit.value.truncated
            ? { description: `De nieuwste ${exit.value.lines} wijzigingen. Kies een kortere periode voor de rest.` }
            : {}
        )
      })
  }
}
