import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { useNow } from "../ask/agent-parts"
import { InsyteMark } from "../ask/parts"
import { EmptyPage } from "../common/empty-page"
import { Field, FormDialog, TextAreaField, TextField } from "../common/form-dialog"
import { PageGuide } from "../common/page-guide"
import { ME as MY_ID } from "../lib/assignees"
import { CHANNEL_LABEL, CHAT_CHANNELS } from "../lib/channels"
import { initials } from "../lib/format"
import { type Mailbox, MAILBOXES, mailboxStatus, PROVIDER_LABEL } from "../lib/mailboxes"
import { personStyle } from "../lib/person-color"
import type { EmailThread } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { useOnCreate } from "../stores/create-intent"
import { type ThreadState, useInbox } from "../stores/inbox-store"
import { useWorkspace } from "../stores/workspace-store"
import { AgentBanner } from "./agent-banner"
import { ChannelHeader, ChannelMark, ChatLetter } from "./channel-parts"

const Route = Object.assign(getRouteApi("/_admin/inbox/"), { fullPath: "/inbox/" } as const)

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
} as const

type FolderId = keyof typeof FOLDERS

type ThreadFilter = "unread" | "starred" | "attachments" | "customer"
const FILTERS: Array<{ id: ThreadFilter; label: string }> = [
  { id: "unread", label: "Ongelezen" },
  { id: "starred", label: "Met ster" },
  { id: "attachments", label: "Met bijlagen" },
  { id: "customer", label: "Van een klant" }
]

const matches = (t: ThreadState, f: ThreadFilter): boolean =>
  f === "unread"
    ? t.unread
    : f === "starred"
    ? t.starred
    : f === "attachments"
    ? t.messages.some((m) => m.attachments.length > 0)
    : t.messages.some((m) => m.direction === "inbound")

const SUGGESTED_REPLY = `Hoi Maya,

Bedankt voor je bericht. Ik heb je bestelling bekeken: die ligt vertraagd in ons magazijn, en daarom is de track & trace nog niet bijgewerkt.

Het team verwacht dat hij binnen 24–48 uur wordt verzonden. Omdat je hem vrijdag nodig hebt, heb ik hem met voorrang laten oppakken.

Excuses voor de vertraging. Zodra de track & trace verandert, laten we het je weten.

Met vriendelijke groet,
Carroline`

const MAYA_WARMER = `Hoi Maya,

Fijn dat je contact opneemt. Ik begrijp heel goed dat je dit vrijdag in huis wilt hebben, en het spijt me dat je moet wachten.

Ik heb je bestelling net bekeken: die ligt op dit moment nog in ons magazijn. Het team verwacht dat hij binnen 24–48 uur wordt verzonden, en ik heb hem zelf voorrang gegeven zodat hij zo snel mogelijk de deur uit gaat.

Zodra de track & trace is bijgewerkt, hoor je het meteen van me. Bedankt voor je geduld.

Hartelijke groet,
Carroline`

const MAYA_SHORTER =
  `Hoi Maya, je bestelling is vertraagd in het magazijn, maar wordt binnen 24–48 uur verzonden. Ik heb hem voorrang gegeven zodat hij er vrijdag is. Je krijgt de track & trace zodra die is bijgewerkt.

— Carroline`

/**
 * Insyte's drafts for a thread. The first thread has the full worked example; every other thread
 * gets a draft addressed to whoever wrote and about what they wrote, not someone else's order.
 */
function draftsFor(t: EmailThread | null): { reply: string; warmer: string; shorter: string } {
  if (!t || t.id === "th_1") return { reply: SUGGESTED_REPLY, warmer: MAYA_WARMER, shorter: MAYA_SHORTER }
  const name = otherParticipant(t).name.split(" ")[0] ?? "daar"
  const topic = t.subject.replace(/^(re|fwd?):\s*/i, "")
  return {
    reply:
      `Hoi ${name},\n\nBedankt voor je bericht over “${topic}”. Ik zoek het nu voor je uit en kom vandaag nog bij je terug met een antwoord.\n\nMet vriendelijke groet,\nElena`,
    warmer:
      `Hoi ${name},\n\nBedankt dat je contact opneemt, en voor je geduld. Ik heb je bericht over “${topic}” zelf opgepakt en zorg dat je vandaag nog van me hoort.\n\nHartelijke groet,\nElena`,
    shorter: `Hoi ${name}, bedankt voor je bericht over “${topic}”. Ik kom er vandaag bij je op terug.\n\n— Elena`
  }
}

