import { Fragment, useId, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import {
  channelLabel,
  channelService,
  entryTime,
  fillTemplate,
  PRIORITY,
  replyWindow,
  STATUS_ORDER,
  TICKET_STATUS,
  WHATSAPP_TEMPLATES
} from "../../fixtures/inbox.ts"
import type { Channel, Entry, PersonKey, Priority, Ticket, TicketStatus } from "../../fixtures/inbox.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { AgentAvatar, Avatar, AvatarStack } from "../../ui/avatar.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Bot,
  ChevronDown,
  Clock,
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
import { hasLogo, ServiceLogo } from "../../ui/service-logo.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dropEntries, nowClock, patchTicket } from "./store.ts"

/** The signed-in person's key in `PEOPLE`. */
export const MY_KEY: PersonKey = "elena"

const firstName = (who: PersonKey) => PEOPLE[who].name.split(" ")[0] ?? PEOPLE[who].name

/* ── channels ──────────────────────────────────────────────────────────────────────────────────── */

const CHANNEL_GLYPH = { email: Mail, whatsapp: Smartphone, instagram: Image, winkelchat: MessageSquare } as const

/**
 * A channel as its service's logo (the mailbox's Gmail, WhatsApp, Instagram), or for the store chat,
 * which is Insyte's own, a quiet glyph; named for assistive tech and on hover. Bare in a line of
 * text; `tile` puts the logo on its tile, as a list row's lead.
 */
export function ChannelGlyph({ channel, size = 14, tile = false, className }: {
  readonly channel: Channel
  readonly size?: number
  readonly tile?: boolean
  readonly className?: string
}) {
  const label = `Via ${channelLabel(channel)}`
  const service = channelService(channel)
  if (service !== undefined && hasLogo(service)) {
    return (
      <span role="img" aria-label={label} title={label} className={cx("inline-flex shrink-0", className)}>
        <ServiceLogo service={service} name={label} size={size} bare={!tile} />
      </span>
    )
  }
  const G = CHANNEL_GLYPH[channel]
  return (
    <span title={label} className={cx("inline-flex shrink-0 text-ink-3", className)}>
      <G size={tile ? Math.round(size * 0.67) : size} aria-label={label} />
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

/** Everyone who has the ticket: the one it is assigned to first, then the colleagues with it. */
export const assigneesOf = (t: Ticket): ReadonlyArray<PersonKey> =>
  t.assignee === null ? [] : [t.assignee, ...(t.with ?? []).filter((k) => k !== t.assignee)]

/** Put a colleague on the ticket or take them off; the first one left is the one it is assigned to. */
function toggleAssignee(t: Ticket, who: PersonKey) {
  const now = assigneesOf(t)
  const on = !now.includes(who)
  const next = on ? [...now, who] : now.filter((k) => k !== who)
  const before = { assignee: t.assignee, with: t.with ?? [] }
  patchTicket(t.number, { assignee: next[0] ?? null, with: next.slice(1) })
  const name = who === MY_KEY ? "jou" : PEOPLE[who].name
  toast({
    title: on
      ? `#${t.number} ook toegewezen aan ${name}`
      : `${who === MY_KEY ? "Jij bent" : `${PEOPLE[who].name} is`} niet meer toegewezen aan #${t.number}`,
    action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, before) }
  })
}

function unassign(t: Ticket) {
  const before = { assignee: t.assignee, with: t.with ?? [] }
  patchTicket(t.number, { assignee: null, with: [] })
  toast({
    title: `Toewijzing van #${t.number} weggehaald`,
    action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, before) }
  })
}

