import { useMemo, useState } from "react"
import type { DragEvent } from "react"
import {
  channelLabel,
  LONG_WAIT,
  PRIORITY,
  STATUS_ORDER,
  TEMPLATES,
  TICKET_STATUS,
  waited,
  waitedMinutes
} from "../../fixtures/inbox.ts"
import type { Priority, Ticket, TicketStatus } from "../../fixtures/inbox.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { AddFilter, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { FilterField } from "../../ui/filters.tsx"
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  LayoutGrid,
  List as ListGlyph,
  Plus,
  Ticket as TicketGlyph
} from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { inView, isView, VIEWS } from "./inbox.tsx"
import type { ViewId } from "./inbox.tsx"
import { NewTicketDialog } from "./new-ticket.tsx"
import { ChannelGlyph, PriorityTag, setStatus, TicketStatusTag } from "./parts.tsx"
import { customerName } from "./record.tsx"
import { patchTicket, useTickets } from "./store.ts"

const COLUMN_LABEL: Readonly<Record<TicketStatus, string>> = {
  nieuw: "Nieuw",
  bezig: "Bezig",
  wacht: "Wacht op antwoord",
  klaar: "Klaar · vandaag"
}

const FIELDS: ReadonlyArray<FilterField> = [
  { key: "prioriteit", label: "Prioriteit", options: ["Hoog", "Gemiddeld", "Laag"] },
  { key: "kanaal", label: "Kanaal", options: ["E-mail", "WhatsApp", "Instagram", "Winkelchat"] }
]

const priorityOf = (label: string | null) =>
  (Object.keys(PRIORITY) as ReadonlyArray<Priority>).find((p) => PRIORITY[p].label === label)

/**
 * The tickets as work: a board with a column per status (drag a card, or move it from its menu) or
 * a table to work through many at once. "Nieuw ticket" starts from nothing or from a template;
 * `?nieuw=1` opens it, which is where the shell's Nieuw → Ticket goes. The current demo's
 * `/tickets` board, list and new-ticket dialog.
 */
