import { Fragment, useEffect, useId, useState } from "react"
import type { ReactNode } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import { CONVERSATIONS, GUESTS, ticket, TICKET_STATUS } from "../../fixtures/inbox.ts"
import type { ChatMessage, ChatRef, Conversation } from "../../fixtures/inbox.ts"
import { customer, euro, order, ORDER_STATUS, product, supplier } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { AgentAvatar, Avatar, AvatarStack } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu } from "../../ui/dropdown.tsx"
import {
  ArrowUpRight,
  Bot,
  ChevronLeft,
  CreditCard,
  Factory,
  Hash,
  MessageSquare,
  Package,
  Pin,
  Plus,
  Reply,
  Send,
  Smile,
  Ticket as TicketGlyph,
  User,
  X
} from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"

import { Popover } from "../../ui/popover.tsx"
import { Skeleton, SkeletonRow } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { ActionCard, COMMANDS, parseCommand, readBack, runAction, startState } from "./commands.tsx"
import { Heading, Mentioned, MY_KEY, Panes } from "./parts.tsx"
import { customerName } from "./record.tsx"
import { markChatRead, nowClock, postChat, postReply, ticketsOf, unpostChat, useInboxState } from "./store.ts"

/** Unread team-chat messages after what was opened this visit: the menu's Teamchat count. */
export function useTeamChatUnread(): number {
  const s = useInboxState()
  return CONVERSATIONS.filter((c) => !s.readChats.includes(c.id)).reduce((n, c) => n + c.unread, 0)
}

const REACTIONS = ["👍", "👀", "✅", "🙏"] as const

/**
 * Teamchat: where the team talks about the work, with the work in it. A message carries the records
 * it is about (a ticket, an order, the chargeback), and the column beside it holds whatever the
 * conversation is about right now: a thread under a message, or the record itself, so nobody leaves
 * the chat to look something up. The current demo's `/chats`, on this team and this Monday.
 */
export function TeamChatScreen() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("support")
  const kanaal = useQuery("kanaal")
  const active = CONVERSATIONS.find((c) => c.id === kanaal)

  if (!access.view) {
    return (
      <div className="pane-scroll flex-1">
        <h1 className="sr-only">Teamchat</h1>
        <Denied area="support" what="de teamchat" />
      </div>
    )
  }

  const list = (
    <nav aria-label="Gesprekken" className="pane-scroll flex min-h-0 flex-1 flex-col gap-5 px-2 py-3">
      {active === undefined && <h1 className="px-2 text-md font-semibold text-ink">Teamchat</h1>}
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Gesprekken laden" className="flex flex-col gap-1 px-2">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5 w-4/5" />)}
          </div>
        )
        : state === "error"
        ? null
        : (
          <>
            <ConversationGroup
              title="Kanalen"
              items={CONVERSATIONS.filter((c) => c.kind === "kanaal")}
              activeId={kanaal}
              empty={state === "empty"}
            />
            {state !== "empty" && (
              <ConversationGroup
                title="Privéberichten"
                items={CONVERSATIONS.filter((c) => c.kind === "prive")}
                activeId={kanaal}
                empty={false}
              />
            )}
          </>
        )}
    </nav>
  )

  const detail = state === "error"
    ? (
      <ErrorState
        title="De teamchat kwam niet binnen"
        detail="WS /chat · 1006 · verbinding verbroken"
        action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
      >
        Berichten die je nu schrijft, gaan pas weg als de verbinding terug is.
      </ErrorState>
    )
    : state === "loading"
    ? (
      <div aria-busy="true" aria-label="Berichten laden" className="flex flex-col gap-3 px-8 pt-8">
        {Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
      </div>
    )
    : state === "empty"
    ? (
      <EmptyState
        glyph={MessageSquare}
        title="Het is hier nog stil"
        action={<ButtonLink to={paths.settings("team")} variant="primary">Collega uitnodigen</ButtonLink>}
      >
        #algemeen staat klaar. Nodig je team uit en praat hier over tickets, bestellingen en leveranciers, met de
        records erbij.
      </EmptyState>
    )
    : active === undefined
    ? <ChatOverview />
    : <ConversationView key={active.id} c={active} edit={access.edit} />

  return <Panes list={list} detail={detail} show={active === undefined ? "list" : "detail"} listWidth="15rem" />
}