function seedBody(t: EmailThread): string {
  if (t.id === "th_1") {
    return `Hallo Insyte-team,

Mijn bestelling van afgelopen dinsdag staat nog steeds op "wordt klaargemaakt voor verzending". De verwachte datum is al voorbij en ik heb dit vrijdag echt nodig voor een cadeau. Kunnen jullie de laatste track & trace voor me bekijken?

Alvast bedankt,
Maya`
  }
  if (t.messages[0]?.body_text) return t.messages[0].body_text
  return `${t.last_message_preview}\n\nBedankt,\n${otherParticipant(t).name.split(" ")[0]}`
}

function otherParticipant(t: EmailThread) {
  return (
    t.participants.find((p) => !p.email.endsWith("northwindclothing.co")) ??
      t.participants[0]
  )
}

function formatTimeOfDay(iso: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso))
}

function inFolder(t: ThreadState, folder: FolderId): boolean {
  if (folder === "trash" || folder === "spam") return false
  if (folder === "archive") return !!t.archived
  if (t.archived || t.spam) return false
  if (folder === "unassigned") return !t.assignee
  if (folder === "mine") return t.assignee === MY_ID
  if (folder === "linked") return !!t.ticket_id
  return true
}

export function InboxPage() {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const folder = search.folder ?? "all"
  const threads = useInbox((s) => s.threads)
  const update = useInbox((s) => s.update)
  const addThread = useInbox((s) => s.add)
  const removeThread = useInbox((s) => s.remove)
  const integrations = useWorkspace((s) => s.integrations)
  const members = useWorkspace((s) => s.members)
  const mailbox = MAILBOXES.find((m) => m.id === search.mailbox)
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
  const now = useNow(60_000)
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Array<ThreadFilter>>([])
  const createTicket = useWorkspace((s) => s.createTicket)
  const [searchOpen, setSearchOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [showSuggestion, setShowSuggestion] = useState(true)
  const [forwarding, setForwarding] = useState(false)
  const [composing, setComposing] = useState(false)
  useOnCreate("thread", useCallback(() => setComposing(true), []))

  const inFolderThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          inFolder(t, folder) &&
          (!mailbox || t.mailbox === mailbox.id) &&
          (!channel || (channel === "email" ? !t.channel : t.channel === channel)) &&
          (!agentView ||
            (agentView === "handed_over" ? t.agent?.state === "handed_over" : t.agent?.state === "handled"))
      ),
    [threads, folder, mailbox, channel, agentView]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const faceted = inFolderThreads.filter((t) => filters.every((f) => matches(t, f)))
    if (!q) return faceted
    return faceted.filter((t) => {
      const other = otherParticipant(t)
      return (
        t.subject.toLowerCase().includes(q) ||
        other.name.toLowerCase().includes(q) ||
        t.last_message_preview.toLowerCase().includes(q)
      )
    })
  }, [inFolderThreads, query, filters])

  const active = filtered.find((t) => t.id === search.thread) ?? filtered[0] ?? null

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
    ...MAILBOXES.map((m) => ({
      key: m.id,
      mailbox: m as Mailbox | undefined,
      channel: undefined as (typeof CHAT_CHANNELS)[number] | undefined,
      threads: filtered.filter((t) => !t.channel && t.mailbox === m.id)
    })),
    ...CHAT_CHANNELS.map((c) => ({
      key: c,
      mailbox: undefined as Mailbox | undefined,
      channel: c as (typeof CHAT_CHANNELS)[number] | undefined,
      threads: filtered.filter((t) => t.channel === c)
    }))
  ].filter((g) => g.threads.length > 0)
  const activeMailbox = MAILBOXES.find((m) => m.id === active?.mailbox)
  const offline = activeMailbox !== undefined && !mailboxStatus(activeMailbox, integrations).live

  function assign(memberId: string | undefined) {
    if (!active) return
    const before = active.assignee
    const id = active.id
    update(id, { assignee: memberId })
    const who = members.find((m) => m.id === memberId)
    undoable(
      memberId === undefined
        ? "Toewijzing verwijderd"
        : memberId === MY_ID
        ? "Aan jou toegewezen"
        : `Toegewezen aan ${who?.name ?? "collega"}`,
      () => update(id, { assignee: before })
    )
  }

  function selectThread(id: string) {
    navigate({ search: (s) => ({ ...s, thread: id }) })
    update(id, { unread: false })
    setDraft("")
    setShowSuggestion(true)
  }

  function toggleStar() {
    if (!active) return
    update(active.id, { starred: !active.starred })
  }

  function archive() {
    if (!active) return
    leave(active, { archived: true }, `“${active.subject}” gearchiveerd`)
  }

  /** Take a thread out of the list, move to the next one, and offer it back. */
  function leave(thread: ThreadState, patch: Partial<ThreadState>, message: string) {
    update(thread.id, patch)
    const next = filtered.find((t) => t.id !== thread.id)
    navigate({ search: (s) => ({ ...s, thread: next?.id }) })
    undoable(message, () => update(thread.id, { archived: false, spam: false }))
  }

  function linkToTicket() {
    if (!active) return
    if (active.ticket_id) {
      navigate({ to: "/tickets", search: { ticket: active.ticket_id } as never })
      return
    }
    const from = otherParticipant(active)
    const ticket = createTicket({
      title: active.subject,
      description: `Van ${from.name} (${from.email}): ${active.last_message_preview}`,
      priority: "medium"
    })
    update(active.id, { ticket_id: ticket.id })
    toast.success(`Ticket ${ticket.number} aangemaakt vanuit deze mail`, {
      action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: ticket.id } as never }) }
    })
  }

  /** A chat reply: a bubble that waits out the window before it leaves, so Undo means it never went. */
  function sendChat(thread: ThreadState, text: string, template?: string) {
    const at = new Date().toISOString()
    const msg = {
      id: `m_${Date.now()}`,
      from: "team" as const,
      name: members.find((m) => m.id === MY_ID)?.name ?? "Elena Hart",
      at,
      text,
      read: false,
      template
    }
    const before = thread
    update(thread.id, {
      chat: [...(thread.chat ?? []), msg],
      last_message_at: at,
      last_message_preview: text.slice(0, 80)
    })
    undoable(
      "Wordt verstuurd…",
      () =>
        update(before.id, {
          chat: before.chat,
          last_message_at: before.last_message_at,
          last_message_preview: before.last_message_preview
        }),
      `Via ${CHANNEL_LABEL[thread.channel ?? "email"]} aan ${otherParticipant(thread).name}.`
    )
  }

  function useDraft() {
    setDraft(draftsFor(active).reply)
    setShowSuggestion(false)
    toast("Concept van Insyte in je antwoord gezet")
  }

  function rewriteDraft(style: "warmer" | "shorter") {
    const map = draftsFor(active)
    setDraft(map[style])
    setShowSuggestion(false)
    toast.success(style === "warmer" ? "Herschreven · warmer" : "Herschreven · korter")
  }

  function sendReply() {
    if (!active || offline) return
    if (!draft.trim()) {
      toast.error("Schrijf eerst een antwoord of gebruik het concept van Insyte")
      return
    }
    const at = new Date().toISOString()
    const entry = { id: `sent_${Date.now()}`, kind: "reply" as const, at, body: draft.trim() }
    const before = active
    update(active.id, {
      last_message_preview: draft.slice(0, 80),
      last_message_at: at,
      sent: [...(active.sent ?? []), entry]
    })
    undoable(
      `Antwoord verstuurd naar ${otherParticipant(active).name}`,
      () =>
        update(before.id, {
          sent: before.sent,
          last_message_preview: before.last_message_preview,
          last_message_at: before.last_message_at
        })
    )
    setDraft("")
  }

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
                    ? (
                      <MailboxHeader
                        mailbox={g.mailbox}
                        count={g.threads.length}
                        status={mailboxStatus(g.mailbox, integrations)}
                      />
                    )
                    : g.channel
                    ? <ChannelHeader channel={g.channel} count={g.threads.length} />
                    : null}
                  {g.threads.map((t) => {
                    const other = otherParticipant(t)
                    const owner = members.find((m) => m.id === t.assignee)
                    const isActive = active?.id === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => selectThread(t.id)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-5 py-3 text-left transition-colors",
                          isActive ? "flood" : "hover:bg-ink/6"
                        )}
                      >
                        <div className="flex w-full items-baseline gap-2">
                          {t.channel && t.channel !== "email"
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
                            {other.name}
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
                            {formatTimeOfDay(t.last_message_at)}
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
            <EmptyPage
              kind="inbox"
              count="0 berichten"
              title="Nog niets binnen"
              body="Koppel je support-mailbox, Gmail of Outlook, en je berichten komen hier binnen."
              action={{ label: "Mailbox koppelen", onClick: () => void navigate({ to: "/settings/integrations" }) }}
              secondary={{ label: "Nieuwe e-mail", onClick: () => setComposing(true) }}
              startsTitle="Daarna je andere kanalen"
              starts={[
                {
                  id: "whatsapp",
                  label: "WhatsApp Business",
                  body: "Klanten appen je nummer, jij antwoordt hier.",
                  to: "/settings/integrations"
                },
                {
                  id: "instagram",
                  label: "Instagram",
                  body: "Berichten en reacties op je stories.",
                  to: "/settings/integrations"
                },
                {
                  id: "webchat",
                  label: "Websitechat",
                  body: "Een chat op je Shopify-winkel.",
                  to: "/settings/integrations"
                }
              ]}
            />
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
                onClick={() => navigate({ search: (s) => ({ ...s, thread: undefined }) })}
                className="-ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink lg:hidden"
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} />
                {title}
              </button>
              {active.channel && active.channel !== "email" ?
                (
                  <span className="hidden items-center gap-1.5 text-sm text-ink-3 leading-none lg:flex">
                    <ChannelMark channel={active.channel} size={14} />
                    Via {CHANNEL_LABEL[active.channel]}
                  </span>
                ) :
                activeMailbox ?
                (
                  <span className="hidden items-center gap-1.5 text-sm text-ink-3 leading-none lg:flex">
                    <BrandLogo brand={activeMailbox.provider} name={PROVIDER_LABEL[activeMailbox.provider]} size={14} />
                    Aan {activeMailbox.address}
                  </span>
                ) :
                null}
              <div className="flex items-center gap-1">
                <AssignMenu
                  assignee={members.find((m) => m.id === active.assignee)}
                  members={members.filter((m) => m.status === "active")}
                  onAssign={assign}
                />
                <button
                  type="button"
                  onClick={linkToTicket}
                  className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  <Ticket className="size-4" strokeWidth={1.75} />
                  {active.ticket_id ? "Gekoppeld" : "Aan ticket koppelen"}
                </button>
                <button
                  type="button"
                  aria-label="Archiveren"
                  onClick={archive}
                  className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  <Archive className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={active.starred ? "Ster verwijderen" : "Ster geven"}
                  onClick={toggleStar}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-ink/6",
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
                        update(active.id, { unread: true })
                        navigate({ search: (s) => ({ ...s, thread: undefined }) })
                      }}
                    >
                      Markeren als ongelezen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => active && leave(active, { archived: true }, "Een uur uitgesteld")}
                    >
                      1 uur uitstellen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => active && setForwarding(true)}
                    >
                      Doorsturen…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => active && leave(active, { spam: true }, "Gemeld als spam")}
                    >
                      Spam melden
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {active.channel ?
              (
                <ChatLetter
                  thread={active}
                  now={now}
                  banner={<AgentBanner thread={active} />}
                  composerDisabled={active.agent?.state === "active"
                    ? "Insyte voert dit gesprek. Neem het over om zelf te antwoorden."
                    : undefined}
                  onSend={(text, tpl) => sendChat(active, text, tpl?.name)}
                />
              ) :
              (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
                    <h1 className="max-w-[60ch] pt-1 pb-5 font-medium text-xl text-ink leading-[1.25] tracking-[-0.02em]">
                      {active.subject}
                    </h1>
                    <div className="flex items-baseline gap-2.5 pb-4">
                      <span className="font-medium text-base text-ink leading-none">
                        {otherParticipant(active).name}
                      </span>
                      <span className="text-sm text-ink-3 leading-none">
                        {otherParticipant(active).email}
                      </span>
                      <span className="ml-auto shrink-0 text-sm text-ink-3 leading-none tabular-nums">
                        {formatTimeOfDay(active.last_message_at)}
                      </span>
                    </div>
                    <div className="max-w-[60ch] whitespace-pre-wrap text-base text-ink leading-[1.65]">
                      {active.body ?? seedBody(active)}
                    </div>

                    {(active.sent ?? []).map((m) => (
                      <div key={m.id} className="mt-6 flex max-w-[60ch] flex-col gap-2 rounded-lg bg-mist px-4 py-3">
                        <span className="flex items-baseline gap-2 text-sm text-ink-3">
                          <span className="font-medium text-ink-2">
                            {m.kind === "reply" ? "Jij antwoordde" : `Jij stuurde door naar ${m.to}`}
                          </span>
                          <span className="tabular-nums">{formatTimeOfDay(m.at)}</span>
                        </span>
                        {m.body
                          ? <p className="whitespace-pre-wrap text-base text-ink leading-[1.65]">{m.body}</p>
                          : null}
                      </div>
                    ))}

                    {showSuggestion ?
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
                              {draftsFor(active).reply}
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
                        <BrandLogo
                          brand={activeMailbox.provider}
                          name={PROVIDER_LABEL[activeMailbox.provider]}
                          size={14}
                        />
                        <span className="min-w-0 flex-1">
                          {activeMailbox.address}{" "}
                          is ontkoppeld. Er wordt niets vanaf verstuurd en er komt geen nieuwe mail binnen tot{" "}
                          {PROVIDER_LABEL[activeMailbox.provider]} weer gekoppeld is.
                        </span>
                        <Link
                          to="/settings/integrations"
                          className="shrink-0 font-medium underline-offset-2 hover:underline"
                        >
                          {PROVIDER_LABEL[activeMailbox.provider]} opnieuw koppelen
                        </Link>
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
                        className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        <Reply className="size-4" strokeWidth={1.75} />
                        Beantwoorden
                      </button>
                      <button
                        type="button"
                        onClick={() => setForwarding(true)}
                        className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
                      >
                        <Reply className="size-4 -scale-x-100" strokeWidth={1.75} />
                        Doorsturen
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={offline}
                      className="flex h-8 items-center gap-2 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="size-3.5" strokeWidth={2} />
                      Antwoord versturen
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
        onSend={(to, note) => {
          if (!active) return
          const before = active
          update(active.id, {
            sent: [...(active.sent ?? []), {
              id: `fwd_${Date.now()}`,
              kind: "forward",
              at: new Date().toISOString(),
              body: note,
              to
            }]
          })
          undoable(`Doorgestuurd naar ${to}`, () => update(before.id, { sent: before.sent }))
        }}
      />
      <ComposeDialog
        open={composing}
        onOpenChange={setComposing}
        onSend={({ to, subject, body }) => {
          const at = new Date().toISOString()
          const id = `thread_new_${Date.now()}`
          const thread: ThreadState = {
            id,
            subject,
            participants: [
              { name: "Elena Hart", email: "elena@northwindclothing.co" },
              { name: to.split("@")[0] ?? to, email: to }
            ],
            last_message_at: at,
            last_message_preview: body.slice(0, 80),
            unread: false,
            starred: false,
            labels: [],
            messages: [],
            mailbox: mailbox?.id ?? "support",
            assignee: MY_ID,
            body: "",
            sent: [{ id: `sent_${Date.now()}`, kind: "reply", at, body }]
          }
          addThread(thread)
          navigate({ search: (s) => ({ ...s, folder: undefined, mailbox: undefined, thread: id }) })
          undoable(`E-mail verstuurd naar ${to}`, () => removeThread(id))
        }}
      />
      <PageGuide id="inbox" title="Inbox" steps={GUIDE} />
    </div>
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
  onSend: (to: string, note: string) => void
}) {
  const [to, setTo] = useState("")
  const [note, setNote] = useState("")
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
      primaryLabel="Doorsturen"
      disabled={!valid}
      onSubmit={() => {
        onSend(to.trim(), note.trim())
        setTo("")
        setNote("")
        onOpenChange(false)
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
  onSend: (m: { to: string; subject: string; body: string }) => void
}) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
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
      primaryLabel="Versturen"
      disabled={!valid}
      width={560}
      onSubmit={() => {
        onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() })
        reset()
        onOpenChange(false)
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
function MailboxHeader(
  { mailbox, count, status }: { mailbox: Mailbox; count: number; status: { live: boolean; line: string } }
) {
  return (
    <div className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-glacier px-5">
      <BrandLogo brand={mailbox.provider} name={PROVIDER_LABEL[mailbox.provider]} size={14} />
      <span className="min-w-0 truncate font-medium text-sm text-ink-2">{mailbox.address}</span>
      <span className="text-sm text-ink-3 tabular-nums">{count}</span>
      {status.live ?
        (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
            <span className="size-1.5 rounded-full bg-signal-green" aria-hidden />
            {status.line}
          </span>
        ) :
        (
          <Link
            to="/settings/integrations"
            className="ml-auto shrink-0 rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs hover:underline"
          >
            Opnieuw koppelen
          </Link>
        )}
    </div>
  )
}

/** Who the thread is with, and the menu that hands it to someone else. */
function AssignMenu({
  assignee,
  members,
  onAssign
}: {
  assignee: { id: string; name: string } | undefined
  members: ReadonlyArray<{ id: string; name: string; role: string }>
  onAssign: (memberId: string | undefined) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink"
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
          {assignee ? (assignee.id === MY_ID ? "Jij" : assignee.name.split(" ")[0]) : "Toewijzen"}
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
            <span className="min-w-0 flex-1 truncate">{m.id === MY_ID ? `${m.name} (jij)` : m.name}</span>
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
