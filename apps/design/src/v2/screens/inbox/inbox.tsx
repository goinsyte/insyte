import { useMemo, useState } from "react"
import {
  channelLabel,
  CHANNELS,
  isOpen,
  LONG_WAIT,
  minutes,
  PRIORITY,
  TICKET_STATUS,
  waited,
  waitedMinutes
} from "../../fixtures/inbox.ts"
import type { Channel, Priority, Ticket, TicketStatus } from "../../fixtures/inbox.ts"
import { PEOPLE, TODAY } from "../../fixtures/workspace.ts"
import { Link, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { AddFilter, FilterChip } from "../../ui/filters.tsx"
import type { FilterField } from "../../ui/filters.tsx"
import { Inbox, Plus } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"

import { Skeleton, SkeletonText } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { ChannelGlyph, MY_KEY, Panes, TicketStatusTag } from "./parts.tsx"
import { customerName } from "./record.tsx"
import { useTickets } from "./store.ts"
import { TicketDetail } from "./ticket.tsx"

/** The inbox's saved views, as the menu and `?weergave=` name them. */
export const VIEWS = {
  open: "Inbox",
  mij: "Aan mij toegewezen",
  "niet-toegewezen": "Niet toegewezen",
  wacht: "Wacht langer dan 4 uur",
  klaar: "Klaar vandaag"
} as const

export type ViewId = keyof typeof VIEWS

export const isView = (v: string | null): v is ViewId => v !== null && v in VIEWS

export function inView(t: Ticket, view: ViewId): boolean {
  switch (view) {
    case "open":
      return isOpen(t)
    case "mij":
      return isOpen(t) && t.assignee === MY_KEY
    case "niet-toegewezen":
      return isOpen(t) && t.assignee === null
    case "wacht":
      return isOpen(t) && (waitedMinutes(t) ?? 0) > LONG_WAIT
    case "klaar":
      return t.status === "klaar"
  }
}

const isChannel = (v: string | null): v is Channel => CHANNELS.some((c) => c.id === v)

/** Longest waiting first; then the newest. A ticket waiting on someone else sinks below those waiting on us. */
const byWait = (a: Ticket, b: Ticket) =>
  (waitedMinutes(b) ?? -1) - (waitedMinutes(a) ?? -1) || minutes(b.createdAt) - minutes(a.createdAt)

const FIELDS: ReadonlyArray<FilterField> = [
  { key: "status", label: "Status", options: ["Nieuw", "Bezig", "Wacht op antwoord"] },
  { key: "prioriteit", label: "Prioriteit", options: ["Hoog", "Gemiddeld", "Laag"] }
]

const statusOf = (label: string | null) =>
  (Object.keys(TICKET_STATUS) as ReadonlyArray<TicketStatus>).find((s) => TICKET_STATUS[s].label === label)
const priorityOf = (label: string | null) =>
  (Object.keys(PRIORITY) as ReadonlyArray<Priority>).find((p) => PRIORITY[p].label === label)

/**
 * The inbox: every customer conversation in one list (mail, WhatsApp, Instagram, the store chats a
 * person took over), the ones waiting longest on top, and the conversation it opens beside it. The
 * views (mine, unassigned, waiting over four hours) and the channel come from the menu and stay in
 * the address; the list's own filters too. The current demo's `/inbox` and its ticket, as one place.
 */
export function InboxScreen({ ticketId, search }: { readonly ticketId: string | null; readonly search: string }) {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("support")
  const tickets = useTickets()
  const weergave = useQuery("weergave")
  const kanaal = useQuery("kanaal")
  const status = useQuery("status")
  const prioriteit = useQuery("prioriteit")
  const [q, setQ] = useState("")
  const current: ViewId = isView(weergave) ? weergave : "open"
  const channel = isChannel(kanaal) ? kanaal : null

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const s = statusOf(status)
    const p = priorityOf(prioriteit)
    return tickets
      .filter((t) => inView(t, current))
      .filter((t) => channel === null || t.channel === channel)
      .filter((t) => s === undefined || t.status === s)
      .filter((t) => p === undefined || t.priority === p)
      .filter((t) =>
        term === "" ||
        t.subject.toLowerCase().includes(term) ||
        customerName(t).toLowerCase().includes(term) ||
        t.number.includes(term.replace("#", ""))
      )
      .toSorted(byWait)
  }, [tickets, current, channel, status, prioriteit, q])

  if (!access.view) {
    return (
      <div className="pane-scroll flex-1">
        <h1 className="sr-only">Inbox</h1>
        <Denied area="support" what="de inbox" />
      </div>
    )
  }

  const title = channel === null ?
    VIEWS[current] :
    `${VIEWS[current] === "Inbox" ? "" : `${VIEWS[current]} · `}${channelLabel(channel)}`
  const active = ticketId === null ? undefined : tickets.find((t) => t.number === ticketId)
  const back = `${paths.inbox}${search}`
  const activeFilters = new Set([
    ...(status === null ? [] : [`status:${status}`]),
    ...(prioriteit === null ? [] : [`prioriteit:${prioriteit}`])
  ])

  const list = (
    <section aria-labelledby="inbox-lijst" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-2 px-1">
          {ticketId === null
            ? (
              <h1 id="inbox-lijst" className="text-md font-semibold text-ink">
                {title}
              </h1>
            )
            : (
              <h2 id="inbox-lijst" className="text-md font-semibold text-ink">
                {title}
              </h2>
            )}
          {state === "ready" && <span className="figure text-xs text-ink-3">{shown.length}</span>}
        </div>
        <SearchField value={q} onChange={setQ} label="Gesprekken zoeken" placeholder="Zoek op naam, onderwerp of #" />
        <div className="flex flex-wrap items-center gap-1.5">
          <AddFilter
            fields={FIELDS}
            active={activeFilters}
            onAdd={(field, value) => setQuery({ [field]: activeFilters.has(`${field}:${value}`) ? null : value })}
          />
          {status !== null && <FilterChip field="Status" value={status} onRemove={() => setQuery({ status: null })} />}
          {prioriteit !== null && (
            <FilterChip
              field="Prioriteit"
              value={prioriteit}
              onRemove={() => setQuery({ prioriteit: null })}
            />
          )}
        </div>
      </div>
      <div className="pane-scroll min-h-0 flex-1 px-2 pb-3">
        {state === "loading"
          ? <ListSkeleton />
          : state === "error"
          ? (
            <ErrorState
              size="sm"
              title="De gesprekken kwamen niet binnen"
              detail="GET /threads · 503 · req_7f2c1a"
              action={<Button size="sm" onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
            >
              De mailbox antwoordde niet. Wat al binnen was, staat nog in de mailbox.
            </ErrorState>
          )
          : state === "empty"
          ? (
            <EmptyState size="sm" glyph={Inbox} title="Nog niets binnen">
              Koppel je support-mailbox, WhatsApp of Instagram, dan komen de berichten hier.
            </EmptyState>
          )
          : shown.length === 0
          ? (
            <EmptyState size="sm" title={q === "" ? "Niets in deze weergave" : `Geen gesprek gevonden voor ‘${q}’`}>
              {q === ""
                ? "Alles is beantwoord of staat in een andere weergave."
                : "Zoek op een naam, een onderwerp of een ticketnummer."}
            </EmptyState>
          )
          : (
            <ul aria-label={`Gesprekken in ${title}`} className="flex flex-col gap-px">
              {shown.map((t) => <ThreadRow key={t.number} t={t} active={t.number === ticketId} search={search} />)}
            </ul>
          )}
      </div>
    </section>
  )

  const detail = state !== "ready"
    ? (
      <div className="pane-scroll flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 pt-6" aria-busy={state === "loading"}>
          {state === "loading" && (
            <>
              <Skeleton className="h-6 w-2/3" />
              <SkeletonText lines={4} />
              <SkeletonText lines={3} />
            </>
          )}
          {state === "empty" && (
            <EmptyState glyph={Inbox} title="Je inbox is nog leeg" action={<FirstDayActions />}>
              Insyte leest je support-mailbox mee, zet elk gesprek als ticket in de lijst en koppelt het aan de
              bestelling en de klant.
            </EmptyState>
          )}
        </div>
      </div>
    )
    : active !== undefined
    ? <TicketDetail key={active.number} t={active} all={tickets} edit={access.edit} back={back} />
    : ticketId !== null
    ? (
      <div className="pane-scroll flex-1">
        <h1 className="sr-only">Ticket #{ticketId}</h1>
        <EmptyState
          glyph={Inbox}
          title={`Ticket #${ticketId} bestaat niet`}
          action={<ButtonLink to={back}>Naar de inbox</ButtonLink>}
        >
          Misschien is het samengevoegd of verwijderd.
        </EmptyState>
      </div>
    )
    : <Overview tickets={tickets} search={search} />

  return <Panes list={list} detail={detail} show={ticketId === null ? "list" : "detail"} listWidth="21rem" />
}

