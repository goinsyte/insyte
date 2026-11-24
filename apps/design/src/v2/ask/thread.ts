import { useSyncExternalStore } from "react"
import { CHATS } from "../fixtures/assistant.ts"
import type { Chat, FollowUp, Proposal, Step, Turn } from "../fixtures/assistant.ts"
import { DEMO_NOW } from "../fixtures/workspace.ts"
import type { ProposalState } from "../ui/proposal.tsx"
import { toast } from "../ui/toast.tsx"
import { apply } from "./apply.ts"
import { COMMANDS } from "./catalogue.ts"
import type { Ref } from "./catalogue.ts"
import { answer } from "./scripts.ts"
import type { Question, Reply } from "./scripts.ts"

/*
 * Magnus's conversations as they stand this visit: the scripted chats, the ones started here, every
 * message sent and every proposal decided. One store, so the chat page and the side drawer show the
 * same thread, and a proposal carried out in one reads as carried out in the other. Held for the
 * visit, not stored.
 */

type Entry =
  | { readonly kind: "turn"; readonly id: string; readonly turn: Turn }
  | { readonly kind: "proposal"; readonly id: string; readonly proposal: Proposal }

/** While Magnus works: the steps of the answer he is writing, and how many have started. */
type Working = { readonly steps: ReadonlyArray<Step>; readonly reached: number }

type Thread = {
  readonly entries: ReadonlyArray<Entry>
  readonly states: Readonly<Record<string, ProposalState>>
  /** When Uitvoeren was chosen, so a send window counts from the decision wherever it is shown. */
  readonly decidedAt: Readonly<Record<string, number>>
  readonly edits: Readonly<Record<string, string>>
  /** Follow-ups already taken, by id. */
  readonly used: ReadonlyArray<string>
  readonly working: Working | null
  /** The answer that has just arrived and streams in, once. */
  readonly fresh: string | null
}

type Store = { readonly threads: Readonly<Record<string, Thread>>; readonly started: ReadonlyArray<Chat> }

let store: Store = { threads: {}, started: [] }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Every chat there is: the ones started this visit first, then the scripted ones. */
export const allChats = (s: Store = store): ReadonlyArray<Chat> => [...s.started, ...CHATS]
export const findChat = (id: string, s: Store = store) => allChats(s).find((c) => c.id === id)

const initial = new Map<string, Thread>()
function threadOf(chatId: string, s: Store = store): Thread {
  const held = s.threads[chatId]
  if (held !== undefined) return held
  let seed = initial.get(chatId)
  if (seed === undefined) {
    const turns = findChat(chatId, s)?.turns ?? []
    seed = {
      entries: turns.map((turn, i) => ({ kind: "turn", id: `${chatId}-${i}`, turn })),
      states: {},
      decidedAt: {},
      edits: {},
      used: [],
      working: null,
      fresh: null
    }
    initial.set(chatId, seed)
  }
  return seed
}

function change(chatId: string, next: (t: Thread) => Thread) {
  store = { ...store, threads: { ...store.threads, [chatId]: next(threadOf(chatId)) } }
  for (const listener of listeners) listener()
}

/** One conversation; re-renders when it changes. */
export function useThread(chatId: string): Thread {
  return useSyncExternalStore(subscribe, () => threadOf(chatId))
}

/** The chats this visit started, for the history list. */
export function useStartedChats(): ReadonlyArray<Chat> {
  return useSyncExternalStore(subscribe, () => store.started)
}

/* ── asking ────────────────────────────────────────────────────────────────────────────────────── */

const STEP_MS = 560
let made = 0
const id = (prefix: string) => `${prefix}-${++made}`
const timers = new Map<string, number>()

/** What the question reads as in the thread: the words, or the command's question, or the records. */
function said(question: Question): string {
  const text = question.text.trim()
  if (text !== "") return text
  const command = COMMANDS.find((c) => c.name === question.command)
  if (command !== undefined) return command.prompt
  return (question.refs ?? []).map((r) => r.label).join(", ")
}