function ConversationGroup({ title, items, activeId, empty }: {
  readonly title: string
  readonly items: ReadonlyArray<Conversation>
  readonly activeId: string | null
  readonly empty: boolean
}) {
  const s = useInboxState()
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <Heading>
        <span className="px-2">{title}</span>
      </Heading>
      <ul className="flex flex-col gap-px pt-1">
        {(empty ? [{ id: "algemeen", kind: "kanaal" as const, name: "algemeen", unread: 0 }] : items).map((c) => {
          const unread = s.readChats.includes(c.id) ? 0 : c.unread
          const current = c.id === activeId
          return (
            <li key={c.id}>
              <Link
                to={`${paths.teamChat}?kanaal=${c.id}`}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "flex h-8 items-center gap-2 rounded-sm px-2 text-sm pointer-coarse:h-11",
                  current ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                  unread > 0 && !current && "font-semibold text-ink"
                )}
              >
                {c.kind === "kanaal"
                  ? <Hash size={15} className="shrink-0 text-ink-3" />
                  : <Avatar name={c.name} size={18} on="panel" />}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {unread > 0 && <span className="figure text-2xs text-ink-3">{unread}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** With no conversation open on a wide screen: where you were mentioned and what is new. */
function ChatOverview() {
  const unread = CONVERSATIONS.filter((c) => c.unread > 0)
  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-10">
        <h2 className="text-xl font-semibold text-ink">Nieuw sinds je laatste bezoek</h2>
        <ul className="flex flex-col gap-1">
          {unread.map((c) => {
            const last = c.messages.at(-1)
            return (
              <li key={c.id}>
                <Link
                  to={`${paths.teamChat}?kanaal=${c.id}`}
                  className="flex flex-col gap-0.5 rounded-md px-3 py-2.5 hover:bg-hover"
                >
                  <span className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                    #{c.name}
                    <span className="figure text-xs font-normal text-ink-3">{c.unread} nieuw</span>
                  </span>
                  {last !== undefined && (
                    <span className="truncate text-sm text-ink-2">
                      {senderName(last.from)}: {last.text.replaceAll("**", "")}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/* ── one conversation ─────────────────────────────────────────────────────────────────────────── */

const senderName = (from: ChatMessage["from"]) =>
  from.kind === "person"
    ? PEOPLE[from.who].name
    : from.kind === "guest"
    ? GUESTS[from.who].name
    : AGENTS.find((a) => a.id === from.agentId)?.name ?? "Agent"

function Sender({ from, size = 28 }: { readonly from: ChatMessage["from"]; readonly size?: number }) {
  if (from.kind === "agent") {
    return <AgentAvatar glyph={AGENTS.find((a) => a.id === from.agentId)?.glyph ?? Bot} size={size} />
  }
  return <Avatar name={senderName(from)} size={size} />
}

/** `**bold**` and `@Naam`, as the team writes. */
function ChatText({ text }: { readonly text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-ink">{part}</strong>
          : (
            <Fragment key={i}>
              <Mentioned text={part} />
            </Fragment>
          )
      )}
    </>
  )
}

const refKey = (r: ChatRef) => `${r.kind}:${r.id}`

function refLabel(r: ChatRef): string {
  switch (r.kind) {
    case "ticket":
      return `Ticket #${r.id}`
    case "order":
      return `Bestelling #${r.id}`
    case "customer":
      return customer(r.id)?.name ?? r.id
    case "chargeback":
      return `Chargeback ${r.id}`
    case "product":
      return product(r.id)?.name ?? r.id
    case "supplier":
      return supplier(r.id)?.name ?? r.id
  }
}

const REF_GLYPH = {
  ticket: TicketGlyph,
  order: Package,
  customer: User,
  chargeback: CreditCard,
  product: Package,
  supplier: Factory
} as const

/** What "+" can attach to a message: the records this Monday is about. */
const ATTACHABLE: ReadonlyArray<ChatRef> = [
  { kind: "ticket", id: "5141" },
  { kind: "ticket", id: "5142" },
  { kind: "order", id: "5309" },
  { kind: "chargeback", id: "CB-2291" },
  { kind: "supplier", id: "kestrel-goods" },
  { kind: "product", id: "aurora-hooded-fleece" }
]

function parseRef(value: string | null): ChatRef | null {
  if (value === null) return null
  const [kind, ...rest] = value.split(":")
  const id = rest.join(":")
  if (id === "") return null
  if (
    kind === "ticket" || kind === "order" || kind === "customer" || kind === "chargeback" || kind === "product" ||
    kind === "supplier"
  ) {
    return { kind, id }
  }
  return null
}

function ConversationView({ c, edit }: { readonly c: Conversation; readonly edit: boolean }) {
  const s = useInboxState()
  const draad = useQuery("draad")
  const record = parseRef(useQuery("record"))
  const [reacted, setReacted] = useState<Readonly<Record<string, ReadonlyArray<string>>>>({})
  const messages = [...c.messages, ...(s.chat[c.id] ?? [])]
  const parent = messages.find((m) => m.id === draad)
  const pinned = messages.filter((m) => m.pinned === true)
  const name = c.kind === "kanaal" ? `#${c.name}` : c.name

  useEffect(() => markChatRead(c.id), [c.id])

  const send = (text: string, refs: ReadonlyArray<ChatRef>) => {
    const id = `eigen-${Date.now()}`
    const command = parseCommand(text)
    if (command !== null) {
      if (!command.ok) return
      postChat(c.id, { id, from: { kind: "person", who: MY_KEY }, at: nowClock(), text, action: command.action })
      const first = startState(command.action)
      if (first.state === "bezig") runAction(id, command.action)
      return
    }
    postChat(c.id, { id, from: { kind: "person", who: MY_KEY }, at: nowClock(), text, refs })
    toast({ title: `Verstuurd in ${name}`, action: { label: "Ongedaan maken", onClick: () => unpostChat(c.id, id) } })
  }
  const react = (messageId: string, emoji: string) =>
    setReacted((r) => {
      const mine = r[messageId] ?? []
      return { ...r, [messageId]: mine.includes(emoji) ? mine.filter((e) => e !== emoji) : [...mine, emoji] }
    })

  const side = parent !== undefined
    ? (
      <ThreadPanel
        parent={parent}
        replies={[...(parent.replies ?? []), ...(s.replies[parent.id] ?? [])]}
        channel={name}
        edit={edit}
        onClose={() => setQuery({ draad: null })}
      />
    )
    : record !== null
    ? <RecordPanel refTo={record} onClose={() => setQuery({ record: null })} />
    : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2 sm:px-6">
          <Link
            to={paths.teamChat}
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-hover md:hidden pointer-coarse:size-11"
            aria-label="Terug naar de gesprekken"
          >
            <ChevronLeft size={16} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-md font-semibold text-ink">{name}</h1>
            <p className="truncate text-xs text-ink-3">
              {c.topic}
              {c.kind === "kanaal" && ` · ${c.members.length} leden`}
            </p>
          </div>
          <AvatarStack
            names={c.members.map((m) => (m.kind === "person" ? PEOPLE[m.who].name : GUESTS[m.who].name))}
            size={22}
          />
          {pinned.length > 0 && (
            <Popover
              label="Vastgezette berichten"
              placement="bottom-end"
              width="w-80"
              trigger={(props) => (
                <IconButton
                  label={`Vastgezette berichten (${pinned.length})`}
                  className="pointer-coarse:size-11"
                  {...props}
                >
                  <Pin />
                </IconButton>
              )}
            >
              <div className="flex flex-col gap-3 p-3">
                <Heading>Vastgezet</Heading>
                {pinned.map((m) => (
                  <p key={m.id} className="text-sm text-ink-2">
                    <span className="font-medium text-ink">{senderName(m.from)}</span> <ChatText text={m.text} />
                  </p>
                ))}
              </div>
            </Popover>
          )}
        </header>

        <div className="pane-scroll min-h-0 flex-1">
          <ol aria-label={`Berichten in ${name}`} className="flex flex-col gap-5 px-4 pt-3 pb-6 sm:px-6">
            {messages.map((m, i) => {
              const day = m.at.includes(":") ? "Vandaag" : m.at
              const prevDay = i === 0 ? null : (messages[i - 1]?.at.includes(":") ? "Vandaag" : messages[i - 1]?.at)
              const replies = [...(m.replies ?? []), ...(s.replies[m.id] ?? [])]
              return (
                <Fragment key={m.id}>
                  {day !== prevDay && (
                    <li aria-hidden="true" className="pt-1 text-2xs font-medium text-ink-3">{day}</li>
                  )}
                  <MessageRow
                    m={m}
                    actionState={m.action === undefined ? undefined : s.actions[m.id] ?? startState(m.action)}
                    mine={reacted[m.id] ?? []}
                    replies={replies.length}
                    lastReply={replies.at(-1)?.at}
                    active={m.id === draad}
                    edit={edit}
                    onReact={(emoji) => react(m.id, emoji)}
                    onThread={() => setQuery({ draad: m.id, record: null })}
                    onRecord={(r) => setQuery({ record: refKey(r), draad: null })}
                  />
                </Fragment>
              )
            })}
          </ol>
        </div>

        <div className="shrink-0 px-4 pb-4 sm:px-6">
          {edit
            ? <ChatComposer placeholder={`Bericht aan ${name}, of / voor een opdracht`} onSend={send} commands />
            : <ReadOnlyNotice area="support" />}
        </div>
      </div>

      {side !== null && (
        <aside aria-label="Zijkolom" className="pane-scroll hidden w-80 shrink-0 bg-panel xl:block">{side}</aside>
      )}
      <div className="xl:hidden">
        <Sheet
          open={side !== null}
          onClose={() => setQuery({ draad: null, record: null })}
          title={parent !== undefined ? "Draad" : record === null ? "" : refLabel(record)}
        >
          {side}
        </Sheet>
      </div>
    </div>
  )
}

function MessageRow({ m, actionState, mine, replies, lastReply, active, edit, onReact, onThread, onRecord }: {
  readonly m: ChatMessage
  readonly actionState: ReturnType<typeof startState> | undefined
  readonly mine: ReadonlyArray<string>
  readonly replies: number
  readonly lastReply?: string
  readonly active: boolean
  readonly edit: boolean
  readonly onReact: (emoji: string) => void
  readonly onThread: () => void
  readonly onRecord: (r: ChatRef) => void
}) {
  const reactions = [
    ...(m.reactions ?? []).map((r) => {
      const on = (r.mine === true) !== mine.includes(r.emoji)
      return { emoji: r.emoji, count: r.count - (r.mine === true ? 1 : 0) + (on ? 1 : 0), on }
    }),
    ...mine.filter((e) => !(m.reactions ?? []).some((r) => r.emoji === e)).map((e) => ({
      emoji: e,
      count: 1,
      on: true
    }))
  ].filter((r) => r.count > 0)
  return (
    <li
      className={cx(
        "group relative -mx-2 grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 rounded-md px-2 py-1.5",
        active ? "bg-selected" : "hover:bg-hover/60"
      )}
    >
      <span className="pt-0.5">
        <Sender from={m.from} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-ink">{senderName(m.from)}</span>
          {m.from.kind === "agent" && <span className="text-xs text-ink-3">agent</span>}
          {m.from.kind === "guest" && <span className="text-xs text-ink-3">{GUESTS[m.from.who].role}</span>}
          <span className="figure text-2xs text-ink-3">{m.at}</span>
          {m.pinned === true && (
            <span className="inline-flex items-center gap-1 text-2xs text-ink-3">
              <Pin size={11} />
              vastgezet
            </span>
          )}
        </p>
        {m.action === undefined || m.from.kind === "agent"
          ? (
            <p className="max-w-[68ch] text-sm leading-6 text-pretty text-ink">
              <ChatText text={m.text} />
            </p>
          )
          : <p className="text-sm text-ink-3">{m.text}</p>}
        {m.action !== undefined && actionState !== undefined && (
          <ActionCard messageId={m.id} action={m.action} state={actionState} edit={edit} />
        )}
        {m.refs !== undefined && m.refs.length > 0 && (
          <ul aria-label="Records" className="flex flex-wrap gap-1.5">
            {m.refs.map((r) => {
              const G = REF_GLYPH[r.kind]
              return (
                <li key={refKey(r)}>
                  <button
                    type="button"
                    onClick={() => onRecord(r)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-well px-2 text-xs text-ink-2 hover:bg-selected hover:text-ink pointer-coarse:h-11"
                  >
                    <G size={13} className="text-ink-3" />
                    {refLabel(r)}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {(reactions.length > 0 || replies > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={r.on}
                aria-label={`${r.emoji} ${r.count}`}
                disabled={!edit}
                onClick={() => onReact(r.emoji)}
                className={cx(
                  "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs pointer-coarse:h-9",
                  r.on ? "bg-accent-tint text-accent-ink" : "bg-well text-ink-2 hover:bg-selected"
                )}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="figure">{r.count}</span>
              </button>
            ))}
            {replies > 0 && (
              <button
                type="button"
                onClick={onThread}
                className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-accent-ink hover:bg-accent-tint pointer-coarse:h-9"
              >
                <span className="figure">{replies}</span> {replies === 1 ? "antwoord" : "antwoorden"}
                {lastReply !== undefined && (
                  <span className="figure font-normal text-ink-3">· laatste {lastReply}</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      {edit && (
        <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-sm bg-canvas p-0.5 shadow-pop ring-1 ring-line group-hover:flex group-focus-within:flex">
          <DropdownMenu
            label="Reageren met"
            placement="bottom-end"
            width="w-auto"
            trigger={(props) => (
              <IconButton label="Reageren met een emoji" size="sm" {...props}>
                <Smile />
              </IconButton>
            )}
          >
            <div className="flex gap-0.5">
              {REACTIONS.map((e) => (
                <DropdownItem
                  key={e}
                  onSelect={() => onReact(e)}
                >
                  <span aria-label={`Reageren met ${e}`}>{e}</span>
                </DropdownItem>
              ))}
            </div>
          </DropdownMenu>
          <IconButton label="Antwoorden in een draad" size="sm" onClick={onThread}>
            <Reply />
          </IconButton>
        </div>
      )}
    </li>
  )
}

/** A person writing to the team: a plain field (no Magnus gradient), a record to attach, Enter sends. */
function ChatComposer({ placeholder, onSend, compact = false, commands = false }: {
  readonly placeholder: string
  /** In the narrow side column: no keyboard hint. */
  readonly compact?: boolean
  /** Whether `/` runs a command here (the conversation, not a thread). */
  readonly commands?: boolean
  readonly onSend: (text: string, refs: ReadonlyArray<ChatRef>) => void
}) {
  const [text, setText] = useState("")
  const [refs, setRefs] = useState<ReadonlyArray<ChatRef>>([])
  const id = useId()
  const back = commands ? readBack(text) : null
  const word = commands ? /^\/(\p{L}*)$/u.exec(text)?.[1] : undefined
  const offered = word === undefined ? [] : COMMANDS.filter((c) => c.id.startsWith(word.toLowerCase()))
  const send = () => {
    if (text.trim() === "" || back?.tone === "warn") return
    onSend(text.trim(), refs)
    setText("")
    setRefs([])
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-canvas p-2.5 ring-1 ring-line-strong ring-inset focus-within:ring-ink-4">
      {refs.length > 0 && (
        <ul aria-label="Records bij dit bericht" className="flex flex-wrap gap-1.5">
          {refs.map((r) => (
            <li
              key={refKey(r)}
              className="inline-flex h-6 items-center gap-1 rounded-xs bg-well pr-1 pl-2 text-xs text-ink-2"
            >
              {refLabel(r)}
              <button
                type="button"
                aria-label={`${refLabel(r)} weghalen`}
                onClick={() => setRefs(refs.filter((x) => refKey(x) !== refKey(r)))}
                className="rounded-xs p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {offered.length > 0 && (
        <ul aria-label="Opdrachten" className="flex flex-wrap gap-1">
          {offered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setText(`/${c.id} `)}
                className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-well px-2 text-xs text-ink-2 hover:bg-selected hover:text-ink pointer-coarse:h-11"
              >
                <span className="font-medium text-ink">/{c.id}</span>
                <span className="text-ink-3">
                  {c.on.length === 0 ? c.arg : `#nummer${c.arg === undefined ? "" : ` ${c.arg}`}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <textarea
        id={id}
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            send()
          }
        }}
        className="min-h-6 w-full resize-none bg-transparent px-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-3"
      />
      {back !== null && offered.length === 0 && (
        <p
          role="status"
          className={cx("px-1 text-xs text-pretty", back.tone === "warn" ? "text-warn-ink" : "text-ink-2")}
        >
          {back.text}
        </p>
      )}
      <div className="flex items-center gap-1">
        <DropdownMenu
          label="Record toevoegen"
          placement="top"
          width="w-64"
          trigger={(props) => (
            <IconButton label="Record toevoegen" size="sm" className="pointer-coarse:size-11" {...props}>
              <Plus />
            </IconButton>
          )}
        >
          <DropdownLabel>Record bij het bericht</DropdownLabel>
          {ATTACHABLE.map((r) => (
            <DropdownItem
              key={refKey(r)}
              glyph={REF_GLYPH[r.kind]}
              disabled={refs.some((x) => refKey(x) === refKey(r))}
              onSelect={() =>
                setRefs([...refs, r])}
            >
              {refLabel(r)}
            </DropdownItem>
          ))}
        </DropdownMenu>
        <span className="ml-auto text-2xs text-ink-3 max-sm:hidden">
          {compact ? null : "Enter verstuurt, Shift+Enter is een nieuwe regel"}
        </span>
        <IconButton
          label="Versturen"
          size="sm"
          disabled={text.trim() === "" || back?.tone === "warn"}
          onClick={send}
          className="ml-2 bg-ink text-on-ink hover:bg-ink/88 hover:text-on-ink pointer-coarse:size-11"
        >
          <Send />
        </IconButton>
      </div>
    </div>
  )
}

/* ── the side column ──────────────────────────────────────────────────────────────────────────── */

function PanelHead(
  { title, sub, onClose }: { readonly title: string; readonly sub?: string; readonly onClose: () => void }
) {
  return (
    <header className="hidden items-start justify-between gap-2 px-5 pt-4 pb-2 xl:flex">
      <div className="flex min-w-0 flex-col">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {sub !== undefined && <p className="truncate text-xs text-ink-3">{sub}</p>}
      </div>
      <IconButton label="Sluiten" size="sm" onClick={onClose}>
        <X />
      </IconButton>
    </header>
  )
}

function ThreadPanel({ parent, replies, channel, edit, onClose }: {
  readonly parent: ChatMessage
  readonly replies: ReadonlyArray<Omit<ChatMessage, "replies">>
  readonly channel: string
  readonly edit: boolean
  readonly onClose: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHead title="Draad" sub={channel} onClose={onClose} />
      <ol className="flex flex-1 flex-col gap-4 px-5 py-3 xl:pane-scroll">
        {[parent, ...replies].map((m, i) => (
          <li key={m.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
            <Sender from={m.from} size={24} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-ink">{senderName(m.from)}</span>
                <span className="figure text-2xs text-ink-3">{m.at}</span>
              </p>
              <p className="text-sm leading-6 text-pretty text-ink">
                <ChatText text={m.text} />
              </p>
              {i === 0 && replies.length > 0 && (
                <p className="pt-1 text-2xs text-ink-3">
                  <span className="figure">{replies.length}</span> {replies.length === 1 ? "antwoord" : "antwoorden"}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {edit && (
        <div className="px-4 pb-4">
          <ChatComposer
            placeholder="Antwoorden in de draad"
            compact
            onSend={(text, refs) => {
              postReply(parent.id, {
                id: `draad-${Date.now()}`,
                from: { kind: "person", who: MY_KEY },
                at: nowClock(),
                text,
                refs
              })
              toast({ title: "Geantwoord in de draad" })
            }}
          />
        </div>
      )}
    </div>
  )
}

function OpenLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return (
    <ButtonLink to={to} size="sm" icon={<ArrowUpRight />} className="self-start">
      {children}
    </ButtonLink>
  )
}

/** The record a message is about, in the column beside the chat: its facts and the way to its page. */
function RecordPanel({ refTo, onClose }: { readonly refTo: ChatRef; readonly onClose: () => void }) {
  const s = useInboxState()
  let body: ReactNode = <p className="text-sm text-ink-3">Dit record bestaat niet meer.</p>
  if (refTo.kind === "ticket") {
    const t = ticket(refTo.id, ticketsOf(s, false))
    if (t !== undefined) {
      body = (
        <>
          <p className="text-sm font-medium text-ink">{t.subject}</p>
          <KeyValue
            items={[
              { label: "Klant", value: customerName(t) },
              {
                label: "Status",
                value: <Status tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Status>
              },
              { label: "Toegewezen aan", value: t.assignee === null ? "Niemand" : PEOPLE[t.assignee].name },
              ...(t.order === undefined ? [] : [{ label: "Bestelling", value: `#${t.order}`, figure: true }])
            ]}
          />
          <OpenLink to={paths.ticket(t.number)}>Ticket openen</OpenLink>
        </>
      )
    }
  } else if (refTo.kind === "order") {
    const o = order(refTo.id)
    if (o !== undefined) {
      body = (
        <>
          <KeyValue
            items={[
              { label: "Klant", value: customer(o.customerId)?.name ?? o.customerId },
              {
                label: "Status",
                value: <Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>
              },
              { label: "Totaal", value: euro(o.total), figure: true },
              { label: "Vervoerder", value: o.carrier },
              {
                label: "Artikelen",
                value: o.lines.map((l) => `${product(l.productId)?.name ?? l.productId} · ${l.size}`).join(", ")
              }
            ]}
          />
          <OpenLink to={paths.order(o.number)}>Bestelling openen</OpenLink>
        </>
      )
    }
  } else if (refTo.kind === "customer") {
    const c = customer(refTo.id)
    if (c !== undefined) {
      body = (
        <>
          <KeyValue
            items={[
              { label: "E-mail", value: c.email },
              { label: "Woont in", value: c.city },
              { label: "Bestellingen", value: c.ordersCount, figure: true },
              { label: "Totaal besteed", value: euro(c.lifetimeValue), figure: true }
            ]}
          />
          <OpenLink to={paths.customer(c.id)}>Klant openen</OpenLink>
        </>
      )
    }
  } else if (refTo.kind === "chargeback") {
    body = (
      <>
        <KeyValue
          items={[
            { label: "Via", value: "Klarna" },
            { label: "Bedrag", value: "€ 129,00", figure: true },
            { label: "Bestelling", value: "#5318 · Coastline Bomber Jacket", figure: true },
            { label: "Klant", value: "Felix Muller" },
            { label: "Antwoord vóór", value: "morgen 12:00", figure: true },
            { label: "Bewijspakket", value: "Opgesteld door de Chargeback-assistent; indienen wacht op een collega" }
          ]}
        />
        <OpenLink to={paths.chargeback(refTo.id)}>Chargeback openen</OpenLink>
      </>
    )
  } else if (refTo.kind === "product") {
    const p = product(refTo.id)
    if (p !== undefined) {
      body = (
        <>
          <KeyValue
            items={[
              { label: "Prijs", value: euro(p.price), figure: true },
              { label: "Leverancier", value: supplier(p.supplierId)?.name ?? p.supplierId },
              { label: "Voorraad", value: p.stock, figure: true }
            ]}
          />
          <OpenLink to={paths.product(p.id)}>Product openen</OpenLink>
        </>
      )
    }
  } else {
    const sup = supplier(refTo.id)
    if (sup !== undefined) {
      body = (
        <>
          <KeyValue
            items={[
              { label: "Levertijd", value: `${sup.leadDays.toLocaleString("nl-NL")} dagen`, figure: true },
              { label: "Belofte", value: `${sup.promiseDays} dagen`, figure: true },
              { label: "Land", value: sup.country }
            ]}
          />
          <OpenLink to={paths.supplier(sup.id)}>Leverancier openen</OpenLink>
        </>
      )
    }
  }
  return (
    <div className="flex flex-col">
      <PanelHead title={refLabel(refTo)} onClose={onClose} />
      <div className="flex flex-col gap-3 px-5 py-3">{body}</div>
    </div>
  )
}
