import type { ChatAction, ChatCommandId, ChatRecordRef, RichMessage } from "../../data-source"
import { UNDO_WINDOW_MS } from "../lib/autonomy"
import { useAgentLog } from "../stores/agent-log-store"
import { decide } from "../stores/autonomy-store"
import { useChatStore } from "../stores/chat-store"
import { useWorkspace } from "../stores/workspace-store"
import { blocked, COMMAND, doneLine, memberFrom, statusFrom } from "./commands"
import { type Pools, refsInText, resolve } from "./demo-records"
import type { ChatRecord } from "./records"
import type { ChatRules } from "./source"

/*
 * The design app's commands: each runs against the workspace store, as the button on the record's own screen does,
 * and Insyte answers in the conversation as the autonomy rules say. The console runs them on the server
 * (`Chats.runCommand`), and has no Insyte in the conversation until M15.
 */

/** Who the design app's operator is in the chats. */
export const ME = { id: "u_elena", name: "Elena Hart", memberId: "mem_elena" } as const

/** Every command runs in the design app. */
const ALL = new Set<ChatCommandId>(["refund", "cancel", "note", "ticket", "assign", "status", "evidence", "accept"])

export const demoRules = (): ChatRules => ({ team: useWorkspace.getState().members, available: ALL })

/* What was there before an action ran, so the card can put it back. Kept for the session only:
   after a reload the record has moved on and the card says so rather than offering a stale undo. */
const UNDO = new Map<string, () => void>()
export const canUndoHere = (actionId: string) => UNDO.has(actionId)

/** Runs the action against the workspace. Resolves with a failure reason, or nothing when it ran. */
async function execute(a: ChatAction, r: ChatRecord | null): Promise<string | undefined> {
  const ws = useWorkspace.getState()
  const why = blocked(a.command, r, a.arg, demoRules())
  if (why) return why
  switch (a.command) {
    case "refund": {
      if (r?.kind !== "order") return
      const before = ws.refundOrder(r.order.id)
      if (before) UNDO.set(a.id, () => useWorkspace.getState().restoreOrder(before))
      return
    }
    case "cancel": {
      if (r?.kind !== "order") return
      const before = ws.cancelOrder(r.order.id)
      if (before) UNDO.set(a.id, () => useWorkspace.getState().restoreOrder(before))
      return
    }
    case "note": {
      const note = (a.arg ?? "").trim()
      if (r?.kind === "order") {
        const before = r.order
        ws.addOrderNote(r.order.id, note)
        UNDO.set(a.id, () => useWorkspace.getState().restoreOrder(before))
      } else if (r?.kind === "chargeback") {
        const before = r.chargeback
        ws.setChargebackNote(r.chargeback.id, note)
        UNDO.set(a.id, () => useWorkspace.getState().restoreChargeback(before))
      }
      return
    }
    case "ticket": {
      const related = r && (r.kind === "order" || r.kind === "customer" || r.kind === "chargeback")
        ? { type: r.kind, id: r.ref.id, label: r.code }
        : undefined
      const t = ws.createTicket({
        title: a.arg?.trim() || (r ? `${r.code} · ${r.title}` : "Uit de teamchat"),
        description: "Aangemaakt vanuit de teamchat.",
        priority: "medium",
        source: "chat",
        ...(related ? { related_entity: related } : {})
      })
      UNDO.set(a.id, () => useWorkspace.setState((s) => ({ tickets: s.tickets.filter((x) => x.id !== t.id) })))
      return
    }
    case "assign": {
      if (r?.kind !== "ticket") return
      const m = memberFrom(a.arg, useWorkspace.getState().members)
      if (!m) return "Die collega ken ik niet"
      const before = r.ticket.assignee_ids
      ws.assignTicket(r.ticket.id, m.id)
      UNDO.set(
        a.id,
        () =>
          useWorkspace.setState((s) => ({
            tickets: s.tickets.map((t) => (t.id === r.ticket.id ? { ...t, assignee_ids: before } : t))
          }))
      )
      return
    }
    case "status": {
      if (r?.kind !== "ticket") return
      const to = statusFrom(a.arg)
      if (!to) return
      const before = ws.setTicketStatus(r.ticket.id, to.value)
      if (before) UNDO.set(a.id, () => useWorkspace.getState().setTicketStatus(r.ticket.id, before))
      return
    }
    case "evidence": {
      if (r?.kind !== "chargeback") return
      const before = r.chargeback
      await ws.buildEvidence(r.chargeback.id)
      useWorkspace.getState().submitEvidence(r.chargeback.id)
      UNDO.set(a.id, () => useWorkspace.getState().restoreChargeback(before))
      return
    }
    case "accept": {
      if (r?.kind !== "chargeback") return
      const before = r.chargeback
      ws.acceptChargeback(r.chargeback.id)
      UNDO.set(a.id, () => useWorkspace.getState().restoreChargeback(before))
      return
    }
  }
}

