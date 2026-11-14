import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProposalView } from "@insyte/modules/proposals/domain/Proposals"
import type { QueueRow } from "@insyte/modules/queue/domain/Queue"
import { type QueueEntry, type QueueSource, SETTLE_MS } from "@insyte/ui/app/dashboard/queue-panel"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { Plate } from "@insyte/ui/data-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { QUEUE, queueAtom, queueWrites } from "../data/queue.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"
import { useBeginConnect } from "../stores/stores-source.tsx"

/*
 * Start's queue in the console (M10.1, M10.2), over `Queue.list`: the design's rows, with their figures written here
 * (the value in the row's own currency, the time left from now), and the plate Insyte drew for a row where there is
 * one. Filing runs `Proposals.file` (the command the plate carries, as the person) with "Ongedaan maken"; a plate whose
 * mail did not go says so and files again as "Opnieuw proberen"; "Negeren"
 * and "Markeren als gezien" are `Queue.markSeen`, which sets the plate aside with the row; "Opnieuw tekenen" is
 * `Proposals.redraw`. A decided row is held on the board, stamped, for the design's settle window: the server's answer
 * drops a filed row at once, and the queue panel can only keep a row it is still given.
 */

const HOUR = 3_600_000

/** The amount as the plate writes it, with the currency's own cents: "€ 49,95". */
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(minor / 100)