export function TicketsScreen() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("support")
  const tickets = useTickets()
  const mode = useQuery("weergave-als") === "lijst" ? "lijst" : "bord"
  const weergave = useQuery("weergave")
  const current: ViewId = isView(weergave) && weergave !== "klaar" ? weergave : "open"
  const prioriteit = useQuery("prioriteit")
  const kanaal = useQuery("kanaal")
  const nieuw = useQuery("nieuw")
  const [template, setTemplate] = useState<string | undefined>(undefined)
  const [column, setColumn] = useState<TicketStatus>("nieuw")
  const [q, setQ] = useState("")

  const shown = useMemo(() => {
    const p = priorityOf(prioriteit)
    const term = q.trim().toLowerCase()
    return tickets
      .filter((t) => t.status === "klaar" || inView(t, current))
      .filter((t) => current === "open" || t.status !== "klaar")
      .filter((t) => p === undefined || t.priority === p)
      .filter((t) => kanaal === null || channelLabel(t.channel) === kanaal)
      .filter((t) =>
        term === "" || t.subject.toLowerCase().includes(term) || customerName(t).toLowerCase().includes(term) ||
        t.number.includes(term.replace("#", ""))
      )
  }, [tickets, current, prioriteit, kanaal, q])
  const openCount = shown.filter((t) => t.status !== "klaar").length

  if (!access.view) {
    return (
      <Page>
        <h1 className="sr-only">Tickets</h1>
        <Denied area="support" what="de tickets" />
      </Page>
    )
  }

  const startNew = (from?: string, status: TicketStatus = "nieuw") => {
    setTemplate(from)
    setColumn(status)
    setQuery({ nieuw: "1" })
  }
  const active = new Set([
    ...(prioriteit === null ? [] : [`prioriteit:${prioriteit}`]),
    ...(kanaal === null ? [] : [`kanaal:${kanaal}`])
  ])

  return (
    <Page width="full" className="max-w-[1400px]">
      <PageHead
        title={current === "open" ? "Tickets" : VIEWS[current]}
        meta={state === "ready"
          ? (
            <>
              <span className="figure">{openCount}</span> open
              {current === "open" && (
                <>
                  {" "}· <span className="figure">{tickets.filter((t) => t.status === "klaar").length}</span>{" "}
                  klaar vandaag
                </>
              )}
            </>
          )
          : undefined}
        actions={
          <>
            <Segmented
              label="Weergave"
              size="sm"
              value={mode}
              onChange={(next) => setQuery({ "weergave-als": next === "lijst" ? "lijst" : null })}
              options={[
                { value: "bord", label: "Bord", icon: <LayoutGrid size={14} /> },
                { value: "lijst", label: "Lijst", icon: <ListGlyph size={14} /> }
              ]}
            />
            {access.edit && (
              <span className="flex">
                <Button variant="primary" icon={<Plus />} onClick={() => startNew()} className="rounded-r-none">
                  Nieuw ticket
                </Button>
                <DropdownMenu
                  label="Sjablonen"
                  placement="bottom-end"
                  width="w-60"
                  trigger={(props) => (
                    <button
                      type="button"
                      aria-label="Nieuw ticket uit een sjabloon"
                      className="inline-flex h-8 items-center rounded-r-sm border-l border-on-ink/20 bg-ink px-1.5 text-on-ink hover:bg-ink/88"
                      {...props}
                    >
                      <ChevronDown size={15} />
                    </button>
                  )}
                >
                  <DropdownLabel>Sjablonen</DropdownLabel>
                  <DropdownItem onSelect={() => startNew()}>Leeg ticket</DropdownItem>
                  <DropdownSeparator />
                  {TEMPLATES.map((t) => (
                    <DropdownItem key={t.id} onSelect={() => startNew(t.id)}>{t.label}</DropdownItem>
                  ))}
                </DropdownMenu>
              </span>
            )}
          </>
        }
      />

      {!access.edit && <ReadOnlyNotice area="support" />}

      {state === "ready" && (
        <ListToolbar
          start={
            <>
              <SearchField
                value={q}
                onChange={setQ}
                label="Tickets zoeken"
                placeholder="Tickets zoeken"
                className="w-full sm:w-64"
              />
              <AddFilter
                fields={FIELDS}
                active={active}
                onAdd={(field, value) => setQuery({ [field]: active.has(`${field}:${value}`) ? null : value })}
              />
              {prioriteit !== null && (
                <FilterChip
                  field="Prioriteit"
                  value={prioriteit}
                  onRemove={() => setQuery({ prioriteit: null })}
                />
              )}
              {kanaal !== null && (
                <FilterChip
                  field="Kanaal"
                  value={kanaal}
                  onRemove={() => setQuery({ kanaal: null })}
                />
              )}
            </>
          }
        />
      )}

      {state === "loading"
        ? <BoardSkeleton />
        : state === "error"
        ? (
          <ErrorState
            title="De tickets kwamen niet binnen"
            detail="GET /tickets · 503 · req_91be04"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Er ging niets verloren; de tickets staan er zodra de verbinding terug is.
          </ErrorState>
        )
        : state === "empty"
        ? (
          <EmptyState
            glyph={TicketGlyph}
            title="Nog geen tickets"
            action={access.edit && (
              <Button variant="primary" icon={<Plus />} onClick={() => startNew()}>Nieuw ticket</Button>
            )}
          >
            Elk gesprek in de inbox wordt een ticket. Je kunt er ook zelf een maken voor werk dat geen klant begon: een
            leverancier opvolgen, een producttekst vertalen.
          </EmptyState>
        )
        : mode === "bord"
        ? <Board tickets={shown} edit={access.edit} onNew={(s) => startNew(undefined, s)} />
        : <TicketTable tickets={shown} edit={access.edit} />}

      <NewTicketDialog
        open={nieuw === "1" && access.edit}
        template={template}
        status={column}
        onClose={() => {
          setTemplate(undefined)
          setColumn("nieuw")
          setQuery({ nieuw: null })
        }}
      />
    </Page>
  )
}

/* ── board ─────────────────────────────────────────────────────────────────────────────────────── */

