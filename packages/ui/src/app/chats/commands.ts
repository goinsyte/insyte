import type { ChatAction, ChatCommandId, ChatRecordKind, ChatRecordRef, RichMessage } from "../../data-source"
import { type AgentActionId, UNDO_WINDOW_MS } from "../lib/autonomy"
import { useAgentLog } from "../stores/agent-log-store"
import { decide } from "../stores/autonomy-store"
import { useChatStore } from "../stores/chat-store"
import { useWorkspace } from "../stores/workspace-store"
import { type ChatRecord, refsInText, resolve, usePools } from "./records"

/*
 * The app, from the composer. A command is a verb the product already has (the same store call a
 * button on the order screen makes), said in a conversation so the team sees it happen. A person's
 * money command stops at a confirm on its own card; Insyte's asks or runs as Zelfstandigheid says.
 * Every one that ran can be taken back for five minutes, from the card.
 */

export type Command = {
  id: ChatCommandId
  /** What follows the slash. */
  slash: string
  label: string
  /** What it does, for the picker. */
  hint: string
  kinds: ReadonlyArray<ChatRecordKind>
  agent: AgentActionId
  /** Moves money or cannot be taken back at the other end: a person confirms on the card. */
  money?: boolean
  /** What the free text after the record means, when the command needs it. */
  arg?: string
}

export const COMMANDS: ReadonlyArray<Command> = [
  {
    id: "refund",
    slash: "terugbetalen",
    label: "Terugbetalen",
    hint: "Een bestelling terugbetalen",
    kinds: ["order"],
    agent: "RefundOrder",
    money: true
  },
  {
    id: "cancel",
    slash: "annuleren",
    label: "Annuleren",
    hint: "Een bestelling annuleren",
    kinds: ["order"],
    agent: "CancelOrder",
    money: true
  },
  {
    id: "note",
    slash: "notitie",
    label: "Notitie",
    hint: "Een interne notitie bij een bestelling of zaak",
    kinds: ["order", "chargeback"],
    agent: "AddNote",
    arg: "De notitie"
  },
  {
    id: "ticket",
    slash: "ticket",
    label: "Ticket maken",
    hint: "Een ticket uit dit gesprek",
    kinds: ["order", "customer", "chargeback", "product"],
    agent: "CreateTicket",
    arg: "Waar het over gaat"
  },
  {
    id: "assign",
    slash: "toewijzen",
    label: "Toewijzen",
    hint: "Een ticket aan een collega geven",
    kinds: ["ticket"],
    agent: "AssignTicket",
    arg: "Aan wie"
  },
  {
    id: "status",
    slash: "status",
    label: "Status",
    hint: "Een ticket op Bezig, Wacht of Klaar zetten",
    kinds: ["ticket"],
    agent: "SetTicketStatus",
    arg: "Bezig, wacht of klaar"
  },
  {
    id: "evidence",
    slash: "bewijs",
    label: "Bewijs indienen",
    hint: "Het bewijspakket van een chargeback indienen",
    kinds: ["chargeback"],
    agent: "SubmitEvidence",
    money: true
  },
  {
    id: "accept",
    slash: "accepteren",
    label: "Geschil accepteren",
    hint: "Een chargeback opgeven",
    kinds: ["chargeback"],
    agent: "AcceptDispute",
    money: true
  }
]

export const COMMAND: Record<ChatCommandId, Command> = Object.fromEntries(COMMANDS.map((c) => [c.id, c])) as Record<
  ChatCommandId,
  Command
>

export const ME = { id: "u_elena", name: "Elena Hart", memberId: "mem_elena" } as const
export const INSYTE = { id: "u_insyte", name: "Insyte" } as const

type Pools = ReturnType<typeof usePools>

/** What the card says before it ran: "SO-12224 terugbetalen". */
export function pendingLine(a: Pick<ChatAction, "command" | "arg">, r: ChatRecord | null): string {
  const code = r?.code ?? ""
  switch (a.command) {
    case "refund":
      return `${code} terugbetalen`
    case "cancel":
      return `${code} annuleren`
    case "note":
      return `Notitie bij ${code}`
    case "ticket":
      return `Ticket: ${a.arg || r?.title || "uit dit gesprek"}`
    case "assign":
      return `${code} toewijzen aan ${a.arg ?? "…"}`
    case "status":
      return `${code} op ${statusFrom(a.arg)?.label ?? "…"} zetten`
    case "evidence":
      return `Bewijs voor ${code} indienen`
    case "accept":
      return `${code} accepteren`
  }
}

/** What the card says once it ran. */
export function doneLine(a: Pick<ChatAction, "command" | "arg">, r: ChatRecord | null): string {
  const code = r?.code ?? ""
  switch (a.command) {
    case "refund":
      return `${code} terugbetaald`
    case "cancel":
      return `${code} geannuleerd`
    case "note":
      return `Notitie gezet bij ${code}`
    case "ticket":
      return `Ticket aangemaakt: ${a.arg || r?.title || "uit dit gesprek"}`
    case "assign":
      return `${code} toegewezen aan ${a.arg ?? ""}`
    case "status":
      return `${code} op ${statusFrom(a.arg)?.label ?? ""} gezet`
    case "evidence":
      return `Bewijs voor ${code} ingediend`
    case "accept":
      return `${code} geaccepteerd`
  }
}

