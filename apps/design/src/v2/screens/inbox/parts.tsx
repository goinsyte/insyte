import { Fragment, useId, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import { channelLabel, PRIORITY, STATUS_ORDER, TICKET_STATUS } from "../../fixtures/inbox.ts"
import type { Channel, Entry, PersonKey, Priority, Ticket, TicketStatus } from "../../fixtures/inbox.ts"
import { ME, PEOPLE } from "../../fixtures/workspace.ts"
import { AgentAvatar, Avatar } from "../../ui/avatar.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Bot,
  ChevronDown,
  Image,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Send,
  Smartphone,
  UserX
} from "../../ui/icons.tsx"
import { SEND_WINDOW_S } from "../../ui/proposal.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dropEntries, nowClock, patchTicket } from "./store.ts"

/** The signed-in person's key in `PEOPLE`. */
export const MY_KEY: PersonKey = "elena"

export const firstName = (who: PersonKey) => PEOPLE[who].name.split(" ")[0] ?? PEOPLE[who].name

/* ── channels ──────────────────────────────────────────────────────────────────────────────────── */

const CHANNEL_GLYPH = { email: Mail, whatsapp: Smartphone, instagram: Image, winkelchat: MessageSquare } as const

/** A channel as a quiet glyph, named for assistive tech and on hover. */
export function ChannelGlyph({ channel, size = 14, className }: {
  readonly channel: Channel
  readonly size?: number
  readonly className?: string
}) {
  const G = CHANNEL_GLYPH[channel]
  return (
    <span title={`Via ${channelLabel(channel)}`} className={cx("inline-flex shrink-0 text-ink-3", className)}>
      <G size={size} aria-label={`Via ${channelLabel(channel)}`} />
    </span>
  )
}

export function TicketStatusTag({ status }: { readonly status: TicketStatus }) {
  return <Status tone={TICKET_STATUS[status].tone}>{TICKET_STATUS[status].label}</Status>
}

export function PriorityTag({ priority }: { readonly priority: Priority }) {
  if (priority === "laag") return <Status>{PRIORITY.laag.label}</Status>
  return <Tag tone={PRIORITY[priority].tone}>{PRIORITY[priority].label}</Tag>
}

/* ── the ticket's controls, each with its undo ────────────────────────────────────────────────── */

export function setStatus(t: Ticket, next: TicketStatus) {
  if (t.status === next) return
  const before = t.status
  patchTicket(t.number, { status: next })
  toast({
    title: `#${t.number} naar ${TICKET_STATUS[next].label.toLowerCase()}`,
    action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { status: before }) }
  })
}

export function assign(t: Ticket, who: PersonKey | null) {
  if (t.assignee === who) return
  const before = t.assignee
  patchTicket(t.number, { assignee: who })
  toast({
    title: who === null
      ? `Toewijzing van #${t.number} weggehaald`
      : who === MY_KEY
      ? `#${t.number} aan jou toegewezen`
      : `#${t.number} toegewezen aan ${PEOPLE[who].name}`,
    action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { assignee: before }) }
  })
}

export function setPriority(t: Ticket, next: Priority) {
  if (t.priority === next) return
  const before = t.priority
  patchTicket(t.number, { priority: next })
  toast({
    title: `Prioriteit ${PRIORITY[next].label.toLowerCase()} voor #${t.number}`,
    action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { priority: before }) }
  })
}

const triggerClass =
  "inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-45 pointer-coarse:h-11"