function Board({ tickets, edit, onNew }: {
  readonly tickets: ReadonlyArray<Ticket>
  readonly edit: boolean
  readonly onNew: (status: TicketStatus) => void
}) {
  const [over, setOver] = useState<TicketStatus | null>(null)
  const drop = (event: DragEvent, status: TicketStatus) => {
    event.preventDefault()
    setOver(null)
    const number = event.dataTransfer.getData("text/plain")
    const t = tickets.find((x) => x.number === number)
    if (t !== undefined) setStatus(t, status)
  }
  return (
    <div className="grid gap-x-5 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
      {STATUS_ORDER.map((status) => {
        const cards = tickets.filter((t) => t.status === status)
        return (
          <section
            key={status}
            aria-labelledby={`kolom-${status}`}
            onDragOver={edit ?
              (event) => {
                event.preventDefault()
                setOver(status)
              } :
              undefined}
            onDragLeave={() => setOver(null)}
            onDrop={edit ? (event) => drop(event, status) : undefined}
            className={cx(
              "flex min-w-0 flex-col gap-2 rounded-lg transition-colors",
              over === status && "bg-accent-tint"
            )}
          >
            <header className="flex h-8 items-center justify-between gap-2 px-1">
              <h2 id={`kolom-${status}`} className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                {COLUMN_LABEL[status]}
                <span className="figure text-xs font-normal text-ink-3">{cards.length}</span>
              </h2>
              {edit && status !== "klaar" && (
                <button
                  type="button"
                  aria-label={`Nieuw ticket in ${COLUMN_LABEL[status]}`}
                  title={`Nieuw ticket in ${COLUMN_LABEL[status]}`}
                  onClick={() => onNew(status)}
                  className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                >
                  <Plus size={15} />
                </button>
              )}
            </header>
            {cards.length === 0
              ? <p className="rounded-md bg-well/60 px-3 py-6 text-center text-xs text-ink-3">Hier staat niets</p>
              : (
                <ul className="flex flex-col gap-2">
                  {cards.map((t) => <Card key={t.number} t={t} edit={edit} />)}
                </ul>
              )}
          </section>
        )
      })}
    </div>
  )
}

function Card({ t, edit }: { readonly t: Ticket; readonly edit: boolean }) {
  const mins = waitedMinutes(t)
  return (
    <li
      draggable={edit}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", t.number)
        event.dataTransfer.effectAllowed = "move"
      }}
      className={cx(
        "group relative flex flex-col gap-2 rounded-md bg-panel p-3 transition-colors hover:bg-hover",
        edit && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          to={paths.ticket(t.number)}
          className="min-w-0 flex-1 text-sm font-medium text-pretty text-ink after:absolute after:inset-0 after:rounded-md"
        >
          {t.subject}
        </Link>
        {edit && (
          <span className="relative z-10">
            <DropdownMenu
              label="Verplaatsen"
              placement="bottom-end"
              width="w-52"
              trigger={(props) => (
                <button
                  type="button"
                  aria-label={`#${t.number} verplaatsen`}
                  className="-mt-1 -mr-1 inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-canvas hover:text-ink pointer-coarse:size-11"
                  {...props}
                >
                  <ChevronDown size={14} />
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
          </span>
        )}
      </div>
      <p className="truncate text-xs text-ink-2">{customerName(t)}</p>
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <ChannelGlyph channel={t.channel} size={14} />
        <span className="figure">#{t.number}</span>
        {t.priority === "hoog" && <PriorityTag priority={t.priority} />}
        {mins !== null && (
          <span className={cx("figure", mins > LONG_WAIT ? "font-medium text-warn-ink" : undefined)}>
            {waited(mins)}
          </span>
        )}
        <span className="ml-auto">
          {t.assignee === null
            ? <span className="sr-only">Niet toegewezen</span>
            : <Avatar name={PEOPLE[t.assignee].name} size={20} on="panel" />}
        </span>
      </div>
      {t.deadline !== undefined && t.status !== "klaar" && (
        <p className="flex items-center gap-1 text-xs font-medium text-bad-ink">
          <Clock size={12} />
          {t.deadline.text}
        </p>
      )}
    </li>
  )
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Tickets laden" className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {[4, 6, 2, 3].map((n, col) => (
        <div key={col} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
      ))}
    </div>
  )
}

/* ── table ─────────────────────────────────────────────────────────────────────────────────────── */