const STATUS_WORDS = [
  { re: /klaar|gesloten|sluit|done/i, value: "done", label: "Klaar" },
  { re: /bezig|oppak|werk/i, value: "in_progress", label: "Bezig" },
  { re: /wacht/i, value: "awaiting_reply", label: "Wacht op antwoord" },
  { re: /nieuw|heropen/i, value: "intake", label: "Nieuw" }
] as const

export function statusFrom(text: string | undefined) {
  return text ? STATUS_WORDS.find((s) => s.re.test(text)) : undefined
}

/** Why a command cannot run on this record now, in the words the card shows; undefined when it can. */
export function blocked(command: ChatCommandId, r: ChatRecord | null, arg?: string): string | undefined {
  const c = COMMAND[command]
  if (command !== "ticket" && !r) {
    return `Kies ${
      c.kinds.length > 1
        ? "een bestelling of zaak"
        : `een ${c.kinds[0] === "order" ? "bestelling" : c.kinds[0] === "chargeback" ? "chargeback" : "ticket"}`
    } met #`
  }
  if (r && !c.kinds.includes(r.kind)) {
    return `${c.label} werkt op ${
      c.kinds.map((k) => (k === "order"
        ? "bestellingen"
        : k === "chargeback"
        ? "chargebacks"
        : k === "ticket"
        ? "tickets"
        : k === "customer"
        ? "klanten"
        : "producten")
      ).join(" en ")
    }`
  }
  if (r?.kind === "order") {
    const o = r.order
    if (command === "refund" && o.payment_status !== "paid") {
      return `${o.number} is al ${o.payment_status === "refunded" ? "terugbetaald" : "niet betaald"}`
    }
    if (command === "cancel" && (o.status === "cancelled" || o.status === "refunded")) {
      return `${o.number} is al ${o.status === "cancelled" ? "geannuleerd" : "terugbetaald"}`
    }
  }
  if (r?.kind === "chargeback") {
    const cb = r.chargeback
    if (command === "evidence" && !(cb.status === "open" || cb.status === "awaiting_evidence")) {
      return `${cb.case_number} is al ${cb.status === "submitted" ? "ingediend" : "afgerond"}`
    }
    if (command === "accept" && (cb.status === "won" || cb.status === "lost")) return `${cb.case_number} is al afgerond`
  }
  if (command === "note" && !arg?.trim()) return "Schrijf de notitie na de bestelling"
  if (command === "assign" && !memberFrom(arg)) return "Noem de collega, bijvoorbeeld @Sofía"
  if (command === "status" && !statusFrom(arg)) return "Zeg bezig, wacht of klaar"
  return undefined
}

export function memberFrom(text: string | undefined) {
  if (!text) return undefined
  const words = text.toLowerCase().replace(/@/g, "").split(/\s+/).filter(Boolean)
  return useWorkspace.getState().members.find((m) =>
    words.some((w) => m.name.toLowerCase().split(" ")[0]?.startsWith(w) && w.length > 1)
  )
}

/* What was there before an action ran, so the card can put it back. Kept for the session only:
   after a reload the record has moved on and the card says so rather than offering a stale undo. */
const UNDO = new Map<string, () => void>()
export const canUndoHere = (actionId: string) => UNDO.has(actionId)

/** Runs the action against the workspace. Resolves with a failure reason, or nothing when it ran. */
export async function execute(a: ChatAction, r: ChatRecord | null): Promise<string | undefined> {
  const ws = useWorkspace.getState()
  const why = blocked(a.command, r, a.arg)
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
      const m = memberFrom(a.arg)
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

/* ── the slash line ──────────────────────────────────────────────────────────────────────────── */

/** "/terugbetalen SO-12224" read back: the command, the record it is about, and what is left. */
export function parseSlash(text: string, attached: ReadonlyArray<ChatRecordRef>, pools: Pools) {
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim())
  if (!m) return null
  const command = COMMANDS.find((c) => c.slash === m[1]?.toLowerCase())
  if (!command) return null
  const rest = m[2] ?? ""
  const fromText = refsInText(rest, pools)
  const target = [...attached, ...fromText].find((ref) => command.kinds.includes(ref.kind)) ?? attached[0] ??
    fromText[0]
  const arg = rest.replace(/\bSO-\d{5}\b|\bDSP-\d{4}\b|#\d{4}\b/g, "").replace(/\s+/g, " ").trim()
  return { command, target, arg, record: target ? resolve(target, pools) : null }
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

export const mentionsInsyte = (text: string) => /@insyte\b/i.test(text)

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
    ? memberFrom(asked.replace(/\b(wijs|toe|aan|het|ticket|toewijzen)\b/gi, ""))?.name.split(" ")[0]
    : intent.command === "status"
    ? statusFrom(asked)?.label
    : intent.command === "ticket"
    ? asked.replace(/maak|een|ticket|aan|voor|van|\bSO-\d{5}\b|\bDSP-\d{4}\b/gi, "").replace(/\s+/g, " ").trim()
    : undefined

  const why = blocked(intent.command, record, arg)
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