export function StatusMenu({ t, disabled = false }: { readonly t: Ticket; readonly disabled?: boolean }) {
  return (
    <DropdownMenu
      label="Status"
      width="w-52"
      trigger={(props) => (
        <button type="button" disabled={disabled} className={triggerClass} {...props}>
          <TicketStatusTag status={t.status} />
          <ChevronDown size={13} className="text-ink-3" />
          <span className="sr-only">Status wijzigen</span>
        </button>
      )}
    >
      <DropdownLabel>Verplaatsen naar</DropdownLabel>
      {STATUS_ORDER.map((s) => (
        <DropdownItem key={s} checked={t.status === s} onSelect={() => setStatus(t, s)}>
          {TICKET_STATUS[s].label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  )
}

export function PriorityMenu({ t, disabled = false }: { readonly t: Ticket; readonly disabled?: boolean }) {
  return (
    <DropdownMenu
      label="Prioriteit"
      width="w-48"
      trigger={(props) => (
        <button type="button" disabled={disabled} className={triggerClass} {...props}>
          <PriorityTag priority={t.priority} />
          <ChevronDown size={13} className="text-ink-3" />
          <span className="sr-only">Prioriteit wijzigen</span>
        </button>
      )}
    >
      <DropdownLabel>Prioriteit</DropdownLabel>
      {(["hoog", "gemiddeld", "laag"] as const).map((p) => (
        <DropdownItem
          key={p}
          checked={t.priority === p}
          onSelect={() => setPriority(t, p)}
        >
          {PRIORITY[p].label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  )
}

export function AssignMenu({ t, disabled = false, compact = false }: {
  readonly t: Ticket
  readonly disabled?: boolean
  readonly compact?: boolean
}) {
  return (
    <DropdownMenu
      label="Toewijzen"
      width="w-60"
      trigger={(props) => (
        <button type="button" disabled={disabled} className={triggerClass} {...props}>
          {t.assignee === null
            ? <UserX size={15} className="text-ink-3" />
            : <Avatar name={PEOPLE[t.assignee].name} size={20} />}
          <span className={cx(compact && "sr-only sm:not-sr-only")}>
            {t.assignee === null ? "Niet toegewezen" : t.assignee === MY_KEY ? "Jij" : firstName(t.assignee)}
          </span>
          <ChevronDown size={13} className="text-ink-3" />
          <span className="sr-only">Toewijzen</span>
        </button>
      )}
    >
      <DropdownLabel>Toewijzen aan</DropdownLabel>
      {(Object.keys(PEOPLE) as ReadonlyArray<PersonKey>).map((key) => (
        <DropdownItem
          key={key}
          checked={t.assignee === key}
          onSelect={() => assign(t, key)}
        >
          {PEOPLE[key].name}
          {key === MY_KEY ? " (jij)" : ""}
        </DropdownItem>
      ))}
      <DropdownSeparator />
      <DropdownItem glyph={UserX} disabled={t.assignee === null} onSelect={() => assign(t, null)}>
        Toewijzing weghalen
      </DropdownItem>
    </DropdownMenu>
  )
}

/* ── the conversation ──────────────────────────────────────────────────────────────────────────── */

/** A text with `@Naam` mentions drawn on the accent, and line breaks kept. */
export function Mentioned({ text }: { readonly text: string }) {
  const parts = text.split(/(@[A-ZÀ-Ý][\p{L}]+)/u)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@")
          ? <span key={i} className="rounded-xs bg-accent-tint px-0.5 font-medium text-accent-ink">{part}</span>
          : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}

export const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? "Agent"

/** One line of a ticket's conversation, in the order it happened. */
export function EntryView({ entry, customer }: { readonly entry: Entry; readonly customer: string }) {
  if (entry.kind === "event") {
    return (
      <li className="flex items-start gap-2 pl-10 text-xs text-ink-3">
        <span className="figure shrink-0">{entry.at}</span>
        <span className="text-pretty">{entry.text}</span>
      </li>
    )
  }
  const agent = entry.kind === "agent" ? AGENTS.find((a) => a.id === entry.agentId) : undefined
  const name = entry.kind === "customer"
    ? customer
    : entry.kind === "agent"
    ? agentName(entry.agentId)
    : PEOPLE[entry.who].name
  const note = entry.kind === "note"
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <span className="pt-0.5">
        {entry.kind === "agent"
          ? <AgentAvatar glyph={agent?.glyph ?? Bot} size={28} />
          : <Avatar name={name} size={28} />}
      </span>
      <div className={cx("flex min-w-0 flex-col gap-1.5", note && "rounded-md bg-warn-tint px-3 py-2.5")}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-ink">{name}</span>
          {entry.kind === "team" && <span className="text-xs text-ink-3">antwoordde</span>}
          {entry.kind === "agent" && <span className="text-xs text-ink-3">agent</span>}
          {note && (
            <span className="inline-flex items-center gap-1 text-xs text-warn-ink">
              <Lock size={12} />
              Interne notitie
            </span>
          )}
          <span className="figure text-2xs text-ink-3">{entry.at}</span>
        </p>
        <p className="max-w-[62ch] text-sm leading-6 text-pretty whitespace-pre-line text-ink">
          <Mentioned text={entry.text} />
        </p>
        {entry.kind === "customer" && entry.attachment !== undefined && (
          <button
            type="button"
            onClick={() => toast({ title: `${entry.attachment} geopend`, body: "In het product opent de foto hier." })}
            className="inline-flex h-8 items-center gap-1.5 self-start rounded-sm bg-well px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink pointer-coarse:h-11"
          >
            <Paperclip size={14} />
            {entry.attachment}
          </button>
        )}
      </div>
    </li>
  )
}

/* ── the reply box ─────────────────────────────────────────────────────────────────────────────── */

const MENTIONABLE = (Object.keys(PEOPLE) as ReadonlyArray<PersonKey>).filter((k) => k !== MY_KEY)

/**
 * Answering a ticket: a reply to the customer, or an internal note the team sees (with `@` to
 * mention a colleague). A reply waits out the send window before it leaves, with "Niet versturen"
 * beside it, as every send in the product does. Not Magnus's composer: no gradient, this is a person
 * writing to a person.
 */
export function ReplyBox({ t, customer, prefill, onPrefillUsed }: {
  readonly t: Ticket
  readonly customer: string
  /** A draft put into the field from outside (Magnus's concept). */
  readonly prefill?: string
  readonly onPrefillUsed?: () => void
}) {
  const [mode, setMode] = useState<"antwoord" | "notitie">("antwoord")
  const [text, setText] = useState("")
  const area = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const [seen, setSeen] = useState<string | undefined>(undefined)
  if (prefill !== undefined && prefill !== seen) {
    setSeen(prefill)
    setText(prefill)
    setMode("antwoord")
    onPrefillUsed?.()
  }

  const mention = /(^|\s)@(\p{L}*)$/u.exec(text)
  const matches = mention === null
    ? []
    : MENTIONABLE.filter((k) => PEOPLE[k].name.toLowerCase().startsWith((mention[2] ?? "").toLowerCase()))

  const pick = (who: PersonKey) => {
    setText((current) => current.replace(/@(\p{L}*)$/u, `@${firstName(who)} `))
    area.current?.focus()
  }

  const send = () => {
    const body = text.trim()
    if (body === "") return
    if (mode === "antwoord") {
      patchTicket(t.number, {
        entries: [{ kind: "team", who: MY_KEY, at: nowClock(), text: body }],
        answered: true,
        unread: false,
        ...(t.status === "nieuw" ? { status: "bezig" as const } : {})
      })
      const before = { status: t.status, waitingSince: t.waitingSince }
      toast({
        title: `Wordt over ${SEND_WINDOW_S} s verstuurd`,
        body: `Via ${channelLabel(t.channel)} aan ${customer}.`,
        duration: SEND_WINDOW_S * 1000,
        action: {
          label: "Niet versturen",
          onClick: () => {
            dropEntries(t.number, 1)
            patchTicket(t.number, { status: before.status, answered: before.waitingSince === undefined })
            setText(body)
          }
        }
      })
    } else {
      patchTicket(t.number, { entries: [{ kind: "note", who: MY_KEY, at: nowClock(), text: body }] })
      const told = MENTIONABLE.filter((k) => body.includes(`@${firstName(k)}`))
      toast({
        title: "Notitie geplaatst",
        body: told.length === 0
          ? "Alleen het team ziet hem."
          : `${told.map((k) => PEOPLE[k].name).join(" en ")} ${told.length === 1 ? "krijgt" : "krijgen"} een melding.`,
        tone: "good",
        action: { label: "Ongedaan maken", onClick: () => dropEntries(t.number, 1) }
      })
    }
    setText("")
  }

  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-lg p-3 ring-1 ring-inset transition-colors",
        mode === "notitie" ? "bg-warn-tint ring-transparent" : "bg-canvas ring-line-strong focus-within:ring-ink-4"
      )}
    >
      <Tabs
        label="Soort bericht"
        variant="pill"
        value={mode}
        onChange={setMode}
        tabs={[
          { value: "antwoord", label: `Antwoord aan ${customer.split(" ")[0] ?? customer}` },
          { value: "notitie", label: "Interne notitie" }
        ]}
      />
      <label htmlFor={id} className="sr-only">
        {mode === "antwoord" ? `Antwoord aan ${customer}` : "Interne notitie"}
      </label>
      <textarea
        id={id}
        ref={area}
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send()
        }}
        placeholder={mode === "antwoord"
          ? `Schrijf ${customer.split(" ")[0] ?? customer} via ${channelLabel(t.channel)}`
          : "Alleen het team ziet dit. Typ @ om een collega te noemen"}
        className="min-h-16 w-full resize-y bg-transparent px-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-3"
      />
      {matches.length > 0 && mode === "notitie" && (
        <ul aria-label="Collega noemen" className="flex flex-wrap gap-1">
          {matches.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => pick(k)}
                className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-canvas px-2 text-xs text-ink-2 hover:text-ink pointer-coarse:h-11"
              >
                <Avatar name={PEOPLE[k].name} size={16} />
                {PEOPLE[k].name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-ink-3">
          {mode === "antwoord" ? `Wacht ${SEND_WINDOW_S} s voor hij vertrekt` : "Geen bericht naar de klant"}
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Send />}
          disabled={text.trim() === ""}
          onClick={send}
          className="pointer-coarse:h-11"
        >
          {mode === "antwoord" ? "Versturen" : "Notitie plaatsen"}
        </Button>
      </div>
    </div>
  )
}

/** A short line of type with a figure: "Wacht 6 u", in warn ink once it is long. */
export function Waiting({ mins, long }: { readonly mins: number; readonly long: boolean }) {
  return (
    <span className={cx("figure whitespace-nowrap", long ? "font-medium text-warn-ink" : "text-ink-3")}>
      {mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} u${mins % 60 === 0 ? "" : ` ${mins % 60}`}`}
    </span>
  )
}

/** A quiet section heading inside a pane or a side column. */
export function Heading({ children, id }: { readonly children: ReactNode; readonly id?: string }) {
  return <h2 id={id} className="text-xs font-medium text-ink-3">{children}</h2>
}

export { ME }

/**
 * List and detail side by side from `md`, one at a time below it. The kit's `Split` lets the list grow
 * to half the screen when nothing is open (it keeps `flex-1` on wide screens); here the list keeps
 * its width and the detail takes the rest. Candidate to fold back into `ui/page.tsx`.
 */
export function Panes({ list, detail, show, listWidth }: {
  readonly list: ReactNode
  readonly detail: ReactNode
  readonly show: "list" | "detail"
  readonly listWidth: string
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cx(
          "min-h-0 min-w-0 flex-col bg-panel md:flex md:flex-none md:basis-(--list)",
          show === "list" ? "flex flex-1" : "hidden"
        )}
        style={{ "--list": listWidth } as CSSProperties}
      >
        {list}
      </div>
      <div className={cx("min-h-0 min-w-0 flex-1 flex-col md:flex", show === "detail" ? "flex" : "hidden")}>
        {detail}
      </div>
    </div>
  )
}