function FirstDayActions() {
  return (
    <>
      <ButtonLink to={paths.settings("koppelingen")} variant="primary">Mailbox koppelen</ButtonLink>
      <ButtonLink to={`${paths.tickets}?nieuw=1`} icon={<Plus />}>Nieuw ticket</ButtonLink>
    </>
  )
}

/** One conversation in the list: who, how long they wait, what about, where and who has it. */
function ThreadRow({ t, active, search }: { readonly t: Ticket; readonly active: boolean; readonly search: string }) {
  const mins = waitedMinutes(t)
  const long = (mins ?? 0) > LONG_WAIT
  const name = customerName(t)
  return (
    <li>
      <Link
        to={`${paths.ticket(t.number)}${search}`}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors",
          active ? "bg-selected" : "hover:bg-hover"
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className={cx("min-w-0 flex-1 truncate text-sm", t.unread ? "font-semibold text-ink" : "text-ink")}>
            {name}
          </span>
          {t.unread && <span className="size-1.5 shrink-0 self-center rounded-full bg-accent" aria-label="Ongelezen" />}
          <span className="shrink-0 text-xs">
            {mins === null
              ? <span className="figure text-ink-3">{t.entries.at(-1)?.at ?? t.createdAt}</span>
              : (
                <span className={cx("figure", long ? "font-medium text-warn-ink" : "text-ink-3")}>
                  <span className="sr-only">wacht</span>
                  {waited(mins)}
                </span>
              )}
          </span>
        </span>
        <span className="truncate text-sm text-ink-2">{t.subject}</span>
        <span className="flex items-center gap-2 text-xs text-ink-3">
          <ChannelGlyph channel={t.channel} size={14} />
          <span className="figure">#{t.number}</span>
          <TicketStatusTag status={t.status} />
          <span className="ml-auto flex items-center">
            {t.assignee === null
              ? <span>Niet toegewezen</span>
              : <Avatar name={PEOPLE[t.assignee].name} size={18} on="panel" />}
          </span>
        </span>
      </Link>
    </li>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Gesprekken laden" className="flex flex-col gap-3 px-3 pt-2">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="flex flex-col gap-1.5 py-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-1/3" />
        </span>
      ))}
    </div>
  )
}

