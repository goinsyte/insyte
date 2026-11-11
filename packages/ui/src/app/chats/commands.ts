import type { ChatAction, ChatCommandId, ChatRecordKind, ChatRecordRef } from "../../data-source"
import type { AgentActionId } from "../lib/autonomy"
import type { ChatRecord } from "./records"
import type { ChatRules } from "./source"

/*
 * The app, from the composer. A command is a verb the product already has (the same command a
 * button on the order screen runs), said in a conversation so the team sees it happen. A person's
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

export const INSYTE = { id: "u_insyte", name: "Insyte" } as const

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
export function blocked(
  command: ChatCommandId,
  r: ChatRecord | null,
  arg: string | undefined,
  rules: ChatRules
): string | undefined {
  const c = COMMAND[command]
  if (!rules.available.has(command)) return `${c.label} kan hier nog niet`
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
  if (command === "assign" && !memberFrom(arg, rules.team)) return "Noem de collega, bijvoorbeeld @Sofía"
  if (command === "status" && !statusFrom(arg)) return "Zeg bezig, wacht of klaar"
  return undefined
}

/** The teammate a command's text names, by the start of their first name. */
export function memberFrom<M extends { name: string }>(
  text: string | undefined,
  team: ReadonlyArray<M>
): M | undefined {
  if (!text) return undefined
  const words = text.toLowerCase().replace(/@/g, "").split(/\s+/).filter(Boolean)
  return team.find((m) => words.some((w) => m.name.toLowerCase().split(" ")[0]?.startsWith(w) && w.length > 1))
}

/* ── the slash line ──────────────────────────────────────────────────────────────────────────── */

/** "/terugbetalen SO-12224" read back: the command, the record it is about, and what is left. */
export function parseSlash(
  text: string,
  attached: ReadonlyArray<ChatRecordRef>,
  refsInText: (text: string) => Array<ChatRecordRef>
) {
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim())
  if (!m) return null
  const command = COMMANDS.find((c) => c.slash === m[1]?.toLowerCase())
  if (!command) return null
  const rest = m[2] ?? ""
  const fromText = refsInText(rest)
  const target = [...attached, ...fromText].find((ref) => command.kinds.includes(ref.kind)) ?? attached[0] ??
    fromText[0]
  const arg = rest.replace(/\bSO-\d{5}\b|\bDSP-\d{4}\b|#\d{4}\b/g, "").replace(/\s+/g, " ").trim()
  return { command, target, arg }
}

export const mentionsInsyte = (text: string) => /@insyte\b/i.test(text)
