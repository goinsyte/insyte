import { Link, useNavigate } from "@tanstack/react-router"
import { Fragment, type ReactNode, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import {
  Archive,
  ChevronLeft,
  Filter,
  MoreVertical,
  Reply,
  Search,
  Send,
  Sparkles,
  Star,
  Ticket,
  UserPlus,
  UserX
} from "../../icons"
import { InsyteMark } from "../ask/parts"
import { Field, FormDialog, TextAreaField, TextField } from "../common/form-dialog"
import { PageGuide } from "../common/page-guide"
import { CHANNEL_LABEL, CHAT_CHANNELS } from "../lib/channels"
import { initials } from "../lib/format"
import { personStyle } from "../lib/person-color"
import { cn } from "../lib/utils"
import { Arriving, Lines } from "../loading/bones"
import { useOnCreate } from "../stores/create-intent"
import { ChannelMark, MailboxMark } from "./channel-mark"
import {
  type Folder,
  type InboxMailbox,
  type InboxSource,
  type InboxThread,
  type LetterEntry,
  type Sent,
  useInboxSource
} from "./source"

/* ─────────────────────────────────────────────────────────────────────
   Inbox — the index on `glacier`, the letter on `paper`.

   Two things left this screen.

   · THE FOLDER RAIL. The page drew its own column of All inbox /
     Unassigned / Mine / Linked to ticket / Archive — directly beside the
     area panel, which draws the same five folders. Two navigations for one
     set of folders, disagreeing about the counts (10 against 5, 2 against
     4), because each counted its own way. The area panel is the app's
     navigation; the page now reads the `folder` it sets and shows one
     count, the one it can actually derive.

   · THE CARD FRAME. The whole screen sat inside a rounded panel floated on
     a 12px gutter, with the three columns separated by hairlines. The
     columns are different kinds of surface, so they are different surfaces:
     the list is the quieter `glacier` field, the letter is `paper`, and the
     composer is `mist` with the rest of the chrome. Nothing is ruled.

   The selected thread floods `abyss` — the same sentence the dashboard
   queue speaks for the row you are reading.

   What it reads and does comes from its host (`source.tsx`): the design app's stores, or the console's
   `Threads.*`. The chat channels, the customer agent and Insyte's drafts are the host's to add.
   ───────────────────────────────────────────────────────────────────── */

const GUIDE = [
  {
    title: "Alles op één plek",
    body:
      "Je support-mailbox, Gmail of Outlook. Insyte leest mee, deelt in naar soort en koppelt aan de bestelling of het ticket.",
    art: "chat"
  },
  {
    title: "WhatsApp en Instagram",
    body: "Antwoorden kan binnen het venster van 24 uur. Daarna op WhatsApp alleen met een goedgekeurd sjabloon.",
    art: "hours"
  },
  {
    title: "Websitechat",
    body:
      "De klantagent kan er zelf antwoorden, binnen jouw regels. Wat hij overdraagt, neem je over of geef je terug.",
    art: "handover"
  }
] as const

const FOLDERS = {
  all: "Alle berichten",
  unassigned: "Niet toegewezen",
  mine: "Van mij",
  linked: "Gekoppeld aan ticket",
  archive: "Archief",
  trash: "Prullenbak",
  spam: "Spam"
} as const satisfies Record<Folder, string>

type ThreadFilter = "unread" | "starred" | "attachments" | "customer"
const FILTERS: Array<{ id: ThreadFilter; label: string }> = [
  { id: "unread", label: "Ongelezen" },
  { id: "starred", label: "Met ster" },
  { id: "attachments", label: "Met bijlagen" },
  { id: "customer", label: "Van een klant" }
]

const matches = (t: InboxThread, f: ThreadFilter): boolean =>
  f === "unread"
    ? t.unread
    : f === "starred"
    ? t.starred
    : f === "attachments"
    ? t.hasAttachments
    : t.hasInbound

/** The folders as the server keeps them: the inbox is what is not set aside and not snoozed into the future. */
function inFolder(t: InboxThread, folder: Folder, me: string): boolean {
  if (folder === "trash" || folder === "spam" || folder === "archive") return t.place === folder
  if (t.place !== "inbox") return false
  if (folder === "unassigned") return !t.assignee
  if (folder === "mine") return t.assignee === me
  if (folder === "linked") return !!t.ticket_id
  return true
}

/** What a message the team sent says on its line: "Jij antwoordde", "Sanne stuurde door naar …". */
const sentLine = (m: LetterEntry) => {
  const by = m.by ?? "Jij"
  return m.kind === "reply"
    ? `${by} antwoordde`
    : m.kind === "forward"
    ? `${by} stuurde door naar ${m.to}`
    : `${by} schreef`
}

/** A send that answered at once, or later: `done` once it went; the busy flag while it is on its way. */
function useSettle() {
  const [busy, setBusy] = useState(false)
  const settle = useCallback(function settle<A>(sent: A | Promise<A>, done: (a: A) => void) {
    if (!(sent instanceof Promise)) return done(sent)
    setBusy(true)
    void sent.then((a) => {
      setBusy(false)
      done(a)
    })
  }, [])
  return { busy, settle }
}

export function InboxPage() {
  const source = useInboxSource()
  const navigate = useNavigate()
  const { search, go, me, people, writes, gate, time, threads, mailboxes } = source
  const folder = search.folder ?? "all"
  /** The new mail's thread, opened once it is made; whether it was. */
  const openComposed = (id: string | undefined) => {
    if (id !== undefined) go({ ...search, folder: undefined, mailbox: undefined, thread: id })
    return id !== undefined
  }
  const mailbox = mailboxes.find((m) => m.id === search.mailbox)
  const channel = search.channel
  const agentView = search.view
  const title = mailbox
    ? mailbox.label
    : channel
    ? CHANNEL_LABEL[channel]
    : agentView === "handed_over"
    ? "Overgedragen"
    : agentView === "insyte"
    ? "Door Insyte afgehandeld"
    : FOLDERS[folder]
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Array<ThreadFilter>>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [showSuggestion, setShowSuggestion] = useState(true)
  const [forwarding, setForwarding] = useState(false)
  const [composing, setComposing] = useState(false)
  const reply = useSettle()
  useOnCreate("thread", useCallback(() => setComposing(true), []))

  const inFolderThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          inFolder(t, folder, me) &&
          (!mailbox || t.mailbox === mailbox.id) &&
          (!channel || (channel === "email" ? !t.channel : t.channel === channel)) &&
          (!agentView ||
            (agentView === "handed_over" ? t.agent?.state === "handed_over" : t.agent?.state === "handled"))
      ),
    [threads, folder, mailbox, channel, agentView, me]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const faceted = inFolderThreads.filter((t) => filters.every((f) => matches(t, f)))
    if (!q) return faceted
    return faceted.filter((t) =>
      t.subject.toLowerCase().includes(q) ||
      t.other.name.toLowerCase().includes(q) ||
      t.last_message_preview.toLowerCase().includes(q)
    )
  }, [inFolderThreads, query, filters])

  /*
   * The thread `?thread=` names, even outside the folder on screen: a link from the search palette or a ticket names a
   * thread, not where it is, and an archived or snoozed one should still open. Without a name, the folder's first.
   */
  const active = filtered.find((t) => t.id === search.thread) ??
    threads.find((t) => t.id === search.thread && t.place !== "gone") ??
    filtered[0] ??
    null

  /*
   * Three columns do not fit in a phone. Below `lg` the index and the letter take turns, which is
   * what `?thread=` already describes: no thread in the URL means you are choosing one, a thread in
   * it means you are reading it. On a desktop both are up at once and this changes nothing, which
   * is why it keys on the search param rather than on `active` — `active` falls back to the first
   * thread so the desktop is never showing an empty letter, and a fallback is not a choice.
   */
  const readingOnNarrow = search.thread !== undefined

  /** The list, one group per mailbox, then one per chat channel, in the order they are connected. */
  const groups = [
    ...mailboxes.map((m) => ({
      key: m.id,
      mailbox: m as InboxMailbox | undefined,
      channel: undefined as (typeof CHAT_CHANNELS)[number] | undefined,
      threads: filtered.filter((t) => !t.channel && t.mailbox === m.id)
    })),
    ...CHAT_CHANNELS.map((c) => ({
      key: c,
      mailbox: undefined as InboxMailbox | undefined,
      channel: c as (typeof CHAT_CHANNELS)[number] | undefined,
      threads: filtered.filter((t) => t.channel === c)
    }))
  ].filter((g) => g.threads.length > 0)
  const activeMailbox = mailboxes.find((m) => m.id === active?.mailbox)
  const offline = activeMailbox !== undefined && !activeMailbox.status.live
  const drafts = source.drafts?.useDraft(active)
  const ChannelHeader = source.channels?.Header
  const ChannelLetter = source.channels?.Letter

  function assign(memberId: string | undefined) {
    if (!active) return
    const who = people.find((m) => m.id === memberId)
    writes.assign(active, memberId, {
      label: memberId === undefined
        ? "Toewijzing verwijderd"
        : memberId === me
        ? "Aan jou toegewezen"
        : `Toegewezen aan ${who?.name ?? "collega"}`
    })
  }

  function selectThread(t: InboxThread) {
    go({ ...search, thread: t.id })
    if (t.unread) writes.markRead(t, true)
    setDraft("")
    setShowSuggestion(true)
  }

  function toggleStar() {
    if (!active) return
    writes.star(active, !active.starred)
  }

  function archive() {
    if (!active) return
    leave(active, "archive", `“${active.subject}” gearchiveerd`)
  }

  /** Take a thread out of the list, move to the next one, and offer it back. */
  function leave(thread: InboxThread, as: "archive" | "spam" | "snooze" | "trash", message: string) {
    writes.setAside(thread, as, { label: message })
    const next = filtered.find((t) => t.id !== thread.id)
    go({ ...search, thread: next?.id })
  }

  function linkToTicket() {
    if (!active) return
    if (active.ticket_id) {
      void navigate({ to: "/tickets", search: { ticket: active.ticket_id } } as never)
      return
    }
    writes.linkTicket(active)
  }

  function useDraft() {
    if (!drafts?.reply) return
    setDraft(drafts.reply)
    setShowSuggestion(false)
    drafts.use()
    toast("Concept van Insyte in je antwoord gezet")
  }

  function rewriteDraft(style: "warmer" | "shorter") {
    if (!drafts?.reply) return
    void drafts.rewrite(style).then((text) => {
      if (text === undefined) return
      setDraft(text)
      setShowSuggestion(false)
      toast.success(style === "warmer" ? "Herschreven · warmer" : "Herschreven · korter")
    })
  }

  function sendReply() {
    if (!active || offline || reply.busy) return
    if (!draft.trim()) {
      toast.error(
        source.drafts ? "Schrijf eerst een antwoord of gebruik het concept van Insyte" : "Schrijf eerst een antwoord"
      )
      return
    }
    // A send that did not go keeps the draft, and the host has said why.
    reply.settle(
      writes.reply(active, draft.trim(), { label: `Antwoord verstuurd naar ${active.other.name}` }),
      (ok) => {
        if (ok) setDraft("")
      }
    )
  }

  const locked = gate.ok ? undefined : gate.reason

  return (
    <div className="flex min-h-0 flex-1">
      {/* The index */}
      <section
        className={cn(
          "w-full shrink-0 flex-col bg-glacier lg:flex lg:w-[340px]",
          readingOnNarrow ? "hidden" : "flex"
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-5">
          <h2 className="flex items-baseline gap-2 font-medium text-base text-ink leading-none">
            {title}
            <span className="font-normal text-sm text-ink-3 tabular-nums">
              {inFolderThreads.length}
            </span>
          </h2>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Berichten zoeken"
              onClick={() => setSearchOpen((v) => !v)}
              className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
            >
              <Search className="size-4" strokeWidth={1.75} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Berichten filteren"
                  className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  <Filter className="size-4" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Filter</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {FILTERS.map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.id}
                    checked={filters.includes(f.id)}
                    onCheckedChange={(on) => setFilters((cur) => (on ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
                  >
                    {f.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {searchOpen ?
          (
            <div className="px-4 pb-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Berichten zoeken…"
                  className="field h-8 w-full rounded-md pr-3 pl-8 text-base text-ink leading-none outline-none placeholder:text-ink-3 hover:field-hover focus-visible:bg-paper"
                />
              </div>
            </div>
          ) :
          null}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          role="listbox"
          aria-label={`Berichten in ${title}`}
        >
          {filtered.length === 0 ?
            (
              <p className="px-5 py-10 text-base text-ink-3 leading-[1.6]">
                {folder === "trash" || folder === "spam"
                  ? `${FOLDERS[folder]} is leeg.`
                  : query.trim()
                  ? `Geen gesprek gevonden voor “${query}”.`
                  : threads.length === 0
                  ? "Nog geen mail."
                  : "Niets meer te doen. Alle mail is afgehandeld."}
              </p>
            ) :
            (
              groups.map((g) => (
                <div
                  key={g.key}
                  role="group"
                  aria-label={g.mailbox?.address ?? (g.channel ? CHANNEL_LABEL[g.channel] : g.key)}
                >
                  {g.mailbox
                    ? <MailboxHeader mailbox={g.mailbox} count={g.threads.length} />
                    : g.channel && ChannelHeader
                    ? <ChannelHeader channel={g.channel} count={g.threads.length} />
                    : null}
                  {g.threads.map((t) => {
                    const owner = people.find((m) => m.id === t.assignee)
                    const isActive = active?.id === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => selectThread(t)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-5 py-3 text-left transition-colors",
                          isActive ? "flood" : "hover:bg-ink/6"
                        )}
                      >
                        <div className="flex w-full items-baseline gap-2">
                          {t.channel
                            ? (
                              <span className="self-center">
                                <ChannelMark channel={t.channel} size={14} />
                              </span>
                            )
                            : null}
                          {t.agent
                            ? (
                              <span
                                className="self-center"
                                title={t.agent.state === "handed_over"
                                  ? "Overgedragen door Insyte"
                                  : "Door Insyte afgehandeld"}
                              >
                                <InsyteMark size={14} />
                              </span>
                            )
                            : null}
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-base leading-none",
                              isActive
                                ? "text-mesh-ink"
                                : t.unread
                                ? "font-medium text-ink"
                                : "text-ink-2"
                            )}
                          >
                            {t.other.name}
                          </p>
                          {t.unread && !isActive ?
                            (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-arc"
                                aria-label="Ongelezen"
                              />
                            ) :
                            null}
                          <span
                            className={cn(
                              "shrink-0 text-sm leading-none tabular-nums",
                              isActive ? "text-mesh-ink-2" : "text-ink-3"
                            )}
                          >
                            {time(t.last_message_at)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "flex items-center gap-2 text-base leading-[1.35]",
                            isActive ? "text-mesh-ink-2" : "text-ink"
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                          {owner ?
                            (
                              <span
                                title={`Bij ${owner.name}`}
                                className="flex size-4 shrink-0 items-center justify-center rounded-full font-medium text-[9px]"
                                style={personStyle(owner.id)}
                              >
                                {initials(owner.name).slice(0, 1)}
                              </span>
                            ) :
                            null}
                        </p>
                        <p
                          className={cn(
                            "truncate text-sm leading-[1.35]",
                            isActive ? "text-mesh-ink-2" : "text-ink-3"
                          )}
                        >
                          {t.last_message_preview}
                        </p>
                        {t.labels.length > 0 ?
                          (
                            <span
                              className={cn(
                                "mt-1 inline-flex h-[18px] w-fit items-center rounded-full px-2 font-medium text-sm leading-none",
                                isActive
                                  ? "bg-mesh-ink/15 text-mesh-ink-2"
                                  : "bg-ink/6 text-ink-3"
                              )}
                            >
                              {t.labels[0]}
                            </span>
                          ) :
                          null}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
        </div>
      </section>

      {/* The letter */}
      {threads.length === 0 ?
        (
          <section className="hidden min-w-0 flex-1 overflow-y-auto bg-paper px-6 lg:block">
            <source.Empty onCompose={() => setComposing(true)} />
          </section>
        ) :
        active === null ?
        (
          <section className="hidden min-w-0 flex-1 items-center justify-center bg-paper lg:flex">
            <p className="max-w-[40ch] px-6 text-center text-base text-ink-3 leading-[1.6]">
              Kies links een gesprek, dan opent het hier.
            </p>
          </section>
        ) :
        (
          <section
            className={cn(
              "min-w-0 flex-1 flex-col bg-paper lg:flex",
              readingOnNarrow ? "flex" : "hidden"
            )}
          >
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 pr-4 pl-3 lg:pl-6">
              <button
                type="button"
                onClick={() => go({ ...search, thread: undefined })}
                className="-ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink lg:hidden"
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} />
                {title}
              </button>
              {active.channel ?
                (
                  <span className="hidden items-center gap-1.5 text-sm text-ink-3 leading-none lg:flex">
                    <ChannelMark channel={active.channel} size={14} />
                    Via {CHANNEL_LABEL[active.channel]}
                  </span>
                ) :
                activeMailbox ?
                (
                  <span className="hidden items-center gap-1.5 text-sm text-ink-3 leading-none lg:flex">
                    <MailboxMark logo={activeMailbox.logo} />
                    Aan {activeMailbox.address}
                  </span>
                ) :
                null}
              <div className="flex items-center gap-1">
                <AssignMenu
                  assignee={people.find((m) => m.id === active.assignee)}
                  members={people}
                  me={me}
                  locked={locked}
                  onAssign={assign}
                />
                <button
                  type="button"
                  onClick={linkToTicket}
                  disabled={!active.ticket_id && locked !== undefined}
                  title={active.ticket_id ? undefined : locked}
                  className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ticket className="size-4" strokeWidth={1.75} />
                  {active.ticket_id ? "Gekoppeld" : "Aan ticket koppelen"}
                </button>
                <button
                  type="button"
                  aria-label="Archiveren"
                  onClick={archive}
                  disabled={locked !== undefined}
                  title={locked}
                  className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Archive className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={active.starred ? "Ster verwijderen" : "Ster geven"}
                  onClick={toggleStar}
                  disabled={locked !== undefined}
                  title={locked}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-ink/6 disabled:cursor-not-allowed disabled:opacity-50",
                    active.starred
                      ? "text-signal-amber"
                      : "text-ink-3 hover:text-ink"
                  )}
                >
                  <Star
                    className={cn("size-4", active.starred && "fill-current")}
                    strokeWidth={1.75}
                  />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Meer"
                      className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
                    >
                      <MoreVertical className="size-4" strokeWidth={1.75} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={() => {
                        if (!active) return
                        writes.markRead(active, false)
                        go({ ...search, thread: undefined })
                      }}
                    >
                      Markeren als ongelezen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={locked !== undefined}
                      onClick={() => active && leave(active, "snooze", "Een uur uitgesteld")}
                    >
                      1 uur uitstellen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={locked !== undefined}
                      onClick={() => active && setForwarding(true)}
                    >
                      Doorsturen…
                    </DropdownMenuItem>
                    {writes.putBack && active.place !== "inbox" ?
                      (
                        <DropdownMenuItem
                          disabled={locked !== undefined}
                          onClick={() => active && writes.putBack?.(active, { label: "Terug in de inbox" })}
                        >
                          Terug naar de inbox
                        </DropdownMenuItem>
                      ) :
                      null}
                    {writes.label ? <LabelMenu thread={active} label={writes.label} locked={locked} /> : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={locked !== undefined}
                      onClick={() => active && leave(active, "spam", "Gemeld als spam")}
                    >
                      Spam melden
                    </DropdownMenuItem>
                    {writes.trash && active.place !== "trash" ?
                      (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={locked !== undefined}
                          onClick={() => active && leave(active, "trash", "Naar de prullenbak")}
                        >
                          Naar prullenbak
                        </DropdownMenuItem>
                      ) :
                      null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {active.channel && ChannelLetter ?
              <ChannelLetter thread={active} /> :
              (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
                    <LetterBody thread={active} source={source} />

                    {showSuggestion && drafts?.reply ?
                      (
                        <div className="mt-8 flex max-w-[60ch] flex-col gap-3">
                          {/* Insyte speaks on the dark ground, here as everywhere else. */}
                          <div className="flex flex-col gap-3 rounded-xl bg-abyss px-5 py-4">
                            <div className="flex items-center gap-2">
                              <Sparkles
                                className="size-3.5 text-mesh-ink"
                                strokeWidth={1.75}
                              />
                              <span className="font-medium text-sm text-mesh-ink leading-none">
                                Insyte stelde een antwoord op
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-base text-mesh-ink-2 leading-[1.65]">
                              {drafts.reply}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={useDraft}
                              className="flex h-8 items-center rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2"
                            >
                              Concept gebruiken
                            </button>
                            <button
                              type="button"
                              onClick={() => rewriteDraft("warmer")}
                              className="flex h-8 items-center rounded-md px-3 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
                            >
                              Warmer maken
                            </button>
                            <button
                              type="button"
                              onClick={() => rewriteDraft("shorter")}
                              className="flex h-8 items-center rounded-md px-3 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
                            >
                              Korter maken
                            </button>
                          </div>
                        </div>
                      ) :
                      null}

                    {draft ?
                      (
                        <div className="mt-8 flex max-w-[60ch] flex-col gap-2">
                          <span className="text-sm text-ink-3 leading-none">
                            Jouw concept
                          </span>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            readOnly={reply.busy}
                            rows={Math.max(6, draft.split("\n").length + 1)}
                            className="field w-full rounded-lg p-3.5 text-base text-ink leading-[1.65] outline-none hover:field-hover focus-visible:bg-paper"
                          />
                        </div>
                      ) :
                      null}
                  </div>

                  {offline && activeMailbox ?
                    (
                      <div className="flex shrink-0 items-center gap-2 bg-signal-amber-bg px-4 py-2 text-sm text-signal-amber">
                        <MailboxMark logo={activeMailbox.logo} />
                        <span className="min-w-0 flex-1">
                          {activeMailbox.address}{" "}
                          is ontkoppeld. Er wordt niets vanaf verstuurd en er komt geen nieuwe mail binnen tot{" "}
                          {activeMailbox.providerLabel} weer gekoppeld is.
                        </span>
                        <ConnectAction className="shrink-0 font-medium underline-offset-2 hover:underline">
                          {activeMailbox.reconnectLabel}
                        </ConnectAction>
                      </div>
                    ) :
                    null}
                  <div className="flex shrink-0 items-center justify-between bg-mist px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestion(false)
                          setDraft((d) => d || " ")
                        }}
                        disabled={locked !== undefined}
                        title={locked}
                        className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Reply className="size-4" strokeWidth={1.75} />
                        Beantwoorden
                      </button>
                      <button
                        type="button"
                        onClick={() => setForwarding(true)}
                        disabled={locked !== undefined}
                        title={locked}
                        className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Reply className="size-4 -scale-x-100" strokeWidth={1.75} />
                        Doorsturen
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={offline || reply.busy || locked !== undefined}
                      title={locked}
                      className="flex h-8 items-center gap-2 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="size-3.5" strokeWidth={2} />
                      {reply.busy ? "Versturen…" : "Antwoord versturen"}
                    </button>
                  </div>
                </>
              )}
          </section>
        )}
      <ForwardDialog
        open={forwarding && active !== null}
        onOpenChange={setForwarding}
        subject={active?.subject ?? ""}
        onSend={(to, note) => (active ? writes.forward(active, to, note, { label: `Doorgestuurd naar ${to}` }) : false)}
      />
      <ComposeDialog
        open={composing}
        onOpenChange={setComposing}
        onSend={(m) => {
          const made = writes.compose({ ...m, mailbox: mailbox?.id }, { label: `E-mail verstuurd naar ${m.to}` })
          return made instanceof Promise ? made.then(openComposed) : openComposed(made)
        }}
      />
      <PageGuide id="inbox" title="Inbox" steps={source.channels ? GUIDE : GUIDE.slice(0, 1)} />
    </div>
  )
}

/** The letter itself: the subject, then every message in order, the customer's as the letter and the team's on mist. */
function LetterBody({ thread, source }: { thread: InboxThread; source: InboxSource }) {
  const { entries, ready } = source.useLetter(thread)
  const first = entries[0]
  return (
    <>
      <h1 className="max-w-[60ch] pt-1 pb-5 font-medium text-xl text-ink leading-[1.25] tracking-[-0.02em]">
        {thread.subject}
      </h1>
      {!ready ?
        (
          <Arriving label="Bericht laden" className="flex max-w-[60ch] flex-col gap-3">
            <Lines n={5} />
          </Arriving>
        ) :
        (
          <>
            {/* A thread the team started opens on whom it went to. */}
            {first !== undefined && first.direction !== "inbound" ?
              <From name={thread.other.name} email={thread.other.email} at={source.time(first.at)} /> :
              null}
            {entries.map((m, i) =>
              m.direction === "inbound" ?
                (
                  <Fragment key={m.id}>
                    <From name={m.from.name} email={m.from.email} at={source.time(m.at)} later={i > 0} />
                    <div className="max-w-[60ch] whitespace-pre-wrap text-base text-ink leading-[1.65]">
                      {m.body}
                    </div>
                  </Fragment>
                ) :
                (
                  <div key={m.id} className="mt-6 flex max-w-[60ch] flex-col gap-2 rounded-lg bg-mist px-4 py-3">
                    <span className="flex items-baseline gap-2 text-sm text-ink-3">
                      <span className="font-medium text-ink-2">{sentLine(m)}</span>
                      <span className="tabular-nums">{source.time(m.at)}</span>
                      {m.state === "scheduled" || m.state === "sending" ? <span>Wordt verstuurd…</span> : null}
                      {m.state === "failed" ?
                        (
                          <span className="font-medium text-signal-red">
                            Niet verstuurd{m.error ? `: ${m.error}` : ""}
                          </span>
                        ) :
                        null}
                    </span>
                    {m.body
                      ? <p className="whitespace-pre-wrap text-base text-ink leading-[1.65]">{m.body}</p>
                      : null}
                  </div>
                )
            )}
          </>
        )}
    </>
  )
}

/** Who wrote, from where, and when: the line above a message. */
function From({ name, email, at, later = false }: { name: string; email: string; at: string; later?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2.5 pb-4", later && "mt-8")}>
      <span className="font-medium text-base text-ink leading-none">
        {name}
      </span>
      <span className="text-sm text-ink-3 leading-none">
        {email}
      </span>
      <span className="ml-auto shrink-0 text-sm text-ink-3 leading-none tabular-nums">
        {at}
      </span>
    </div>
  )
}

/** "Mailbox koppelen" and "Opnieuw koppelen", where the host connects one: its page, or its dialog. */
function ConnectAction({ className, children }: { className: string; children: ReactNode }) {
  const { connect } = useInboxSource()
  if ("to" in connect) {
    return <Link to={connect.to as never} className={className}>{children}</Link>
  }
  return <button type="button" onClick={connect.onClick} className={className}>{children}</button>
}

/** The thread's labels, on or off, from the ones the host offers. */
function LabelMenu(
  { thread, label, locked }: {
    thread: InboxThread
    label: NonNullable<InboxSource["writes"]["label"]>
    locked: string | undefined
  }
) {
  const offered = [...new Set([...label.offered, ...thread.labels])]
  if (offered.length === 0) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={locked !== undefined}>Labels</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {offered.map((name) => (
          <DropdownMenuCheckboxItem
            key={name}
            checked={thread.labels.includes(name)}
            onCheckedChange={(on) => label.set(thread, name, on === true)}
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ForwardDialog({
  open,
  onOpenChange,
  subject,
  onSend
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  subject: string
  onSend: (to: string, note: string) => Sent
}) {
  const [to, setTo] = useState("")
  const [note, setNote] = useState("")
  const { busy, settle } = useSettle()
  const valid = /.+@.+\..+/.test(to.trim())
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setTo("")
          setNote("")
        }
        onOpenChange(v)
      }}
      title="Deze mail doorsturen"
      description={`“${subject}”, met alle berichten erin.`}
      primaryLabel={busy ? "Doorsturen…" : "Doorsturen"}
      disabled={!valid || busy}
      onSubmit={() => {
        // What did not go stays in the dialog, and the host has said why.
        settle(onSend(to.trim(), note.trim()), (ok) => {
          if (!ok) return
          setTo("")
          setNote("")
          onOpenChange(false)
        })
      }}
    >
      <Field label="Aan">
        <TextField value={to} onChange={setTo} placeholder="naam@bedrijf.nl" type="email" />
      </Field>
      <Field label="Notitie (optioneel)">
        <TextAreaField
          value={note}
          onChange={setNote}
          placeholder="Zet een regel boven de doorgestuurde mail"
          rows={3}
        />
      </Field>
    </FormDialog>
  )
}

function ComposeDialog({
  open,
  onOpenChange,
  onSend
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSend: (m: { to: string; subject: string; body: string }) => Sent
}) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const { busy, settle } = useSettle()
  const valid = /.+@.+\..+/.test(to.trim()) && subject.trim() !== "" && body.trim() !== ""
  const reset = () => {
    setTo("")
    setSubject("")
    setBody("")
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
      title="Nieuwe e-mail"
      description="Verstuurd vanuit je supportinbox. De mail komt bovenaan de inbox te staan."
      primaryLabel={busy ? "Versturen…" : "Versturen"}
      disabled={!valid || busy}
      width={560}
      onSubmit={() => {
        settle(onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() }), (ok) => {
          if (!ok) return
          reset()
          onOpenChange(false)
        })
      }}
    >
      <Field label="Aan">
        <TextField value={to} onChange={setTo} placeholder="klant@voorbeeld.nl" type="email" />
      </Field>
      <Field label="Onderwerp">
        <TextField value={subject} onChange={setSubject} placeholder="Over je bestelling" />
      </Field>
      <Field label="Bericht">
        <TextAreaField value={body} onChange={setBody} placeholder="Schrijf je bericht" rows={6} />
      </Field>
    </FormDialog>
  )
}

/**
 * A mailbox's band in the list: the provider's logo, the address mail arrives at, and whether it is
 * still arriving. A disconnected mailbox keeps its threads and says what to do about it.
 */
function MailboxHeader({ mailbox, count }: { mailbox: InboxMailbox; count: number }) {
  return (
    <div className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-glacier px-5">
      <MailboxMark logo={mailbox.logo} />
      <span className="min-w-0 truncate font-medium text-sm text-ink-2">{mailbox.address}</span>
      <span className="text-sm text-ink-3 tabular-nums">{count}</span>
      {mailbox.status.live ?
        (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
            <span className="size-1.5 rounded-full bg-signal-green" aria-hidden />
            {mailbox.status.line}
          </span>
        ) :
        (
          <ConnectAction className="ml-auto shrink-0 rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs hover:underline">
            Opnieuw koppelen
          </ConnectAction>
        )}
    </div>
  )
}

/** Who the thread is with, and the menu that hands it to someone else. */
function AssignMenu({
  assignee,
  members,
  me,
  locked,
  onAssign
}: {
  assignee: { id: string; name: string } | undefined
  members: ReadonlyArray<{ id: string; name: string; role: string }>
  me: string
  locked: string | undefined
  onAssign: (memberId: string | undefined) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={locked !== undefined}
          title={locked}
          className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {assignee ?
            (
              <span
                className="flex size-5 items-center justify-center rounded-full font-medium text-xs"
                style={personStyle(assignee.id)}
              >
                {initials(assignee.name).slice(0, 1)}
              </span>
            ) :
            <UserPlus className="size-4" strokeWidth={1.75} />}
          {assignee ? (assignee.id === me ? "Jij" : assignee.name.split(" ")[0]) : "Toewijzen"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Deze mail toewijzen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => onAssign(m.id)}>
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full font-medium text-xs"
              style={personStyle(m.id)}
            >
              {initials(m.name).slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate">{m.id === me ? `${m.name} (jij)` : m.name}</span>
            {assignee?.id === m.id
              ? <span className="text-xs text-ink-3">Toegewezen</span>
              : <span className="text-xs text-ink-3">{m.role}</span>}
          </DropdownMenuItem>
        ))}
        {assignee ?
          (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssign(undefined)}>
                <UserX className="size-4" strokeWidth={1.75} />
                Toewijzing verwijderen
              </DropdownMenuItem>
            </>
          ) :
          null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
