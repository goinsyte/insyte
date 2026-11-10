import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { QueueRow } from "@insyte/modules/queue/domain/Queue"
import type { QueueEntry, QueueSource } from "@insyte/ui/app/dashboard/queue-panel"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { QUEUE, queueAtom, queueWrites } from "../data/queue.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Start's queue in the console (M10.1), over `Queue.list`: the design's rows, with their figures written here (the value
 * in the row's own currency, the time left from now). No plate is drawn yet (M10.2): a row's panel is "Hiervoor is
 * niets getekend" with "Markeren als gezien", which runs `Queue.markSeen` with "Ongedaan maken".
 */

const HOUR = 3_600_000

/** Time left, as the queue writes it: "4u 10m", "35m", "3d", "verlopen", or "—" without a deadline. */
const left = (dueAt: number | null, now: number) => {
  if (dueAt === null) return "—"
  const ms = dueAt - now
  if (ms <= 0) return "verlopen"
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)}u ${Math.floor((ms % HOUR) / 60_000)}m`
  return `${Math.floor(ms / (24 * HOUR))}d`
}

const entryOf = (r: QueueRow, now: number): QueueEntry => ({
  id: r.id,
  signal: r.signal,
  title: r.title,
  store: r.storeName ?? "Alle winkels",
  value: r.valueMinor === null ? "—" : formatCurrency(r.valueMinor / 100, (r.currency ?? "EUR") as Currency),
  due: left(r.dueAt, now),
  state: r.state === "seen" ? "discarded" : "open",
  redraws: 0
})

export function useConsoleQueue(now: number) {
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(queueAtom)))
  const markSeen = useAtomSet(queueWrites.markSeen, { mode: "promiseExit" })
  const undo = useAtomSet(queueWrites.undo, { mode: "promiseExit" })
  const rows = useMemo(() => list?.rows.map((r) => entryOf(r, now)) ?? [], [list, now])
  const source: QueueSource = useMemo(() => ({
    rows,
    decide: async (row) => {
      const exit = await markSeen({ payload: { id: row.id }, reactivityKeys: [...QUEUE] })
      if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Die zaak is er niet meer" })
      const ticket = exit.value.undo
      if (ticket === null) return
      undoable(
        "Regel genegeerd",
        () =>
          void undo({ payload: { token: ticket.token }, reactivityKeys: [...QUEUE] }).then((e) => {
            if (Exit.isFailure(e)) sayRefusal(failureOf(e), { gone: "Die zaak is er niet meer" })
          }),
        "Er is niets aan het record veranderd."
      )
    }
  }), [rows, markSeen, undo])
  /** The hero's brief: delayed orders, as their rows count them. */
  const delayed = list?.rows.filter((r) => r.kind === "order_delayed" && r.state === "open").length ?? 0
  return { source, delayed, loaded: list !== undefined }
}
