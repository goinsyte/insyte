import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { RecordAgentRows } from "../ask/agent-parts"
import { isAssignedTo, ME } from "../lib/assignees"
import { patchMany } from "../lib/bulk"
import type { Ticket } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { DemoAreaEmpty, ListClosing } from "../marketing-sections/closings"
import { useGate } from "../stores/access-store"
import { useWorkspace } from "../stores/workspace-store"
import {
  type ActivityLine,
  type BulkChange,
  type NewTicketInput,
  type Said,
  type TicketCommands,
  type TicketDetailView,
  type TicketPatch,
  type TicketsSource,
  TicketsSourceProvider
} from "./source"
import { ticketsStore, useTickets } from "./tickets-store"

/*
 * The tickets screens over the design app's workspace store, as they were before the seam (`source.tsx`): the seed's
 * four people by their initials, its owners and deadlines, the two comments every ticket opens with, the templates,
 * and the store's own changes with the design's toasts. Watching and comments stay in the modal, as they did.
 */

const Route = Object.assign(getRouteApi("/_admin/tickets/"), { fullPath: "/tickets/" } as const)

const TEAM = [
  { id: "e", initial: "E", name: "Ethan Jones" },
  { id: "s", initial: "C", name: "Sophie Chang" },
  { id: "l", initial: "L", name: "Liam Thompson" },
  { id: "m", initial: "N", name: "Maya Rossi" }
]

const CARD_INITIAL: Record<string, string> = { e: "E", s: "C", l: "L", m: "N" }

const OWNER: Record<string, string> = {
  e: "Ethan J. · Allure FR",
  s: "Sophie Chang · Allure US",
  l: "Liam T. · Allure IT",
  m: "Maya Rossi · Allure DE"
}

const LABELS = [
  "Productontwerp",
  "Klantenservice",
  "Leveringsketen",
  "Feedback",
  "Bestelbevestiging",
  "Opgelost",
  "Vertaling",
  "Terugbetalingen",
  "Geschillen"
]

/** The three tickets an operator writes most, started rather than written from nothing. */
const TEMPLATES: TicketsSource["templates"] = [
  {
    id: "refund",
    label: "Verzoek om terugbetaling",
    template: {
      title: "Verzoek om terugbetaling · ",
      description:
        "De klant vraagt om een terugbetaling. Controleer of de bestelling binnen de retourtermijn valt en of het artikel terug is, betaal dan terug en antwoord de klant.",
      priority: "medium",
      tags: ["Terugbetaling"]
    }
  },
  {
    id: "supplier",
    label: "Escalatie naar leverancier",
    template: {
      title: "Vertraging bij leverancier · ",
      description:
        "Een bestelling is over de overdrachtsdatum heen. Vraag de leverancier om een verzenddatum en track & trace, en laat het de klant weten zodra je die hebt.",
      priority: "high",
      tags: ["Leverancier"]
    }
  },
  {
    id: "feedback",
    label: "Feedback van klant",
    template: {
      title: "Feedback van klant · ",
      description:
        "Feedback die het doorgeven waard is. Noteer wat er gezegd is, waar, en wie in het team het moet zien.",
      priority: "low",
      tags: ["Feedback"]
    }
  }
]

/** The two comments the modal opened every ticket with. */
const seededComments = (): Array<ActivityLine> => [
  {
    id: "c1",
    authorId: "s",
    name: "Sophie Chang",
    initial: "C",
    insyte: false,
    body: "Klant gevraagd om meer context, wacht op antwoord over het verzendadres.",
    at: "2 uur geleden"
  },
  {
    id: "c2",
    authorId: "e",
    name: "Ethan Jones",
    initial: "E",
    insyte: false,
    body:
      "@Liam van de leveringsketen erbij gehaald · hij bevestigt dat de SKU weer op voorraad is in het EU-magazijn.",
    at: "gisteren"
  }
]

const subtitle = (t: Ticket) => {
  const owner = OWNER[t.assignee_ids[0] ?? ""] ?? "Niet toegewezen"
  return t.related_entity ? `${owner} · ${t.related_entity.label}` : owner
}

/** The seed's deadlines, read from the id's last character. */
const dueLabel = (t: Ticket) => {
  if (t.status === "done") return "Vandaag"
  const seed = t.id.charCodeAt(t.id.length - 1)
  const labels = ["Vandaag", "Morgen", "Volgende week", "Gisteren"]
  return labels[seed % labels.length]
}

