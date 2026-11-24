import { useEffect, useState } from "react"
import { CASE_STATUS, changeCase, findCase, isOpenCase, restoreCases } from "../../fixtures/chargebacks.ts"
import { ticket, TICKET_STATUS } from "../../fixtures/inbox.ts"
import type { ChatAction, ChatRef, CommandId, PersonKey, TicketStatus } from "../../fixtures/inbox.ts"
import { addEvent, changeDesk, deskOrder, isClosed, money, restoreDesk, setStatus } from "../../fixtures/order-desk.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Check, Loader, RotateCcw, XCircle } from "../../ui/icons.tsx"
import { toast } from "../../ui/toast.tsx"
import { MY_KEY } from "./parts.tsx"
import {
  createTicket,
  dropEntries,
  dropTickets,
  getInbox,
  nowClock,
  patchTicket,
  setAction,
  ticketsOf
} from "./store.ts"
import type { ActionState } from "./store.ts"

/*
 * The team chat's `/`: the same acts as the buttons on a ticket, an order or a case, typed where the
 * team talks. What touches money (a refund, a cancellation, evidence to a provider, a case given up)
 * waits for the sender's yes on the card; the rest runs at once. Each done card can be undone for
 * five minutes, as the act's own toast would allow.
 */

type Command = {
  readonly id: CommandId
  /** The button on the card: "Terugbetalen". */
  readonly label: string
  readonly money: boolean
  /** The records it works on. */
  readonly on: ReadonlyArray<ChatRef["kind"]>
  /** What follows the record, when it needs something. */
  readonly arg?: string
}

export const COMMANDS: ReadonlyArray<Command> = [
  { id: "terugbetalen", label: "Terugbetalen", money: true, on: ["order"] },
  { id: "annuleren", label: "Annuleren", money: true, on: ["order"] },
  { id: "notitie", label: "Notitie zetten", money: false, on: ["ticket", "order"], arg: "de notitie" },
  { id: "ticket", label: "Ticket maken", money: false, on: [], arg: "het onderwerp" },
  { id: "toewijzen", label: "Toewijzen", money: false, on: ["ticket"], arg: "aan wie" },
  { id: "status", label: "Status zetten", money: false, on: ["ticket"], arg: "bezig, wacht of klaar" },
  { id: "bewijs", label: "Bewijs indienen", money: true, on: ["chargeback"] },
  { id: "accepteren", label: "Accepteren", money: true, on: ["chargeback"] }
]

function command(id: CommandId): Command {
  const c = COMMANDS.find((x) => x.id === id)
  if (c === undefined) throw new Error(`team chat: no command /${id}`)
  return c
}

const UNDO_MS = 5 * 60_000

const STATUS_WORD: Readonly<Record<string, TicketStatus>> = { bezig: "bezig", wacht: "wacht", klaar: "klaar" }

const firstName = (k: PersonKey) => PEOPLE[k].name.split(" ")[0] ?? PEOPLE[k].name

/** A `#5309` or `CB-2291` as the record it names: a ticket or an order by its number, a case by its id. */
function readTarget(token: string | undefined): ChatRef | undefined {
  if (token === undefined) return undefined
  const cb = /^cb-?(\d+)$/i.exec(token)
  if (cb !== null) return { kind: "chargeback", id: `CB-${cb[1]}` }
  const n = /^#?(\d{4})$/.exec(token)?.[1]
  if (n === undefined) return undefined
  if (ticket(n, ticketsOf(getInbox(), false)) !== undefined) return { kind: "ticket", id: n }
  if (deskOrder(n) !== undefined) return { kind: "order", id: n }
  return undefined
}

type Parsed =
  | { readonly ok: true; readonly action: ChatAction }
  | { readonly ok: false; readonly reason: string }

