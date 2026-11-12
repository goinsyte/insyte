import { type ComponentType, createContext, useContext } from "react"
import type { ChannelId } from "../lib/channels"
import type { TeamGate } from "../orders/source"

/**
 * What the inbox screen reads and does, from whoever hosts it (as `tickets/source.tsx` is for the tickets screens):
 * the design app from its inbox and workspace stores, the console from `Threads.*` and `Mailboxes.*` (M11 step 2). The
 * markup is the design's. What the host cannot do yet is absent and left out, never made up: the chat channels and
 * the customer agent (M15), Insyte's drafts (M15), Gmail and Outlook (M11 step 1b). Times are ISO strings.
 */

export type { TeamGate }

export type Folder = "all" | "unassigned" | "mine" | "linked" | "archive" | "trash" | "spam"

/** A messaging channel beside the mail (PLAN 27); only the design app has them yet. */
export type ChatChannel = Exclude<ChannelId, "email">

/** The page's address, as `inbox-search.ts` reads it. */
export type InboxSearch = {
  folder?: Folder | undefined
  /** The open thread; absent, the first of the list is shown beside it. */
  thread?: string | undefined
  mailbox?: string | undefined
  channel?: ChannelId | undefined
  view?: "handed_over" | "insyte" | undefined
}

/** A mailbox, as its band in the list and the offline banner say it. */
export type InboxMailbox = {
  id: string
  address: string
  label: string
  /** The provider's logo: its key, and the name it is labelled with. */
  logo: { brand: string; name: string }
  /** Live: mail arrives and leaves, and the band says when it last did. */
  status: { live: boolean; line: string }
  /** The banner's "… tot {providerLabel} weer gekoppeld is." */
  providerLabel: string
  /** The banner's link: "Gmail opnieuw koppelen". */
  reconnectLabel: string
}

/** Where a thread is: in the inbox, set aside in a folder, snoozed, or gone from every folder. */
export type Place = "inbox" | "archive" | "spam" | "trash" | "snoozed" | "gone"

/** One thread as the list and the letter's header show it. */
export type InboxThread = {
  id: string
  subject: string
  /** The mailbox it came in at (or a chat channel's own id). */
  mailbox: string
  /** The customer's side: whoever wrote, or whom the team wrote to. */
  other: { name: string; email: string }
  last_message_at: string
  last_message_preview: string
  unread: boolean
  starred: boolean
  labels: ReadonlyArray<string>
  assignee?: string | undefined
  ticket_id?: string | undefined
  place: Place
  hasAttachments: boolean
  hasInbound: boolean
  /** A chat channel's thread; it is drawn by the host's `channels.Letter`. */
  channel?: ChatChannel | undefined
  /** What the customer agent did on it (PLAN 28). */
  agent?: { state: "handled" | "handed_over" | "active" } | undefined
}

/** One message in the letter, oldest first. */
export type LetterEntry = {
  id: string
  direction: "inbound" | "outbound"
  /** `message`: the first of a thread the team started. */
  kind: "message" | "reply" | "forward"
  from: { name: string; email: string }
  /** A forward's recipient. */
  to?: string | undefined
  at: string
  body: string
  /** Who on the team sent it, as its line says it: "Jij", or a first name. */
  by?: string | undefined
  /** Where a message the team sent is: waiting out the undo window, on its way, gone, or not sent. */
  state?: "scheduled" | "sending" | "sent" | "failed" | undefined
  error?: string | undefined
}

/** A thread's messages; `ready` is false while the host is still fetching them. */
export type Letter = { entries: ReadonlyArray<LetterEntry>; ready: boolean }

/** What a change said, for its toast; the host offers "Ongedaan maken" with it. */
export type Said = { label: string; detail?: string | undefined }

/** A send's outcome: `false` keeps the draft (the host has said why). A host may answer at once. */
export type Sent = boolean | Promise<boolean>

export interface InboxWrites {
  /** Selecting a thread reads it; "Markeren als ongelezen" puts the dot back. */
  markRead: (t: InboxThread, read: boolean) => void
  star: (t: InboxThread, starred: boolean) => void
  /** `undefined`: "Toewijzing verwijderen". */
  assign: (t: InboxThread, memberId: string | undefined, said: Said) => void
  /** Out of the list: archived, reported as spam, an hour's snooze, or the Prullenbak. */
  setAside: (t: InboxThread, as: "archive" | "spam" | "snooze" | "trash", said: Said) => void
  /** "Aan ticket koppelen": the host makes the ticket and says so. */
  linkTicket: (t: InboxThread) => void
  reply: (t: InboxThread, body: string, said: Said) => Sent
  forward: (t: InboxThread, to: string, note: string, said: Said) => Sent
  /** "Nieuwe e-mail": the new thread's id, or `undefined` when it did not go. */
  compose: (
    m: { to: string; subject: string; body: string; mailbox: string | undefined },
    said: Said
  ) => string | undefined | Promise<string | undefined>
  /** Back in the inbox from a folder; absent where the host has no way back but Undo. */
  putBack?: ((t: InboxThread, said: Said) => void) | undefined
  /** "Naar prullenbak" in the Meer menu; absent where the host has no Prullenbak. */
  trash?: boolean | undefined
  /** A label on or off, from the labels the host offers; absent where it offers none. */
  label?: { offered: ReadonlyArray<string>; set: (t: InboxThread, label: string, on: boolean) => void } | undefined
}

export interface InboxSource {
  /** Every thread the role may see, set aside or not; the screen picks the folder. */
  threads: ReadonlyArray<InboxThread>
  /** In the order their bands are listed. */
  mailboxes: ReadonlyArray<InboxMailbox>
  search: InboxSearch
  /** Goes to another address of this page. */
  go: (search: InboxSearch) => void
  /** The viewer's member id: "Van mij", "(jij)", "Jij". */
  me: string
  /** Who a thread can go to. */
  people: ReadonlyArray<{ id: string; name: string; role: string }>
  /** One thread's messages for its letter. */
  useLetter: (t: InboxThread) => Letter
  writes: InboxWrites
  /** Klantenservice · Bewerken: everything but reading. */
  gate: TeamGate
  /** A time of day as the list and the letter print it; the host's zone. */
  time: (iso: string) => string
  /** "Mailbox koppelen" and "Opnieuw koppelen": a page, or the host's own dialog. */
  connect: { to: string } | { onClick: () => void }
  /** The letter's side before any mail arrived, with its way to write the first. */
  Empty: ComponentType<{ onCompose: () => void }>
  /** Insyte's drafts for a thread ("Insyte stelde een antwoord op"); absent until drafts arrive (M15). */
  drafts?: ((t: InboxThread) => { reply: string; warmer: string; shorter: string }) | undefined
  /** The chat channels' bands and letters (PLAN 27); absent until the host has them (M15). */
  channels?: {
    Header: ComponentType<{ channel: ChatChannel; count: number }>
    Letter: ComponentType<{ thread: InboxThread }>
  } | undefined
}

const Context = createContext<InboxSource | null>(null)

export const InboxSourceProvider = Context.Provider

export function useInboxSource(): InboxSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The inbox screen needs an InboxSourceProvider around it.")
  return source
}