/**
 * With no conversation open on a wide screen: how the inbox stands today and what to take first,
 * instead of opening the top one for you.
 */
function Overview({ tickets, search }: { readonly tickets: ReadonlyArray<Ticket>; readonly search: string }) {
  const open = tickets.filter(isOpen)
  const long = open.filter((t) => (waitedMinutes(t) ?? 0) > LONG_WAIT).toSorted(byWait)
  const mine = open.filter((t) => t.assignee === MY_KEY)
  const agentsDone = tickets.filter((t) => t.status === "klaar")
  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-9 px-8 py-10">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-ink">
            <span className="figure">{open.length}</span> open tickets
          </h2>
          <p className="text-sm text-pretty text-ink-2">
            <span className="figure">{long.length}</span> {long.length === 1 ? "klant wacht" : "klanten wachten"}{" "}
            langer dan 4 uur
            {long[0] !== undefined && (
              <>
                , het langst {customerName(long[0])}{" "}
                (<span className="figure">{waited(waitedMinutes(long[0]) ?? 0)}</span>)
              </>
            )}
            . Eerste reactie vandaag gemiddeld <span className="figure">{TODAY.firstReply}</span> min.
          </p>
        </div>

        {long.length > 0 && (
          <section aria-labelledby="langst" className="flex flex-col gap-2">
            <h3 id="langst" className="text-sm font-semibold text-ink">Wacht het langst</h3>
            <List>
              {long.map((t) => (
                <ListRow
                  key={t.number}
                  href={`${paths.ticket(t.number)}${search}`}
                  lead={<Avatar name={customerName(t)} size={28} />}
                  title={`${customerName(t)} · ${t.subject}`}
                  meta={`#${t.number} · via ${channelLabel(t.channel)} · ${
                    t.assignee === null ? "niet toegewezen" : PEOPLE[t.assignee].name
                  }`}
                  trail={<span className="figure font-medium text-warn-ink">{waited(waitedMinutes(t) ?? 0)}</span>}
                />
              ))}
            </List>
          </section>
        )}

        {mine.length > 0 && (
          <section aria-labelledby="voor-jou" className="flex flex-col gap-2">
            <h3 id="voor-jou" className="text-sm font-semibold text-ink">Aan jou toegewezen</h3>
            <List>
              {mine.toSorted(byWait).map((t) => (
                <ListRow
                  key={t.number}
                  href={`${paths.ticket(t.number)}${search}`}
                  lead={<ChannelGlyph channel={t.channel} size={24} tile className="w-7 justify-center" />}
                  title={t.subject}
                  meta={`#${t.number} · ${customerName(t)}${t.deadline === undefined ? "" : ` · ${t.deadline.text}`}`}
                  trail={<TicketStatusTag status={t.status} />}
                />
              ))}
            </List>
          </section>
        )}

        <p className="text-sm text-ink-3">
          De agents handelden vandaag <span className="figure">{agentsDone.length}</span> tickets zelf af.{" "}
          <Link to={`${paths.inbox}?weergave=klaar`} className="text-ink-2 underline underline-offset-2 hover:text-ink">
            Bekijk ze
          </Link>
        </p>
      </div>
    </div>
  )
}