function setPriority(t: Ticket, next: Priority) {
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
  const who = assigneesOf(t)
  const lead = who[0]
  const label = lead === undefined
    ? "Niet toegewezen"
    : who.length > 1
    ? `${lead === MY_KEY ? "Jij" : firstName(lead)} en ${
      who.length - 1 === 1 ? firstName(who[1] ?? lead) : `${who.length - 1} anderen`
    }`
    : lead === MY_KEY
    ? "Jij"
    : firstName(lead)
  return (
    <DropdownMenu
      label="Toewijzen"
      width="w-60"
      trigger={(props) => (
        <button type="button" disabled={disabled} className={triggerClass} {...props}>
          {lead === undefined
            ? <UserX size={15} className="text-ink-3" />
            : <AvatarStack names={who.map((k) => PEOPLE[k].name)} size={20} />}
          <span className={cx(compact && "sr-only sm:not-sr-only")}>{label}</span>
          <ChevronDown size={13} className="text-ink-3" />
          <span className="sr-only">Toewijzen</span>
        </button>
      )}
    >
      <DropdownLabel>Toegewezen aan</DropdownLabel>
      {(Object.keys(PEOPLE) as ReadonlyArray<PersonKey>).map((key) => (
        <DropdownItem
          key={key}
          checked={who.includes(key)}
          onSelect={() => toggleAssignee(t, key)}
        >
          {PEOPLE[key].name}
          {key === MY_KEY ? " (jij)" : ""}
        </DropdownItem>
      ))}
      <DropdownSeparator />
      <DropdownItem glyph={UserX} disabled={lead === undefined} onSelect={() => unassign(t)}>
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

const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? "Agent"

/** One line of a ticket's conversation, in the order it happened. */
export function EntryView({ entry, customer }: { readonly entry: Entry; readonly customer: string }) {
  if (entry.kind === "event") {
    return (
      <li className="flex items-start gap-2 pl-10 text-xs text-ink-3">
        <span className="figure shrink-0">{entryTime(entry)}</span>
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
          {entry.kind === "team" && (
            <span className="text-xs text-ink-3">
              {entry.template === undefined ? "antwoordde" : `stuurde sjabloon ${entry.template}`}
            </span>
          )}
          {entry.kind === "agent" && <span className="text-xs text-ink-3">agent</span>}
          {note && (
            <span className="inline-flex items-center gap-1 text-xs text-warn-ink">
              <Lock size={12} />
              Interne notitie
            </span>
          )}
          <span className="figure text-2xs text-ink-3">{entryTime(entry)}</span>
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
 * beside it, as every send in the product does. On WhatsApp and Instagram a free reply may only go
 * out within 24 hours of the customer's last message: after that WhatsApp takes an approved template
 * and Instagram nothing until the customer writes again. Not Magnus's composer: no gradient, this is
 * a person writing to a person.
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
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const [seen, setSeen] = useState<string | undefined>(undefined)
  if (prefill !== undefined && prefill !== seen) {
    setSeen(prefill)
    setText(prefill)
    setMode("antwoord")
    onPrefillUsed?.()
  }

  const first = customer.split(" ")[0] ?? customer
  const win = replyWindow(t)
  const can = win.applies ? win.can : "vrij"
  const reply = mode === "antwoord"
  const template = can === "sjabloon" ? WHATSAPP_TEMPLATES.find((x) => x.id === templateId) : undefined
  const filled = template === undefined
    ? ""
    : fillTemplate(template.body, {
      naam: first,
      onderwerp: t.subject,
      ...(t.order === undefined ? {} : { bestelling: t.order })
    })
  const value = reply && can === "sjabloon" ? filled : reply && can === "niets" ? "" : text

  const mention = /(^|\s)@(\p{L}*)$/u.exec(text)
  const matches = mention === null
    ? []
    : MENTIONABLE.filter((k) => PEOPLE[k].name.toLowerCase().startsWith((mention[2] ?? "").toLowerCase()))

  const pick = (who: PersonKey) => {
    setText((current) => current.replace(/@(\p{L}*)$/u, `@${firstName(who)} `))
    area.current?.focus()
  }

  const send = () => {
    const body = value.trim()
    if (body === "") return
    if (reply) {
      patchTicket(t.number, {
        entries: [{
          kind: "team",
          who: MY_KEY,
          at: nowClock(),
          text: body,
          ...(template === undefined ? {} : { template: template.label })
        }],
        answered: true,
        unread: false,
        ...(t.status === "nieuw" ? { status: "bezig" as const } : {})
      })
      const before = { status: t.status, waitingSince: t.waitingSince }
      const typed = text
      toast({
        title: `Wordt over ${SEND_WINDOW_S} s verstuurd`,
        body: template === undefined
          ? `Via ${channelLabel(t.channel)} aan ${customer}.`
          : `Sjabloon ${template.label} via WhatsApp aan ${customer}.`,
        duration: SEND_WINDOW_S * 1000,
        action: {
          label: "Niet versturen",
          onClick: () => {
            dropEntries(t.number, 1)
            patchTicket(t.number, { status: before.status, answered: before.waitingSince === undefined })
            setText(typed)
          }
        }
      })
      setTemplateId(undefined)
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
    <div className="flex flex-col gap-2">
      {reply && win.applies && <WindowLine t={t} hoursLeft={win.hoursLeft} can={can} />}
      <div
        className={cx(
          "flex flex-col gap-2 rounded-lg p-3 ring-1 ring-inset transition-colors",
          reply ? "bg-canvas ring-line-strong focus-within:ring-ink-4" : "bg-warn-tint ring-transparent"
        )}
      >
        <Tabs
          label="Soort bericht"
          variant="pill"
          value={mode}
          onChange={setMode}
          tabs={[
            { value: "antwoord", label: `Antwoord aan ${first}` },
            { value: "notitie", label: "Interne notitie" }
          ]}
        />
        {reply && can === "sjabloon" && (
          <div role="group" aria-label="Sjabloon" className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="mr-1 text-xs text-ink-3">Sjabloon</span>
            {WHATSAPP_TEMPLATES.map((x) => (
              <button
                key={x.id}
                type="button"
                disabled={!x.approved}
                aria-pressed={templateId === x.id}
                title={x.approved ? undefined : "Wacht nog op goedkeuring van Meta"}
                onClick={() => setTemplateId(templateId === x.id ? undefined : x.id)}
                className={cx(
                  "inline-flex h-7 items-center rounded-sm px-2 text-xs transition-colors pointer-coarse:h-11",
                  templateId === x.id
                    ? "bg-accent-tint font-medium text-accent-ink"
                    : "bg-well text-ink-2 hover:text-ink",
                  "disabled:pointer-events-none disabled:text-ink-4"
                )}
              >
                {x.label}
                {!x.approved && <span className="ml-1 text-ink-4">· wacht op Meta</span>}
              </button>
            ))}
          </div>
        )}
        <label htmlFor={id} className="sr-only">
          {reply ? `Antwoord aan ${customer}` : "Interne notitie"}
        </label>
        <textarea
          id={id}
          ref={area}
          rows={3}
          value={value}
          readOnly={reply && can === "sjabloon"}
          disabled={reply && can === "niets"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send()
          }}
          placeholder={!reply
            ? "Alleen het team ziet dit. Typ @ om een collega te noemen"
            : can === "niets"
            ? "Wacht tot de klant weer iets stuurt."
            : can === "sjabloon"
            ? "Kies een sjabloon; de tekst ligt vast."
            : `Schrijf ${first} via ${channelLabel(t.channel)}`}
          className="min-h-16 w-full resize-y bg-transparent px-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed read-only:text-ink-2"
        />
        {matches.length > 0 && !reply && (
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
            {reply ? `Wacht ${SEND_WINDOW_S} s voor hij vertrekt` : "Geen bericht naar de klant"}
          </p>
          <Button
            variant="primary"
            size="sm"
            icon={<Send />}
            disabled={value.trim() === ""}
            onClick={send}
            className="pointer-coarse:h-11"
          >
            {!reply ? "Notitie plaatsen" : template === undefined ? "Versturen" : "Sjabloon versturen"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Where the 24-hour window stands, above the reply on WhatsApp and Instagram. */
function WindowLine({ t, hoursLeft, can }: {
  readonly t: Ticket
  readonly hoursLeft: number
  readonly can: "vrij" | "sjabloon" | "niets"
}) {
  const whatsapp = t.channel === "whatsapp"
  if (can !== "vrij") {
    return (
      <p className="flex items-start gap-2 px-1 text-xs text-pretty text-warn-ink" role="status">
        <Clock size={14} className="mt-px shrink-0" />
        {whatsapp
          ? "Het venster van 24 uur is dicht. Je kunt alleen een goedgekeurd WhatsApp-sjabloon sturen."
          : "Het venster van 24 uur is dicht. Instagram laat je pas weer antwoorden als de klant iets stuurt."}
      </p>
    )
  }
  return (
    <p
      className={cx("flex items-start gap-2 px-1 text-xs text-pretty", hoursLeft < 6 ? "text-warn-ink" : "text-ink-3")}
    >
      <Clock size={14} className="mt-px shrink-0" />
      {hoursLeft === 0 ? "Nog minder dan een uur" : `Nog ${hoursLeft} uur`} om vrij te antwoorden; {whatsapp
        ? "daarna alleen een goedgekeurd sjabloon."
        : "daarna kun je pas weer antwoorden als de klant iets stuurt."}
    </p>
  )
}

/** A quiet section heading inside a pane or a side column. */
export function Heading({ children, id }: { readonly children: ReactNode; readonly id?: string }) {
  return <h2 id={id} className="text-xs font-medium text-ink-3">{children}</h2>
}

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
