import { useSyncExternalStore } from "react"
import { SCHEDULED } from "./fixtures/agents.ts"
import { APPROVALS, QUEUE, WAITING } from "./fixtures/home.ts"
import { OPEN_STORE_CHATS } from "./fixtures/live.ts"
import { NOTIFICATIONS } from "./fixtures/notifications.ts"
import { TODAY } from "./fixtures/workspace.ts"
import type { ProposalState } from "./ui/proposal.tsx"

/**
 * The demo's shared state, and every count `/v2` shows.
 *
 * A decision on Start is the same decision on the agent's page and in the menu's counts, and the
 * bell's "Alles gelezen" empties Vermeldingen too: one small store, held for the visit (not stored).
 * Each count is one function over the fixtures and this state, so no screen types a number of its
 * own and two screens cannot disagree.
 */

type Decision = { readonly state: ProposalState; readonly at: number }

type DemoState = {
  /** Proposals the person decided, by id; an open proposal is absent. */
  readonly decisions: Readonly<Record<string, Decision>>
  readonly notesRead: boolean
  /** Chats the person renamed, by chat id. */
  readonly chatTitles: Readonly<Record<string, string>>
  /** Chats the person deleted this visit (the undo brings them back). */
  readonly deletedChats: ReadonlyArray<string>
  /** Proposals whose draft the person edited, by id. */
  readonly drafts: Readonly<Record<string, string>>
}

let state: DemoState = { decisions: {}, notesRead: false, chatTitles: {}, deletedChats: [], drafts: {} }
const listeners = new Set<() => void>()

function set(next: (s: DemoState) => DemoState) {
  state = next(state)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getDemo = () => state

/** The demo state; a component re-renders when it changes. */
export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, getDemo)
}

export function decide(id: string, next: ProposalState) {
  set((s) => {
    const rest = Object.fromEntries(Object.entries(s.decisions).filter(([key]) => key !== id))
    return { ...s, decisions: next === "open" ? rest : { ...rest, [id]: { state: next, at: Date.now() } } }
  })
}

export function editDraft(id: string, text: string | undefined) {
  set((s) => ({
    ...s,
    drafts: text === undefined
      ? Object.fromEntries(Object.entries(s.drafts).filter(([key]) => key !== id))
      : { ...s.drafts, [id]: text }
  }))
}

export function setNotesRead(read: boolean) {
  set((s) => ({ ...s, notesRead: read }))
}

export function renameChat(id: string, title: string) {
  set((s) => ({ ...s, chatTitles: { ...s.chatTitles, [id]: title } }))
}

export function deleteChat(id: string, deleted: boolean) {
  set((s) => ({
    ...s,
    deletedChats: deleted ? [...s.deletedChats.filter((x) => x !== id), id] : s.deletedChats.filter((x) => x !== id)
  }))
}

/* ── the counts ────────────────────────────────────────────────────────────────────────────────── */

/** Proposals still waiting for a yes: Goedkeuringen, and Start's "voorstellen". */
export const openProposals = (s: DemoState = state) => APPROVALS.filter((a) => s.decisions[a.id] === undefined).length

/** Tasks that are yours to do: Start's "voor jou". */
export const tasksForYou = () => WAITING.length

/** Everything on Start's queue that is still open: Mijn werk. */
export const myWork = (s: DemoState = state) =>
  QUEUE.filter((e) => e.kind === "task" || s.decisions[e.item.id] === undefined).length

/** Unread notifications: the bell's dot and Vermeldingen. */
export const unreadNotes = (s: DemoState = state) => (s.notesRead ? 0 : NOTIFICATIONS.filter((n) => n.unread).length)

/** Open tickets: the rail's Inbox count and the inbox peek. */
export const openTickets = () => TODAY.openTickets

/** Store chats open now: Live → Winkelchat. */
export const openStoreChats = () => OPEN_STORE_CHATS.length

/** Planned agent runs: Magnus → Gepland. */
export const scheduledRuns = () => SCHEDULED.length
