import { type ComponentType, createContext, useContext } from "react"
import type { TicketView } from "../lib/ticket-source"
import type { Ticket, TicketPriority, TicketSource, TicketStatus } from "../lib/types/domain"
import type { TeamGate } from "../orders/source"

/**
 * What the tickets screens read and do, from whoever hosts them (as `returns/source.tsx` is for the returns screens):
 * the design app from its workspace store, the console from `Tickets.*` (M11 step 3). The markup is the design's; what
 * the host cannot do yet is absent and left out (the agents' rows, Samenvatten and Antwoord voorstellen until drafts,
 * Klant informeren until mailboxes), never made up. Times are ISO strings, as `lib/types/domain.ts` has them.
 */

export type { TeamGate }

/** The page's address: the open ticket, and the area panel's view or source. */
export type TicketsSearch = { ticket?: string | undefined; view?: TicketView | undefined; source?: TicketSource | undefined }

/**
 * What a change said. `plain`: the design toasts it without Undo; `quiet`: the design says nothing. A host with undo
 * tokens offers "Ongedaan maken" either way.
 */
export type Said = { label: string; detail?: string | undefined; plain?: boolean | undefined; quiet?: boolean | undefined }

/** "Nieuw ticket", as the dialog fills it in. */
export type NewTicketInput = {
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  assignee_ids: string[]
  tags: string[]
  due_at?: string
  /** The template it was started from, where the host keeps them. */
  template?: string
}

/** A teammate, as the menus, the discs and the mention picker show them. */
export type TicketPerson = { id: string; initial: string; name: string }

/** One line in a ticket's activity, newest first. */
export type ActivityLine = {
  id: string
  authorId: string
  name: string
  initial: string
  /** Written by Insyte: the abyss disc and the tinted line. */
  insyte: boolean
  body: string
  /** When, as the activity says it: "zojuist", "2 uur geleden". */
  at: string
}

/** One ticket as its modal shows it. */
export type TicketDetailView = {
  ticket: Ticket
  comments: ReadonlyArray<ActivityLine>
  watching: boolean
}

/** One ticket's change, as the modal and the board make it: the fields the design's `patch` set. */
export type TicketPatch = Partial<
  Pick<
    Ticket,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "tags"
    | "assignee_ids"
    | "due_at"
    | "snoozed_until"
    | "archived_at"
    | "deleted_at"
    | "spam_at"
  >
>

/** The selection bar's changes: one for many tickets, one Undo. */
export type BulkChange =
  | { status: TicketStatus }
  | { priority: TicketPriority }
  | { aside: "archived" | "spam" | "trash" | "snoozed" }
  | { putBack: true }

export interface TicketCommands {
  create: (input: NewTicketInput, said: Said) => void
  edit: (ticket: Ticket, patch: TicketPatch, said?: Said) => void
  bulk: (rows: ReadonlyArray<Ticket>, change: BulkChange, said: Said) => void
  /** A drag within a column: its cards in their new order. */
  reorder: (status: TicketStatus, ids: ReadonlyArray<string>) => void
  watch: (ticket: Ticket, on: boolean) => void
  duplicate: (ticket: Ticket) => void
  comment: (ticket: Ticket, body: string, mentions: ReadonlyArray<TicketPerson>) => void
}

export interface TicketsSource {
  /** Every ticket the role may see, set aside or not; the screens pick the view. */
  tickets: ReadonlyArray<Ticket>
  search: TicketsSearch
  /** Opens a ticket over the page, or closes it with `null`. */
  openTicket: (id: string | null) => void
  /** Aan mij toegewezen. */
  isMine: (t: Ticket) => boolean
  people: ReadonlyArray<TicketPerson>
  /** The viewer, for the comment composer's disc. */
  me: { id: string; initial: string }
  /** An assignee's disc: on the card, and in the list's column. */
  initialOf: (id: string, where: "card" | "list") => string
  /** The card's second line: who has it, and what it is about. */
  subtitle: (t: Ticket) => string
  /** The card's deadline; absent, the card shows none. */
  dueLabel: (t: Ticket) => string | undefined
  /** The card's comment count; absent, the card shows none. */
  commentCount: (t: Ticket) => number | undefined
  /** What the label menus and "Nieuw ticket" offer. */
  labels: ReadonlyArray<string>
  /** The split button's templates, after "Leeg ticket". */
  templates: ReadonlyArray<{ id: string; label: string; template: Partial<NewTicketInput> }>
  commands: TicketCommands
  /** Klantenservice · Bewerken: "Nieuw ticket" and the column's "+". */
  gate: TeamGate
  /** One ticket with its activity; `undefined` while there is none by that id. */
  useTicket: (id: string | null) => TicketDetailView | undefined
  /** The first day's page, with its way to write the first ticket. */
  Empty: ComponentType<{ onCreate: () => void }>
  /** The list's closing section, where the host has its figures. */
  Closing?: ComponentType<{ empty: boolean }> | undefined
  /** The agents' rows in a ticket ("Wat Insyte hier deed"); absent where there are no agents yet. */
  agents?: { Rows: ComponentType<{ id: string }> } | undefined
  /** "Samenvatten" and "Antwoord voorstellen (AI)"; absent until drafts arrive. */
  drafts?: boolean | undefined
  /** "Klant informeren"; absent until a mailbox can send it. */
  notifyCustomer?: boolean | undefined
}

const Context = createContext<TicketsSource | null>(null)

export const TicketsSourceProvider = Context.Provider

export function useTicketsSource(): TicketsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The tickets screens need a TicketsSourceProvider around them.")
  return source
}