const said = (s: Said | undefined, undo: () => void) => {
  if (s === undefined || s.quiet) return
  if (s.plain) return void toast.success(s.label, s.detail === undefined ? undefined : { description: s.detail })
  undoable(s.label, undo, s.detail)
}

const BULK = (change: BulkChange) => (t: Ticket): Ticket => {
  if ("status" in change) return { ...t, status: change.status }
  if ("priority" in change) return { ...t, priority: change.priority }
  if ("putBack" in change) {
    return { ...t, snoozed_until: undefined, archived_at: undefined, deleted_at: undefined, spam_at: undefined }
  }
  const now = new Date().toISOString()
  switch (change.aside) {
    case "archived":
      return { ...t, archived_at: now }
    case "spam":
      return { ...t, spam_at: now }
    case "trash":
      return { ...t, deleted_at: now }
    case "snoozed":
      return { ...t, snoozed_until: new Date(Date.now() + 86_400_000).toISOString() }
  }
}

const COMMANDS: TicketCommands = {
  create: (input: NewTicketInput, s) => {
    const now = new Date().toISOString()
    const t: Ticket = {
      id: `ticket_new_${Date.now()}`,
      number: `TKT-${String(900 + ticketsStore.get().length + 1).padStart(4, "0")}`,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      assignee_ids: input.assignee_ids,
      due_at: input.due_at,
      created_at: now,
      updated_at: now
    }
    ticketsStore.add(t)
    said(s, () => ticketsStore.remove(t.id))
  },
  edit: (t, patch: TicketPatch, s) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof Ticket]])) as Partial<Ticket>
    ticketsStore.update(t.id, { ...patch, updated_at: new Date().toISOString() })
    said(s, () => ticketsStore.update(t.id, before))
  },
  bulk: (rows, change, s) => patchMany("tickets", rows.map((t) => t.id), BULK(change), s.label),
  reorder: (status, ids) => ticketsStore.reorder(status, [...ids]),
  // The demo kept who follows a ticket, and its comments, in the modal.
  watch: () => {},
  duplicate: (t) => {
    const copy = useWorkspace.getState().createTicket({
      title: `${t.title} (kopie)`,
      description: t.description,
      priority: t.priority,
      tags: t.tags,
      ...(t.related_entity ? { related_entity: t.related_entity } : {})
    })
    toast.success(`Gedupliceerd als ${copy.number}`)
  },
  comment: () => {}
}

function useDemoTicket(id: string | null): TicketDetailView | undefined {
  const all = useTickets()
  const ticket = useMemo(() => (id ? all.find((t) => t.id === id) : undefined), [id, all])
  // A fresh pair of comments whenever the ticket changes, as the modal used to set them.
  return useMemo(() => (ticket ? { ticket, comments: seededComments(), watching: false } : undefined), [ticket])
}

const isMine = (t: Ticket) => isAssignedTo(t.assignee_ids, ME)
const initialOf = (id: string, where: "card" | "list") =>
  where === "card" ? CARD_INITIAL[id] ?? "?" : id.slice(0, 2).toUpperCase()
const commentCount = (t: Ticket) => (t.status === "done" && t.id.endsWith("0") ? 6 : undefined)
const AGENTS = { Rows: ({ id }: { id: string }) => <RecordAgentRows kind="ticket" id={id} /> }
const Empty = () => <DemoAreaEmpty area="tickets" />
const Closing = ({ empty }: { empty: boolean }) => <ListClosing area="tickets" empty={empty} />

/** The tickets screens over the design app's stores. */
export function DemoTicketsSource({ children }: { children: ReactNode }) {
  const tickets = useTickets()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const gate = useGate("support", 2)
  const source: TicketsSource = {
    tickets,
    search,
    openTicket: (id) => void navigate({ search: (s) => ({ ...s, ticket: id ?? undefined }) }),
    isMine,
    people: TEAM,
    me: { id: "m", initial: "N" },
    initialOf,
    subtitle,
    dueLabel,
    commentCount,
    labels: LABELS,
    templates: TEMPLATES,
    commands: COMMANDS,
    gate,
    useTicket: useDemoTicket,
    Empty,
    Closing,
    agents: AGENTS,
    drafts: true,
    notifyCustomer: true
  }
  return <TicketsSourceProvider value={source}>{children}</TicketsSourceProvider>
}