/** A message that starts with `/` read as a command; `null` when it is not one. */
export function parseCommand(text: string): Parsed | null {
  const m = /^\/(\p{L}*)\s*(.*)$/su.exec(text.trim())
  if (m === null) return null
  const word = (m[1] ?? "").toLowerCase()
  const cmd = COMMANDS.find((c) => c.id === word)
  if (cmd === undefined) {
    return { ok: false, reason: "Onbekende opdracht. Probeer /terugbetalen, /annuleren, /notitie, /status of /bewijs" }
  }
  const rest = (m[2] ?? "").trim()
  if (cmd.on.length === 0) {
    return rest === ""
      ? { ok: false, reason: "Schrijf het onderwerp na /ticket" }
      : { ok: true, action: { command: cmd.id, arg: rest } }
  }
  const [token, ...more] = rest.split(/\s+/)
  const target = readTarget(token)
  const arg = more.join(" ").trim()
  if (target === undefined) return { ok: false, reason: "Kies een bestelling, ticket of zaak met #" }
  const reason = blocked(cmd, target, arg)
  if (reason !== undefined) return { ok: false, reason }
  return { ok: true, action: { command: cmd.id, target, ...(arg === "" ? {} : { arg }) } }
}

const KIND_WORD: Readonly<Record<ChatRef["kind"], string>> = {
  ticket: "een ticket",
  order: "een bestelling",
  chargeback: "een chargeback",
  customer: "een klant",
  product: "een product",
  supplier: "een leverancier"
}

function assigneeOf(arg: string): PersonKey | undefined {
  const name = arg.replace(/^@/, "").toLowerCase()
  if (name === "") return undefined
  return (Object.keys(PEOPLE) as ReadonlyArray<PersonKey>).find((k) =>
    PEOPLE[k].name.toLowerCase().startsWith(name) ||
    firstName(k).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") ===
      name.normalize("NFD").replace(/\p{M}/gu, "")
  )
}

/** Why a command cannot run on this record, if it cannot. */
function blocked(cmd: Command, target: ChatRef, arg: string): string | undefined {
  if (!cmd.on.includes(target.kind)) {
    return `${cmd.label} werkt op ${cmd.on.map((k) => KIND_WORD[k]).join(" of ")}`
  }
  if (target.kind === "order") {
    const o = deskOrder(target.id)
    if (o !== undefined && cmd.id === "terugbetalen" && o.status === "terugbetaald") {
      return `#${o.number} is al terugbetaald`
    }
    if (o !== undefined && cmd.id === "annuleren" && isClosed(o)) return `#${o.number} is al ${o.status}`
  }
  if (target.kind === "chargeback") {
    const c = findCase(target.id)
    if (c === undefined) return `${target.id} bestaat niet`
    if (!isOpenCase(c)) return `${c.id} is al ${CASE_STATUS[c.status].label.toLowerCase()}`
    if (cmd.id === "bewijs" && c.status === "ingediend") return `Het bewijs voor ${c.id} is al ingediend`
    if (cmd.id === "bewijs" && c.files.length === 0) return `${c.id} heeft nog geen bewijs; stel eerst een pakket samen`
  }
  if (cmd.id === "notitie" && arg === "") return "Schrijf de notitie na het nummer"
  if (cmd.id === "toewijzen" && assigneeOf(arg) === undefined) return "Noem de collega, bijvoorbeeld @Sofía"
  if (cmd.id === "status" && STATUS_WORD[arg.toLowerCase()] === undefined) return "Zeg bezig, wacht of klaar"
  return undefined
}

const code = (r: ChatRef | undefined) => (r === undefined ? "" : r.kind === "chargeback" ? r.id : `#${r.id}`)

/** What the card says before it runs, and after. */
function lines(a: ChatAction): { readonly pending: string; readonly done: string } {
  const c = code(a.target)
  switch (a.command) {
    case "terugbetalen": {
      const o = a.target === undefined ? undefined : deskOrder(a.target.id)
      const amount = o === undefined ? "" : ` · ${money(o.total)}`
      return { pending: `${c} terugbetalen${amount}`, done: `${c} terugbetaald${amount}` }
    }
    case "annuleren":
      return { pending: `${c} annuleren`, done: `${c} geannuleerd` }
    case "notitie":
      return { pending: `Notitie bij ${c}: “${a.arg ?? ""}”`, done: `Notitie gezet bij ${c}` }
    case "ticket":
      return { pending: `Ticket: ${a.arg ?? ""}`, done: `Ticket aangemaakt: ${a.arg ?? ""}` }
    case "toewijzen": {
      const who = assigneeOf(a.arg ?? "")
      const name = who === undefined ? a.arg ?? "" : PEOPLE[who].name
      return { pending: `${c} toewijzen aan ${name}`, done: `${c} toegewezen aan ${name}` }
    }
    case "status": {
      const s = STATUS_WORD[(a.arg ?? "").toLowerCase()]
      const label = s === undefined ? a.arg ?? "" : TICKET_STATUS[s].label.toLowerCase()
      return { pending: `${c} op ${label} zetten`, done: `${c} op ${label} gezet` }
    }
    case "bewijs": {
      const k = a.target === undefined ? undefined : findCase(a.target.id)
      const n = k?.files.length ?? 0
      return {
        pending: `Bewijs voor ${c} indienen · ${n} ${n === 1 ? "document" : "documenten"}`,
        done: `Bewijs voor ${c} ingediend`
      }
    }
    case "accepteren":
      return { pending: `${c} accepteren als verloren`, done: `${c} geaccepteerd` }
  }
}

