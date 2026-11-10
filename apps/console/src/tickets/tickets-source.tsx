import { useAtomValue } from "@effect/atom-react"
import type { TicketDetail, TicketList, TicketOptions } from "@insyte/modules/tickets/domain/Tickets"
import { AreaEmpty } from "@insyte/ui/app/common/area-empty"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import type { Ticket } from "@insyte/ui/app/lib/types/domain"
import type { TicketDetailView, TicketPerson, TicketsSearch, TicketsSource } from "@insyte/ui/app/tickets/source"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useCallback, useEffect, useMemo, useState } from "react"
import { frameAtom } from "../data/frame.ts"
import { ticketAtom } from "../data/tickets.ts"
import { useGate } from "../frame/refusals.ts"
import { dueLabelOf, initialOfName, lineOf, ticketOf } from "./ticket-of.ts"
import { type Overlay, useTicketCommands } from "./ticket-writes.ts"

/*
 * The tickets screens' source in the console (M11 step 3): `Tickets.list` as the design's tickets, `Tickets.get` for
 * the modal, the team from the frame, and the server's commands, each shown on the board at once. What the server does
 * not do yet is left out, not made up: the agents' rows (M15), Samenvatten and Antwoord voorstellen (drafts, M15) and
 * Klant informeren (a mailbox, M11 step 2). Every ticket is written here by hand, so the first day's page offers that.
 */

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

const NO_TICKET = Atom.make(AsyncResult.initial<TicketDetail, never>())

const Empty = ({ onCreate }: { onCreate: () => void }) => (
  <AreaEmpty
    area="tickets"
    body="Leg een klantvraag, een levering of teamwerk vast als ticket, wijs het toe en werk het af op het bord."
    action={{ label: "Nieuw ticket", onClick: onCreate }}
    source={null}
  />
)

/** The board's tickets, with what a command will change laid over them until the server's come back. */
function useShown(rows: ReadonlyArray<Ticket>) {
  const [overlays, setOverlays] = useState<ReadonlyArray<Overlay>>([])
  // A new list from the server has every change in it, or has refused it.
  useEffect(() => setOverlays([]), [rows])
  const tickets = useMemo(() => overlays.reduce((ts, f) => f(ts), [...rows]), [rows, overlays])
  const show = useCallback((overlay: Overlay) => setOverlays((o) => [...o, overlay]), [])
  const reset = useCallback(() => setOverlays([]), [])
  return { tickets, show, reset }
}

/** The page over `Tickets.list`, with the commands the role may use. */
export function useConsoleTicketsSource(
  list: TicketList,
  options: TicketOptions | undefined,
  search: TicketsSearch,
  openTicket: (id: string | null) => void
): TicketsSource {
  const frame = value(useAtomValue(frameAtom))
  const now = useNow(60_000)
  const rows = useMemo(() => list.rows.map(ticketOf), [list])
  const { tickets, show, reset } = useShown(rows)
  const commands = useTicketCommands(show, reset)
  const gate = useGate("support", 2)
  const meId = frame?.me.memberId ?? ""

  const people = useMemo<ReadonlyArray<TicketPerson>>(
    () => frame?.teammates.map((t) => ({ id: t.id, name: t.name, initial: initialOfName(t.name) })) ?? [],
    [frame]
  )
  // Names from the tickets too, for someone who has left the team since.
  const names = useMemo(() => {
    const byId = new Map(list.rows.flatMap((r) => r.assignees.map((a) => [a.id, a.name] as const)))
    for (const p of people) byId.set(p.id, p.name)
    return byId
  }, [list, people])
  const counts = useMemo(() => new Map(list.rows.map((r) => [r.id, r.commentCount])), [list])
  const byId = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets])
  const templates = useMemo(
    () =>
      options?.templates.map((t) => ({
        id: t.id,
        label: t.label,
        template: {
          title: t.title,
          description: t.description,
          priority: t.priority,
          tags: [...t.labels],
          template: t.id
        }
      })) ?? [],
    [options]
  )

  /** One ticket for its modal: the board's row at once, its activity once `Tickets.get` is in. */
  const useTicket = (id: string | null): TicketDetailView | undefined => {
    const detail = value(useAtomValue(id === null ? NO_TICKET : ticketAtom(id)))
    const row = id === null ? undefined : byId.get(id)
    const comments = useMemo(() => detail?.comments.map((c) => lineOf(c, Date.now())) ?? [], [detail])
    const fallback = useMemo(() => (detail === undefined ? undefined : ticketOf(detail.ticket)), [detail])
    const ticket = row ?? fallback
    return useMemo(
      () => (ticket === undefined ? undefined : { ticket, comments, watching: detail?.watching ?? false }),
      [ticket, comments, detail]
    )
  }

  return {
    tickets,
    search,
    openTicket,
    isMine: (t) => t.assignee_ids.includes(meId),
    people,
    me: { id: meId, initial: initialOfName(frame?.me.name ?? "") },
    initialOf: (id) => initialOfName(names.get(id) ?? ""),
    subtitle: (t) => {
      const owner = names.get(t.assignee_ids[0] ?? "") ?? "Niet toegewezen"
      return t.related_entity ? `${owner} · ${t.related_entity.label}` : owner
    },
    dueLabel: (t) => dueLabelOf(t.due_at, now),
    commentCount: (t) => {
      const n = counts.get(t.id) ?? 0
      return n === 0 ? undefined : n
    },
    labels: options?.labels ?? [],
    templates,
    commands,
    gate,
    useTicket,
    Empty
  }
}