function TicketTable({ tickets, edit }: { readonly tickets: ReadonlyArray<Ticket>; readonly edit: boolean }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState<"asc" | "desc">("desc")
  const rows = tickets.toSorted((a, b) =>
    sort === "desc"
      ? (waitedMinutes(b) ?? -1) - (waitedMinutes(a) ?? -1)
      : (waitedMinutes(a) ?? 10_000) - (waitedMinutes(b) ?? 10_000)
  )
  const chosen = rows.filter((t) => picked.has(t.number))
  const bulk = (label: string, change: { status?: TicketStatus; priority?: Priority }) => {
    const before = chosen.map((t) => ({ number: t.number, status: t.status, priority: t.priority }))
    for (const t of chosen) patchTicket(t.number, change)
    setPicked(new Set())
    toast({
      title: `${chosen.length} ${chosen.length === 1 ? "ticket" : "tickets"} ${label}`,
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          for (const b of before) patchTicket(b.number, { status: b.status, priority: b.priority })
        }
      }
    })
  }
  return (
    <div className="flex flex-col gap-3">
      {edit && chosen.length > 0 && (
        <SelectionBar
          count={chosen.length}
          noun={["ticket", "tickets"]}
          onClear={() => setPicked(new Set())}
        >
          <SelectionAction icon={<CheckCircle />} onClick={() => bulk("klaar", { status: "klaar" })}>
            Markeren als klaar
          </SelectionAction>
          <SelectionAction icon={<Clock />} onClick={() => bulk("naar bezig", { status: "bezig" })}>
            Bezig
          </SelectionAction>
          <SelectionAction icon={<AlertTriangle />} onClick={() => bulk("op prioriteit hoog", { priority: "hoog" })}>
            Prioriteit hoog
          </SelectionAction>
        </SelectionBar>
      )}
      {rows.length === 0
        ? <EmptyState size="sm" title="Geen tickets voor deze filters">Pas de filters aan of wis ze.</EmptyState>
        : (
          <Table label="Tickets" minWidth={880}>
            <THead>
              {edit && (
                <Th width={36}>
                  <RowCheckbox
                    label="Alle tickets kiezen"
                    checked={chosen.length === rows.length}
                    indeterminate={chosen.length > 0 && chosen.length < rows.length}
                    onChange={(on) => setPicked(on ? new Set(rows.map((t) => t.number)) : new Set())}
                  />
                </Th>
              )}
              <Th width={84}>Ticket</Th>
              <Th>Onderwerp</Th>
              <Th width={110}>Kanaal</Th>
              <Th width={150}>Toegewezen aan</Th>
              <Th width={150}>Status</Th>
              <Th width={100}>Prioriteit</Th>
              <Th width={96} align="right" sort={sort} onSort={() => setSort(sort === "desc" ? "asc" : "desc")}>
                Wacht
              </Th>
            </THead>
            <TBody>
              {rows.map((t) => {
                const mins = waitedMinutes(t)
                return (
                  <Tr
                    key={t.number}
                    selected={picked.has(t.number)}
                    onOpen={() => navigate(paths.ticket(t.number))}
                  >
                    {edit && (
                      <Td>
                        <RowCheckbox
                          label={`#${t.number} kiezen`}
                          checked={picked.has(t.number)}
                          onChange={(on) => {
                            const next = new Set(picked)
                            if (on) next.add(t.number)
                            else next.delete(t.number)
                            setPicked(next)
                          }}
                        />
                      </Td>
                    )}
                    <Td header figure align="left">
                      <Link to={paths.ticket(t.number)} className="text-ink hover:underline">#{t.number}</Link>
                    </Td>
                    <Td>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ink">{t.subject}</span>
                        <span className="truncate text-xs text-ink-3">{customerName(t)}</span>
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <ChannelGlyph channel={t.channel} size={14} />
                        {channelLabel(t.channel)}
                      </span>
                    </Td>
                    <Td>
                      {t.assignee === null
                        ? <span className="text-ink-3">Niet toegewezen</span>
                        : (
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={PEOPLE[t.assignee].name} size={20} />
                            {PEOPLE[t.assignee].name}
                          </span>
                        )}
                    </Td>
                    <Td>
                      <TicketStatusTag status={t.status} />
                    </Td>
                    <Td>
                      <PriorityTag priority={t.priority} />
                    </Td>
                    <Td figure>
                      {mins === null
                        ? <span className="text-ink-3">—</span>
                        : (
                          <span className={mins > LONG_WAIT ? "font-medium text-warn-ink" : undefined}>
                            {waited(mins)}
                          </span>
                        )}
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        )}
    </div>
  )
}