/** The read-back under the field while a command is typed: what will happen, or why it cannot. */
export function readBack(text: string): { readonly tone: "plain" | "warn"; readonly text: string } | null {
  const p = parseCommand(text)
  if (p === null) return null
  if (!p.ok) return { tone: "warn", text: p.reason }
  const cmd = command(p.action.command)
  return { tone: "plain", text: `${lines(p.action).pending}${cmd.money ? " · gaat over geld, dus eerst jouw ja" : ""}` }
}

/** The state a card opens in: an agent's proposal, a yes for money, or (when it just ran) done. */
export function startState(a: ChatAction): ActionState {
  if (a.proposed === true) return { state: "voorgesteld" }
  return command(a.command).money ? { state: "bevestigen" } : { state: "bezig" }
}

/** Carry out the act on the record it names, and return how to take it back. */
function perform(a: ChatAction): () => void {
  const by = PEOPLE[MY_KEY].name
  const t = a.target
  switch (a.command) {
    case "terugbetalen":
    case "annuleren": {
      if (t === undefined) return () => {}
      const before = changeDesk((d) =>
        addEvent(
          setStatus(d, [t.id], a.command === "terugbetalen" ? "terugbetaald" : "geannuleerd"),
          t.id,
          `${a.command === "terugbetalen" ? "Terugbetaald" : "Geannuleerd"} vanuit de teamchat door ${by}`
        )
      )
      return () => restoreDesk(before)
    }
    case "notitie": {
      if (t === undefined) return () => {}
      if (t.kind === "ticket") {
        patchTicket(t.id, { entries: [{ kind: "note", who: MY_KEY, at: nowClock(), text: a.arg ?? "" }] })
        return () => dropEntries(t.id, 1)
      }
      const before = changeDesk((d) => ({
        ...d,
        notes: {
          ...d.notes,
          [t.id]: [{ id: `chat-${Date.now()}`, at: Date.now(), by, text: a.arg ?? "" }, ...(d.notes[t.id] ?? [])]
        }
      }))
      return () => restoreDesk(before)
    }
    case "ticket": {
      const number = createTicket({
        customerId: "",
        handle: "Intern",
        subject: a.arg ?? "",
        channel: "email",
        status: "nieuw",
        priority: "gemiddeld",
        assignee: MY_KEY,
        labels: [],
        createdAt: nowClock(),
        unread: false,
        entries: [{ kind: "event", at: nowClock(), text: `${by} maakte het ticket vanuit de teamchat.` }]
      })
      return () => dropTickets([number])
    }
    case "toewijzen": {
      const who = assigneeOf(a.arg ?? "")
      const current = t === undefined ? undefined : ticket(t.id, ticketsOf(getInbox(), false))
      if (t === undefined || who === undefined || current === undefined) return () => {}
      const before = current.assignee
      patchTicket(t.id, { assignee: who })
      return () => patchTicket(t.id, { assignee: before })
    }
    case "status": {
      const next = STATUS_WORD[(a.arg ?? "").toLowerCase()]
      const current = t === undefined ? undefined : ticket(t.id, ticketsOf(getInbox(), false))
      if (t === undefined || next === undefined || current === undefined) return () => {}
      const before = current.status
      patchTicket(t.id, { status: next })
      return () => patchTicket(t.id, { status: before })
    }
    case "bewijs":
    case "accepteren": {
      if (t === undefined) return () => {}
      const before = changeCase(t.id, (c) => ({
        status: a.command === "bewijs" ? "ingediend" : "verloren",
        events: [
          ...c.events,
          {
            at: Date.now(),
            who: by,
            text: a.command === "bewijs"
              ? `Bewijs ingediend vanuit de teamchat: ${c.files.length} documenten`
              : "Geaccepteerd als verloren vanuit de teamchat",
            ...(a.command === "accepteren" ? { tone: "bad" as const } : {})
          }
        ]
      }))
      return () => restoreCases(before)
    }
  }
}