/** Confirm, approve or run: executes, then settles the card. */
export async function runAction(a: ChatAction, r: ChatRecord | null, decidedBy?: string) {
  const chat = useChatStore.getState()
  chat.setAction(a.id, { state: "running", ...(decidedBy ? { decidedBy } : {}) })
  const fail = await execute(a, r)
  if (fail) {
    useChatStore.getState().setAction(a.id, { state: "failed", error: fail })
    return fail
  }
  useChatStore.getState().setAction(a.id, { state: "done", undoUntil: Date.now() + UNDO_WINDOW_MS })
  if (a.by === "insyte") {
    useAgentLog.getState().record({
      action: COMMAND[a.command].agent,
      sentence: doneLine(a, r),
      level: a.level ?? "ask",
      ...(a.level === "ask" ? { approvedBy: decidedBy ?? ME.name } : {}),
      trigger: `Teamchat, gevraagd door ${ME.name}`,
      status: "done",
      sources: [],
      reason: "Gevraagd in de teamchat.",
      ...(r
        ? {
          record: {
            kind: r.kind === "chargeback"
              ? "order"
              : r.kind === "ticket"
              ? "ticket"
              : r.kind === "customer"
              ? "customer"
              : r.kind === "product"
              ? "product"
              : "order",
            label: r.code,
            to: r.to,
            ...(r.params ? { id: Object.values(r.params)[0] } : {})
          }
        }
        : {})
    })
  }
  return undefined
}

export function undoAction(a: ChatAction) {
  const back = UNDO.get(a.id)
  if (!back) return false
  back()
  UNDO.delete(a.id)
  useChatStore.getState().setAction(a.id, { state: "undone" })
  return true
}

/* ── Insyte in the conversation ──────────────────────────────────────────────────────────────── */

const INTENTS: ReadonlyArray<{ re: RegExp; command: ChatCommandId }> = [
  { re: /terugbeta|refund/i, command: "refund" },
  { re: /annuleer|annuleren|cancel/i, command: "cancel" },
  { re: /bewijs|indienen|dien .* in/i, command: "evidence" },
  { re: /accepteer|accepteren|geef .* op/i, command: "accept" },
  { re: /wijs .* toe|toewijzen|toewijs/i, command: "assign" },
  { re: /notitie|noteer/i, command: "note" },
  { re: /ticket|maak .* aan/i, command: "ticket" },
  { re: /status|zet .* op|klaar|sluit/i, command: "status" }
]

export type InsyteReply = { body: string; action?: ChatAction; records?: ChatRecordRef[] }

/**
 * What Insyte answers to a message that names it. It reads the record and the verb, then asks the
 * same question every touchpoint asks (`decide`): run it, propose it, or say it may not.
 */