/** Time left, as the queue writes it: "4u 10m", "35m", "3d", "verlopen", or "—" without a deadline. */
const left = (dueAt: number | null, now: number) => {
  if (dueAt === null) return "—"
  const ms = dueAt - now
  if (ms <= 0) return "verlopen"
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)}u ${Math.floor((ms % HOUR) / 60_000)}m`
  return `${Math.floor(ms / (24 * HOUR))}d`
}

/** The proposal as the design's plate draws it; the title block says how sure, the paragraph says why. */
const plateOf = (p: ProposalView): Plate => ({
  number: p.number,
  heading: p.plate.heading,
  body: p.plate.body,
  dimension: p.plate.dimension,
  before: p.plate.before,
  after: p.plate.after,
  change: p.plate.change,
  witness: p.plate.witness,
  state: p.state === "execution_failed" ? "niet gelukt" : "getekend, niet uitgevoerd",
  confidence: `zekerheid ${p.plate.confidenceWord.toLowerCase()}`,
  fileLabel: p.plate.fileLabel,
  // A mail waits out the undo window before it leaves (12.2b): until then it is on its way, not done.
  filed: p.action._tag === "NotifyDelayedOrder"
    ? "Wordt verstuurd…"
    : p.action._tag === "ReconnectStore"
    ? "Naar Shopify…"
    : undefined
})

const entryOf = (r: QueueRow, now: number): QueueEntry => ({
  id: r.id,
  signal: r.signal,
  title: r.title,
  store: r.storeName ?? "Alle winkels",
  value: r.valueMinor === null ? "—" : money(r.valueMinor, r.currency ?? "EUR"),
  due: left(r.dueAt, now),
  state: r.state === "seen" ? "discarded" : "open",
  plate: r.proposal === null ? undefined : plateOf(r.proposal),
  redraws: r.proposal === null ? 0 : r.proposal.revisions - 1
})

const GONE: RefusalCopy = { gone: "Die zaak is er niet meer" }

/** A plate that cannot be filed or drawn any more says why, in the plate's own words. */
const PLATE: RefusalCopy = {
  gone: "Dat voorstel is er niet meer",
  other: (e) => {
    if (e._tag === "ProposalStale") {
      toast.error("Het record is veranderd", { description: "Dit voorstel klopt niet meer. Bekijk de zaak opnieuw." })
      return true
    }
    if (e._tag === "ProposalClosed") {
      toast.error("Al beslist", { description: "Iemand anders heeft dit voorstel al uitgevoerd of genegeerd." })
      return true
    }
    return false
  }
}

export function useConsoleQueue(now: number) {
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(queueAtom)))
  const markSeen = useAtomSet(queueWrites.markSeen, { mode: "promiseExit" })
  const file = useAtomSet(queueWrites.file, { mode: "promiseExit" })
  const redraw = useAtomSet(queueWrites.redraw, { mode: "promiseExit" })
  const undo = useAtomSet(queueWrites.undo, { mode: "promiseExit" })
  // A store's reconnect plate, filed, sends the person to Shopify to approve the app again, and back to Start.
  const begin = useBeginConnect("/dashboard")
  const reconnect = useRef(begin)
  reconnect.current = begin
  const byId = useMemo(() => new Map(list?.rows.map((r) => [r.id, r]) ?? []), [list])
  // The row just decided, as it stood with its stamp, and where it stood, until the settle window has passed.
  const [held, setHeld] = useState<{ entry: QueueEntry; at: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const live = useMemo(() => list?.rows.map((r) => entryOf(r, now)) ?? [], [list, now])
  const rows = useMemo(() => {
    if (held === null) return live
    const rest = live.filter((r) => r.id !== held.entry.id)
    return [...rest.slice(0, held.at), held.entry, ...rest.slice(held.at)]
  }, [live, held])
  const source: QueueSource = useMemo(() => {
    const hold = (row: QueueEntry, phase: "filed" | "discarded") => {
      window.clearTimeout(timer.current)
      setHeld({ entry: { ...row, state: phase }, at: Math.max(0, rows.findIndex((r) => r.id === row.id)) })
      timer.current = window.setTimeout(() => setHeld(null), SETTLE_MS)
    }
    const release = () => {
      window.clearTimeout(timer.current)
      setHeld(null)
    }
    const offerUndo = (message: string, token: string, description: string, copy: RefusalCopy) =>
      undoable(
        message,
        () =>
          void undo({ payload: { token }, reactivityKeys: [...QUEUE] }).then((e) => {
            if (Exit.isFailure(e)) sayRefusal(failureOf(e), copy)
          }),
        description
      )
    return {
      rows,
      decide: async (row, phase) => {
        const proposal = byId.get(row.id)?.proposal ?? null
        hold(row, phase)
        if (phase === "filed" && proposal !== null) {
          const exit = await file({ payload: { id: proposal.id }, reactivityKeys: [...QUEUE] })
          if (Exit.isFailure(exit)) {
            release()
            return sayRefusal(failureOf(exit), PLATE)
          }
          if (proposal.action._tag === "ReconnectStore") return reconnect.current(proposal.action.shopDomain)
          const ticket = exit.value.undo
          // A mail waits out the undo window before it leaves: the toast says it is on its way, not sent.
          const message = exit.value.proposal.state === "filed" ? "Gaat zo de deur uit" : "Uitgevoerd zoals getekend"
          if (ticket !== null) offerUndo(message, ticket.token, proposal.plate.after.value, PLATE)
          return
        }
        const exit = await markSeen({ payload: { id: row.id }, reactivityKeys: [...QUEUE] })
        if (Exit.isFailure(exit)) {
          release()
          return sayRefusal(failureOf(exit), GONE)
        }
        const ticket = exit.value.undo
        if (ticket === null) return
        offerUndo(
          proposal === null ? "Regel genegeerd" : "Voorstel genegeerd",
          ticket.token,
          "Er is niets aan het record veranderd.",
          GONE
        )
      },
      redraw: (id) => {
        const proposal = byId.get(id)?.proposal ?? null
        if (proposal === null) return
        void redraw({ payload: { id: proposal.id }, reactivityKeys: [...QUEUE] }).then((exit) => {
          if (Exit.isFailure(exit)) sayRefusal(failureOf(exit), PLATE)
        })
      }
    }
  }, [rows, byId, markSeen, file, redraw, undo])
  /** The hero's brief: delayed orders, as their rows count them. */
  const delayed = list?.rows.filter((r) => r.kind === "order_delayed" && r.state === "open").length ?? 0
  return { source, delayed, loaded: list !== undefined }
}