/** Run a card's act now, and put it at done with its undo. */
export function runAction(messageId: string, a: ChatAction) {
  setAction(messageId, { state: "bezig" })
  const undo = perform(a)
  setAction(messageId, { state: "gedaan", by: PEOPLE[MY_KEY].name, until: Date.now() + UNDO_MS, undo })
}

/** A command in the conversation, as its card: what it does, then its yes, its result and its undo. */
export function ActionCard({ messageId, action, state, edit }: {
  readonly messageId: string
  readonly action: ChatAction
  readonly state: ActionState
  readonly edit: boolean
}) {
  const cmd = command(action.command)
  const text = lines(action)
  const [now, setNow] = useState(() => Date.now())
  const ticking = state.state === "gedaan" && state.until > now
  useEffect(() => {
    if (!ticking) return
    const id = globalThis.setInterval(() => setNow(Date.now()), 1000)
    return () => globalThis.clearInterval(id)
  }, [ticking])

  const undo = () => {
    if (state.state !== "gedaan") return
    state.undo?.()
    setAction(messageId, { state: "ongedaan", by: PEOPLE[MY_KEY].name })
    toast({ title: "Teruggezet", body: `${text.done}, ongedaan gemaakt.` })
  }
  const yes = () => {
    runAction(messageId, action)
    toast({ title: text.done, tone: "good" })
  }

  const left = state.state === "gedaan" ? Math.max(0, state.until - now) : 0
  const mm = Math.floor(left / 60_000)
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")

  return (
    <div
      className={cx(
        "flex max-w-[34rem] flex-col gap-2 rounded-md px-3 py-2.5",
        state.state === "gedaan"
          ? "bg-good-tint"
          : state.state === "afgewezen"
          ? "bg-well"
          : "bg-panel ring-1 ring-line ring-inset"
      )}
    >
      <p className="flex items-start gap-2 text-sm text-ink">
        {state.state === "gedaan"
          ? <Check size={16} className="mt-0.5 shrink-0 text-good-ink" />
          : state.state === "bezig"
          ? <Loader size={16} className="mt-0.5 shrink-0 animate-spin text-ink-3 motion-reduce:animate-none" />
          : state.state === "afgewezen"
          ? <XCircle size={16} className="mt-0.5 shrink-0 text-ink-3" />
          : state.state === "ongedaan"
          ? <RotateCcw size={16} className="mt-0.5 shrink-0 text-ink-3" />
          : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />}
        <span
          className={cx(
            "text-pretty",
            (state.state === "afgewezen" || state.state === "ongedaan") && "text-ink-3 line-through"
          )}
        >
          {state.state === "gedaan" ? text.done : text.pending}
        </span>
      </p>
      {(state.state === "bevestigen" || state.state === "voorgesteld") && (
        <>
          <p className="text-xs text-ink-3">
            {state.state === "voorgesteld" ? "Voorgesteld door de agent. " : ""}Gaat over geld, dus eerst jouw ja.
          </p>
          {edit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={yes}>{cmd.label}</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAction(messageId, { state: "afgewezen", by: PEOPLE[MY_KEY].name })}
              >
                {state.state === "voorgesteld" ? "Afwijzen" : "Annuleren"}
              </Button>
            </div>
          )}
        </>
      )}
      {state.state === "gedaan" && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>Gedaan door {state.by}</span>
          {edit && left > 0 && state.undo !== undefined && (
            <button
              type="button"
              onClick={undo}
              className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              Ongedaan maken <span className="figure font-normal text-ink-3">({mm}:{ss})</span>
            </button>
          )}
        </p>
      )}
      {state.state === "ongedaan" && <p className="text-xs text-ink-3">Teruggezet zoals het was, door {state.by}.</p>}
      {state.state === "afgewezen" && <p className="text-xs text-ink-3">Niet gedaan; afgewezen door {state.by}.</p>}
    </div>
  )
}