export function insyteAnswer(
  text: string,
  attached: ReadonlyArray<ChatRecordRef>,
  history: ReadonlyArray<RichMessage>,
  pools: Pools
): InsyteReply {
  const asked = text.replace(/@insyte\b/gi, "").trim()
  const refs = [...attached, ...refsInText(asked, pools)]

  if (/samenvat|vat .* samen|wat speelt|bijpraten/i.test(asked)) {
    const recent = history.filter((m) => !m.action).slice(-12)
    const people = [...new Set(recent.map((m) => m.sender_name.split(" ")[0]))].filter((n) => n !== "Insyte")
    const mentioned = new Map<string, ChatRecordRef>()
    for (const m of recent) {
      for (const r of [...(m.records ?? []), ...refsInText(m.body, pools)]) mentioned.set(`${r.kind}:${r.id}`, r)
    }
    const lines = [...mentioned.values()].map((r) => resolve(r, pools)).filter((r): r is ChatRecord => r !== null)
    return {
      body: [
        `De laatste ${recent.length} berichten, van ${
          new Intl.ListFormat("nl-NL", { type: "conjunction" }).format(people)
        }:`,
        ...lines.slice(0, 4).map((r) =>
          `- **${r.code}**: ${r.title}${r.status ? `, ${r.status.label.toLowerCase()}` : ""}`
        ),
        lines.length ? "Ik heb ze hieronder gezet." : "Er is geen bestelling of zaak genoemd."
      ].join("\n"),
      records: [...mentioned.values()].slice(0, 3)
    }
  }

  const intent = INTENTS.find((i) => i.re.test(asked))
  if (!intent) {
    const r = refs[0] ? resolve(refs[0], pools) : null
    if (r) {
      return {
        body: `Dit is ${r.code}${
          r.status ? `, nu ${r.status.label.toLowerCase()}` : ""
        }. Zeg wat ik ermee moet doen: terugbetalen, annuleren, een notitie of een ticket.`,
        records: [r.ref]
      }
    }
    return {
      body:
        "Noem een bestelling, ticket of chargeback met # en zeg wat er moet gebeuren. Ik kan terugbetalen, annuleren, notities zetten, tickets maken en toewijzen, en chargebacks afhandelen. Of vraag me dit gesprek samen te vatten."
    }
  }

  const command = COMMAND[intent.command]
  const target = refs.find((ref) => command.kinds.includes(ref.kind))
  const record = target ? resolve(target, pools) : null
  const arg = intent.command === "note"
    ? (asked.split(/notitie:?|noteer:?/i)[1] ?? "").replace(
      /\bSO-\d{5}\b|\bDSP-\d{4}\b|#\d{4}\b|\b(bij|op|voor)\b/g,
      ""
    ).trim()
    : intent.command === "assign"
    ? memberFrom(asked.replace(/\b(wijs|toe|aan|het|ticket|toewijzen)\b/gi, ""), useWorkspace.getState().members)?.name
      .split(" ")[0]
    : intent.command === "status"
    ? statusFrom(asked)?.label
    : intent.command === "ticket"
    ? asked.replace(/maak|een|ticket|aan|voor|van|\bSO-\d{5}\b|\bDSP-\d{4}\b/gi, "").replace(/\s+/g, " ").trim()
    : undefined

  const why = blocked(intent.command, record, arg, demoRules())
  if (why) {
    return {
      body: `Dat lukt nog niet: ${why.charAt(0).toLowerCase()}${why.slice(1)}.`,
      ...(record ? { records: [record.ref] } : {})
    }
  }

  const decision = decide(command.agent, { personMay: true })
  if (decision === "refuse") {
    return {
      body:
        `${command.label} staat op Nooit in Zelfstandigheid, dus dat doe ik niet. Je kunt het zelf met /${command.slash}.`,
      ...(record ? { records: [record.ref] } : {})
    }
  }
  const action: ChatAction = {
    id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    command: intent.command,
    ...(target ? { target } : {}),
    ...(arg ? { arg } : {}),
    by: "insyte",
    state: decision === "run" ? "running" : "proposed",
    level: decision === "run" ? "auto" : "ask"
  }
  return {
    body: decision === "run"
      ? "Gedaan. Dit staat op Zelf doen, dus ik heb het meteen gedaan."
      : `Hier is mijn voorstel. ${command.label} staat op Eerst vragen${
        command.money ? " omdat het om geld gaat" : ""
      }.`,
    action
  }
}
