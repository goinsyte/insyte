import { useSyncExternalStore } from "react"
import { BUSY_TICKETS, TICKETS } from "../../fixtures/inbox.ts"
import type {
  ChatMessage,
  Entry,
  PersonKey,
  Place,
  Priority,
  StoreLine,
  Ticket,
  TicketStatus
} from "../../fixtures/inbox.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { useView } from "../../view.ts"

/**
 * What the person changed in the inbox this visit: a status, who has a ticket, a reply, a note, a new
 * ticket, a team-chat message. Held for the visit (not stored), so the inbox, the ticket, the board
 * and the menu's counts read one list and cannot disagree. The fixture stays the Monday as it opened.
 */

type Patch = {
  readonly subject?: string
  readonly status?: TicketStatus
  readonly priority?: Priority
  readonly assignee?: PersonKey | null
  readonly labels?: ReadonlyArray<string>
  readonly unread?: boolean
  readonly starred?: boolean
  readonly place?: Place
  readonly with?: ReadonlyArray<PersonKey>
  /** Answered by us: the customer no longer waits. */
  readonly answered?: boolean
  readonly entries?: ReadonlyArray<Entry>
}

type State = {
  readonly patches: Readonly<Record<string, Patch>>
  readonly created: ReadonlyArray<Ticket>
  readonly chat: Readonly<Record<string, ReadonlyArray<ChatMessage>>>
  readonly replies: Readonly<Record<string, ReadonlyArray<Omit<ChatMessage, "replies">>>>
  readonly readChats: ReadonlyArray<string>
  readonly storeLines: Readonly<Record<string, ReadonlyArray<StoreLine>>>
  readonly closedStoreChats: ReadonlyArray<string>
  /** Who answers a store chat now, where a person took it over or gave it back to the agent. */
  readonly storeChatOwner: Readonly<Record<string, PersonKey | "agent">>
  /** Magnus's summaries asked for this visit, by ticket. */
  readonly summaries: Readonly<Record<string, string>>
  /** Where each command card in the team chat stands, by message. */
  readonly actions: Readonly<Record<string, ActionState>>
}

/** A command card's state: waiting for a yes, run (with its undo until a time), taken back, or turned down. */
export type ActionState =
  | { readonly state: "bevestigen" | "voorgesteld" | "bezig" }
  | { readonly state: "gedaan"; readonly by: string; readonly until: number; readonly undo?: () => void }
  | { readonly state: "ongedaan" | "afgewezen"; readonly by: string }

let state: State = {
  patches: {},
  created: [],
  chat: {},
  replies: {},
  readChats: [],
  storeLines: {},
  closedStoreChats: [],
  storeChatOwner: {},
  summaries: {},
  actions: {}
}
const listeners = new Set<() => void>()

