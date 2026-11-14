import { useAtomSet } from "@effect/atom-react"
import type { AgentLogEntry as ServerEntry, AgentLogPage } from "@insyte/modules/agent/domain/AgentLog"
import type { AgentLogSource } from "@insyte/ui/app/ask/agent-log-source"
import type { AgentEffect, AgentLogEntry, LogRecord, LogSource, LogSourceKind } from "@insyte/ui/app/lib/agent-log"
import { canUndo } from "@insyte/ui/app/lib/agent-log"
import { Exit } from "effect"
import { useMemo } from "react"
import { toast } from "sonner"
import { AGENT_LOG, agentWrites } from "../data/agent.ts"
import { useHasPage } from "../frame/pages.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Wat Insyte deed in the console (M15 step 6): `AgentLog.list` as the design's log rows, the address's row by
 * `AgentLog.get` where it is older than the list, "Ongedaan maken" through `AgentLog.undo` inside the window (with "Toch
 * laten staan", `AgentLog.redo`) and the compensation by hand through `AgentLog.compensate` after it. The server fences
 * every read and every way back on the viewer's areas and stores (`storeScope`); a row it does not return is not shown.
 */

/** Where a record the agent acted on opens in the console, by the log's subject type. */
const RECORD: Record<string, (id: string) => Pick<LogRecord, "kind" | "to" | "search">> = {
  ticket: (id) => ({ kind: "ticket", to: `/tickets/${id}` }),
  order: (id) => ({ kind: "order", to: `/orders/${id}` }),
  customer: (id) => ({ kind: "customer", to: `/customers/${id}` }),
  return: (id) => ({ kind: "return", to: `/returns/${id}` }),
  product: (id) => ({ kind: "product", to: `/products/${id}` }),
  thread: (id) => ({ kind: "thread", to: "/inbox", search: { thread: id } }),
  supplier: (id) => ({ kind: "supplier", to: "/suppliers", search: { supplier: id } }),
  conversation: (id) => ({ kind: "chat", to: "/chats", search: { id } })
}

const SOURCE_KINDS: ReadonlyArray<LogSourceKind> = [
  "ticket",
  "order",
  "customer",
  "thread",
  "knowledge",
  "policy",
  "product",
  "supplier",
  "return"
]

const recordOf = (subject: ServerEntry["subject"]): LogRecord | undefined => {
  // A record the action was about to make (`new:…`) has no page yet.
  if (subject === null || subject.id.startsWith("new:")) return undefined
  const at = RECORD[subject.type]
  return at === undefined ? undefined : { ...at(subject.id), label: subject.label, id: subject.id }
}

const sourceOf = (s: ServerEntry["sources"][number]): LogSource => ({
  kind: (SOURCE_KINDS as ReadonlyArray<string>).includes(s.kind) ? s.kind as LogSourceKind : "policy",
  title: s.title,
  detail: s.detail,
  ...(s.to === null ? {} : { to: s.to })
})

/**
 * The design's row for the server's. The design reads "can be taken back" off the row's effect: a row the server can
 * still take back (inside the window, or by its compensation after it) carries one, a reply as the mail it sent.
 */
const entryOf = (e: ServerEntry): AgentLogEntry => {
  const record = recordOf(e.subject)
  const effect: AgentEffect | undefined = !e.reversible && e.undoUntil === null
    ? undefined
    : e.action === "SendReply"
    ? { kind: "send", channel: "email", to: e.subject?.label ?? "" }
    : { kind: "note", target: e.id }
  return {
    id: e.id,
    at: new Date(e.at).toISOString(),
    action: e.action,
    sentence: e.sentence,
    ...(record === undefined ? {} : { record }),
    level: e.level,
    ...(e.approvedBy === null ? {} : { approvedBy: e.approvedBy }),
    trigger: e.trigger,
    status: e.status,
    ...(e.undoneBy === null ? {} : { undoneBy: e.undoneBy }),
    ...(e.failReason === null ? {} : { failReason: e.failReason }),
    sources: e.sources.map(sourceOf),
    reason: e.reason,
    ...(e.before === null ? {} : { before: e.before }),
    ...(e.after === null ? {} : { after: e.after }),
    policyVersion: e.policyVersion,
    model: e.model ?? "extern model",
    promptVersion: e.promptVersion ?? "geen",
    ...(e.undoUntil === null ? {} : { undoUntil: e.undoUntil }),
    ...(e.compensation === null ? {} : { compensation: e.compensation }),
    ...(effect === undefined ? {} : { effect })
  }
}

/** Why a row could not be taken back, as the server put it. */
const FIXED: Record<string, [string, string]> = {
  window: ["Te laat om ongedaan te maken", "De vijf minuten zijn om. Herstel het met de hand."],
  irreversible: ["Dit kan niet terug", "Deze actie heeft niets om terug te draaien."],
  state: ["Al teruggedraaid", "Iemand anders was je voor."],
  sent: ["Al verstuurd", "Het bericht is al vertrokken."],
  redo_window: ["Te laat om terug te zetten", "Toch laten staan kan alleen even, door wie het terugdraaide."]
}

const notTaken = (error: unknown) =>
  sayRefusal(error, {
    gone: "Deze actie bestaat niet meer",
    other: (tagged) => {
      if (tagged._tag !== "AgentActionFixed") return false
      const [title, description] = FIXED[String(tagged["reason"])] ?? FIXED["state"]!
      toast.error(title, { description })
      return true
    }
  })

/** The log page's source over the server's rows, with the address's row where the list does not hold it. */
export function useConsoleAgentLogSource(page: AgentLogPage, extra: ServerEntry | undefined): AgentLogSource {
  const undoAction = useAtomSet(agentWrites.undoAction, { mode: "promiseExit" })
  const redoAction = useAtomSet(agentWrites.redoAction, { mode: "promiseExit" })
  const compensate = useAtomSet(agentWrites.compensateAction, { mode: "promiseExit" })
  const hasPage = useHasPage()
  const entries = useMemo(() => {
    const rows = page.rows.map(entryOf)
    return extra === undefined || rows.some((r) => r.id === extra.id) ? rows : [...rows, entryOf(extra)]
  }, [page.rows, extra])
  const { today, todayUndone, todayFailed } = page.counts

  const keep = (e: AgentLogEntry) =>
    void redoAction({ payload: { id: e.id }, reactivityKeys: [...AGENT_LOG] }).then((done) => {
      if (Exit.isFailure(done)) notTaken(failureOf(done))
    })

  const undo = (e: AgentLogEntry, now: number) => {
    const send = e.effect?.kind === "send"
    if (canUndo(e, now)) {
      void undoAction({ payload: { id: e.id }, reactivityKeys: [...AGENT_LOG] }).then((done) => {
        if (Exit.isFailure(done)) return notTaken(failureOf(done))
        toast(send ? "Niet verstuurd" : "Ongedaan gemaakt", {
          description: send ? "Het bericht wachtte nog op het venster en is nooit vertrokken." : e.sentence,
          duration: 6000,
          ...(send ? {} : { action: { label: "Toch laten staan", onClick: () => keep(e) } })
        })
      })
      return
    }
    // Past the window: a person runs the compensation by hand, as their own action.
    if (e.compensation === undefined) return
    void compensate({ payload: { id: e.id }, reactivityKeys: [...AGENT_LOG] }).then((done) => {
      if (Exit.isFailure(done)) return notTaken(failureOf(done))
      toast(`${e.compensation}: gedaan`, { description: e.sentence, duration: 6000 })
    })
  }

  return {
    entries,
    today: { n: today, undone: todayUndone, failed: todayFailed },
    undo,
    // Vraag Insyte, once the console has its page (M15 step 3).
    pages: { ask: hasPage("/ask") }
  }
}