/** Work through the steps one at a time, then post the answer (and its proposal) and stream it in. */
function work(chatId: string, reply: Reply) {
  const steps = reply.turn.steps ?? [{ label: "Nagedacht" }]
  window.clearTimeout(timers.get(chatId))
  change(chatId, (t) => ({ ...t, working: { steps, reached: 1 } }))
  const tick = () => {
    const now = threadOf(chatId).working
    if (now === null) return
    if (now.reached < steps.length) {
      change(chatId, (t) => ({ ...t, working: { steps, reached: now.reached + 1 } }))
      timers.set(chatId, window.setTimeout(tick, STEP_MS))
      return
    }
    const turnId = id("magnus")
    change(chatId, (t) => ({
      ...t,
      working: null,
      fresh: turnId,
      entries: [
        ...t.entries,
        { kind: "turn", id: turnId, turn: { from: "magnus", at: DEMO_NOW.clock, ...reply.turn } },
        ...(reply.proposal === undefined
          ? []
          : [{ kind: "proposal" as const, id: id("voorstel"), proposal: reply.proposal }])
      ]
    }))
  }
  timers.set(chatId, window.setTimeout(tick, STEP_MS))
}

/** Send a message: it is answered from the workspace as it stands now. */
export function send(chatId: string, question: Question) {
  const refs: ReadonlyArray<Ref> = question.refs ?? []
  change(chatId, (t) => ({
    ...t,
    entries: [...t.entries, {
      kind: "turn",
      id: id("ik"),
      turn: { from: "me", at: DEMO_NOW.clock, text: said(question), ...(refs.length === 0 ? {} : { refs }) }
    }]
  }))
  work(chatId, answer(question))
}

/** A new conversation that opens with `question`; returns its id, for the address. */
export function startChat(question: Question): string {
  const chatId = id("gesprek")
  const title = said(question)
  const chat: Chat = {
    id: chatId,
    title: title.length > 56 ? `${title.slice(0, 55).trimEnd()}…` : title,
    started: "vandaag",
    turns: []
  }
  store = { ...store, started: [chat, ...store.started] }
  for (const listener of listeners) listener()
  send(chatId, question)
  return chatId
}

/** Take a next step under an answer: a further question, or a proposal that waits for Uitvoeren. */
export function followUp(chatId: string, step: FollowUp) {
  change(chatId, (t) => ({
    ...t,
    used: [...t.used, step.id],
    entries: [...t.entries, { kind: "turn", id: id("ik"), turn: { from: "me", at: DEMO_NOW.clock, text: step.label } }]
  }))
  if (step.kind === "proposal") {
    work(chatId, {
      turn: { steps: [{ label: "Voorstel uitgewerkt", read: step.proposal.where }], paragraphs: [] },
      proposal: step.proposal
    })
    return
  }
  const scripted = findChat(chatId)?.answers?.[step.id]
  if (scripted !== undefined && scripted.from === "magnus") {
    const { from: _from, at: _at, ...turn } = scripted
    work(chatId, { turn })
    return
  }
  send(chatId, { text: step.label })
}

/** The answer that streamed in is now just there. */
export function streamed(chatId: string, entryId: string) {
  if (threadOf(chatId).fresh === entryId) change(chatId, (t) => ({ ...t, fresh: null }))
}

/* ── proposals ─────────────────────────────────────────────────────────────────────────────────── */

const undos = new Map<string, () => void>()

/**
 * Uitvoeren, Negeren or back to open. Carrying out a proposal does the real thing to the workspace
 * (`apply.ts`) and offers the undo in a toast; taking it back (Ongedaan maken, Niet versturen) runs
 * that undo.
 */
export function decideProposal(chatId: string, entryId: string, next: ProposalState) {
  const thread = threadOf(chatId)
  const entry = thread.entries.find((e) => e.id === entryId)
  if (entry?.kind !== "proposal") return
  const before = thread.states[entryId] ?? "open"
  if (before === next) return
  const back = undos.get(entryId)
  if (back !== undefined && before === "done") {
    back()
    undos.delete(entryId)
  }
  change(chatId, (t) => ({
    ...t,
    states: { ...t.states, [entryId]: next },
    decidedAt: next === "done" ? { ...t.decidedAt, [entryId]: Date.now() } : t.decidedAt
  }))
  const action = entry.proposal.action
  if (next !== "done" || action === undefined) return
  const done = apply(action, thread.edits[entryId] ?? entry.proposal.draft ?? entry.proposal.title)
  undos.set(entryId, done.undo)
  toast({
    title: done.title,
    body: done.body,
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => decideProposal(chatId, entryId, "open") }
  })
}

export function editProposal(chatId: string, entryId: string, text: string | undefined) {
  change(chatId, (t) => {
    const { [entryId]: _old, ...rest } = t.edits
    return { ...t, edits: text === undefined ? rest : { ...rest, [entryId]: text } }
  })
}