function set(next: (s: State) => State) {
  state = next(state)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getInbox = () => state

export function useInboxState(): State {
  return useSyncExternalStore(subscribe, getInbox)
}

function apply(t: Ticket, p: Patch | undefined): Ticket {
  if (p === undefined) return t
  const { entries, answered, ...rest } = p
  return {
    ...t,
    ...rest,
    entries: entries === undefined ? t.entries : [...t.entries, ...entries],
    waitingSince: answered === true ? undefined : t.waitingSince
  }
}

const cache = new WeakMap<State, { busy: ReadonlyArray<Ticket>; calm: ReadonlyArray<Ticket> }>()

/** Every ticket as it stands now; the busy week's rows on top when the view is `druk`. */
export function ticketsOf(s: State, busy: boolean): ReadonlyArray<Ticket> {
  let hit = cache.get(s)
  if (hit === undefined) {
    const calm = [...s.created, ...TICKETS].map((t) => apply(t, s.patches[t.number]))
    hit = { calm, busy: [...calm, ...BUSY_TICKETS.map((t) => apply(t, s.patches[t.number]))] }
    cache.set(s, hit)
  }
  return busy ? hit.busy : hit.calm
}

/** The tickets for the current view, re-read when anything changes. */
export function useTickets(): ReadonlyArray<Ticket> {
  const s = useInboxState()
  const view = useView()
  return ticketsOf(s, view.staat === "druk")
}

export function patchTicket(number: string, patch: Patch) {
  set((s) => {
    const before = s.patches[number] ?? {}
    const entries = patch.entries === undefined
      ? before.entries
      : [...(before.entries ?? []), ...patch.entries]
    return {
      ...s,
      patches: { ...s.patches, [number]: { ...before, ...patch, ...(entries === undefined ? {} : { entries }) } }
    }
  })
}

/** Take the last `n` lines a ticket got this visit back out (the undo of a reply or a note). */
export function dropEntries(number: string, n: number) {
  set((s) => {
    const before = s.patches[number]
    if (before?.entries === undefined) return s
    return {
      ...s,
      patches: { ...s.patches, [number]: { ...before, entries: before.entries.slice(0, -n) } }
    }
  })
}

let nextNumber = 5151

export function createTicket(t: Omit<Ticket, "number">): string {
  const number = String(nextNumber++)
  set((s) => ({ ...s, created: [{ ...t, number }, ...s.created] }))
  return number
}

/** Take tickets made this visit back out (the undo of a ticket another area filed). */
export function dropTickets(numbers: ReadonlyArray<string>) {
  set((s) => ({ ...s, created: s.created.filter((t) => !numbers.includes(t.number)) }))
}

export function postChat(conversationId: string, message: ChatMessage) {
  set((s) => ({ ...s, chat: { ...s.chat, [conversationId]: [...(s.chat[conversationId] ?? []), message] } }))
}

export function unpostChat(conversationId: string, id: string) {
  set((s) => ({
    ...s,
    chat: { ...s.chat, [conversationId]: (s.chat[conversationId] ?? []).filter((m) => m.id !== id) }
  }))
}

export function postReply(parentId: string, message: Omit<ChatMessage, "replies">) {
  set((s) => ({ ...s, replies: { ...s.replies, [parentId]: [...(s.replies[parentId] ?? []), message] } }))
}

export function markChatRead(id: string) {
  if (state.readChats.includes(id)) return
  set((s) => ({ ...s, readChats: [...s.readChats, id] }))
}

export function addStoreLine(chatId: string, line: StoreLine) {
  set((s) => ({ ...s, storeLines: { ...s.storeLines, [chatId]: [...(s.storeLines[chatId] ?? []), line] } }))
}

export function dropStoreLine(chatId: string) {
  set((s) => ({ ...s, storeLines: { ...s.storeLines, [chatId]: (s.storeLines[chatId] ?? []).slice(0, -1) } }))
}

export function setStoreChatClosed(chatId: string, closed: boolean) {
  set((s) => ({
    ...s,
    closedStoreChats: closed
      ? [...s.closedStoreChats.filter((c) => c !== chatId), chatId]
      : s.closedStoreChats.filter((c) => c !== chatId)
  }))
}

/** A record without one key, or with it set. */
function put<V>(o: Readonly<Record<string, V>>, key: string, value: V | undefined): Readonly<Record<string, V>> {
  const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))
  return value === undefined ? rest : { ...rest, [key]: value }
}

export function setStoreChatOwner(chatId: string, owner: PersonKey | "agent" | undefined) {
  set((s) => ({ ...s, storeChatOwner: put(s.storeChatOwner, chatId, owner) }))
}

export function setSummary(number: string, text: string | undefined) {
  set((s) => ({ ...s, summaries: put(s.summaries, number, text) }))
}

export function setAction(messageId: string, next: ActionState) {
  set((s) => ({ ...s, actions: { ...s.actions, [messageId]: next } }))
}

/** New lines are stamped on the demo clock, so the thread stays one afternoon. */
export const nowClock = () => DEMO_NOW.clock
