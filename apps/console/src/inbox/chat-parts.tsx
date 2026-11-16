import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChannelStatus, HandoverChange } from "@insyte/modules/inbox/domain/Chat"
import type { ThreadDetail } from "@insyte/modules/inbox/domain/Inbox"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import {
  AgentBand,
  AgentHandled,
  ChannelHeaderView,
  type ChatDraftView,
  ChatLetterView
} from "@insyte/ui/app/inbox/chat-views"
import {
  type ChatChannel,
  type InboxSource,
  type InboxThread,
  type TeamGate,
  useInboxSource
} from "@insyte/ui/app/inbox/source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect } from "react"
import { toast } from "sonner"
import { channelsAtom, INBOX, inboxWrites, threadAtom } from "../data/inbox.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"
import { bubbleOf } from "./thread-of.ts"

/*
 * The website chat in the console's inbox (M15 step 8): its band over the chats, from `Channels.list`, and its letter,
 * the design's bubbles over `Threads.get`, with the handover band when the customer agent passed it on. A chat is read
 * again every five seconds while it is open, as the shopper's widget asks for news. "Overnemen" and "Teruggeven aan
 * Insyte" are the server's, each with its Undo.
 */

const keys = { reactivityKeys: [...INBOX] }

/** How often an open chat is read again: the shopper's widget asks every four seconds. */
const LIVE_MS = 5_000

const COPY = {
  gone: "Dat gesprek bestaat niet meer"
} as const

/** What a draft's refusal says: someone was first with it, or the chat moved on. */
const DRAFT_COPY = {
  gone: "Dat gesprek bestaat niet meer",
  conflicts: {
    gone: ["Dat concept is er niet meer", "Iemand anders was je voor, of er kwam een nieuw bericht."]
  },
  other: (tagged: { readonly _tag?: string }) => {
    if (tagged._tag === "TakenOver") {
      toast.error("Een collega heeft dit gesprek overgenomen", { description: "Alleen die collega antwoordt nu." })
      return true
    }
    if (tagged._tag === "ThreadClosed") {
      toast.error("Dit gesprek is gesloten", { description: "De klant ziet geen nieuwe berichten meer." })
      return true
    }
    return false
  }
} satisfies Parameters<typeof sayRefusal>[1]

/** The customer agent's draft on the letter: Versturen and Weggooien with their Undo, Aanpassen into the composer. */
function useDraftActions(
  thread: InboxThread,
  detail: ThreadDetail,
  gate: TeamGate,
  refresh: () => void
): ChatDraftView | undefined {
  const write = {
    send: useAtomSet(inboxWrites.sendDraft, { mode: "promiseExit" }),
    use: useAtomSet(inboxWrites.useDraft, { mode: "promiseExit" }),
    discard: useAtomSet(inboxWrites.discardDraft, { mode: "promiseExit" }),
    undo: useAtomSet(inboxWrites.undo, { mode: "promiseExit" })
  }
  const draft = detail.draft
  if (draft === null) return undefined
  const payload = { threadId: thread.id, draftId: draft.id }
  const done = (exit: Exit.Exit<HandoverChange, unknown>, label: string, line: string) => {
    refresh()
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), DRAFT_COPY)
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(
      label,
      () =>
        void write.undo({ payload: { token: ticket.token }, ...keys }).then((undone) => {
          refresh()
          if (Exit.isFailure(undone)) sayRefusal(failureOf(undone), DRAFT_COPY)
        }),
      line
    )
  }
  const allowed = () => {
    if (gate.ok) return true
    toast.error(gate.reason)
    return false
  }
  return {
    text: draft.text,
    onSend: () => {
      if (!allowed()) return
      void write.send({ payload, ...keys }).then((exit) =>
        done(exit, "Antwoord verstuurd", "Het concept van Insyte gaat over een paar seconden naar de klant.")
      )
    },
    onUse: () => {
      if (!allowed()) return
      void write.use({ payload, ...keys }).then((exit) => done(exit, "", ""))
    },
    onDiscard: () => {
      if (!allowed()) return
      void write.discard({ payload, ...keys }).then((exit) =>
        done(exit, "Concept weggegooid", "De klant krijgt dit antwoord niet.")
      )
    }
  }
}

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

/** The stores' chat channels, once `Channels.list` is in; nothing for a role that may not read them. */
function useChatChannels(): ChannelStatus | undefined {
  return value(useAtomValue(channelsAtom))
}

function ConsoleChannelHeader({ channel, count }: { channel: ChatChannel; count: number }) {
  const status = useChatChannels()
  const mine = status?.channels.filter((c) => c.kind === channel) ?? []
  return (
    <ChannelHeaderView
      channel={channel}
      count={count}
      live={mine.some((c) => c.status === "connected")}
      account={mine.map((c) => c.storeName).join(", ")}
    />
  )
}

/** The agent's part at the head of the letter: handled, handed over, or holding it again. */
function Banner(
  { thread, detail, me, meName, gate, refresh }: {
    thread: InboxThread
    detail: ThreadDetail
    me: string
    meName: string
    gate: TeamGate
    refresh: () => void
  }
) {
  const write = {
    takeOver: useAtomSet(inboxWrites.takeOver, { mode: "promiseExit" }),
    handBack: useAtomSet(inboxWrites.handBack, { mode: "promiseExit" }),
    undo: useAtomSet(inboxWrites.undo, { mode: "promiseExit" })
  }
  // The letter's own read, every five seconds: the list's row may be older.
  const state = detail.thread.agentState ?? undefined
  if (state === undefined) return null
  if (state === "handled") return <AgentHandled />
  const done = (exit: Exit.Exit<HandoverChange, unknown>, label: string, detailLine: string) => {
    refresh()
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(
      label,
      () =>
        void write.undo({ payload: { token: ticket.token }, ...keys }).then((undone) => {
          refresh()
          if (Exit.isFailure(undone)) sayRefusal(failureOf(undone), COPY)
        }),
      detailLine
    )
  }
  const taken = detail.thread.takenOverBy
  const open = detail.handover !== null && detail.handover.handedBackAt === null
  return (
    <AgentBand
      state={taken !== null || open ? "handed_over" : "active"}
      reason={open ? detail.handover?.reason : undefined}
      taken={taken === me}
      me={meName}
      onTakeOver={() => {
        if (!gate.ok) return void toast.error(gate.reason)
        void write.takeOver({ payload: { threadId: thread.id }, ...keys }).then((exit) =>
          done(exit, "Jij hebt het gesprek overgenomen", "Insyte antwoordt niet meer tot je het teruggeeft.")
        )
      }}
      onGiveBack={() => {
        if (!gate.ok) return void toast.error(gate.reason)
        void write.handBack({ payload: { threadId: thread.id }, ...keys }).then((exit) =>
          done(exit, "Teruggegeven aan Insyte", "Insyte antwoordt weer op nieuwe berichten.")
        )
      }}
    />
  )
}

/** What keeps the composer shut, in one sentence; `undefined` while the team may answer. */
const shut = (detail: ThreadDetail, me: string, gate: TeamGate, who: (id: string) => string | undefined) => {
  if (!gate.ok) return gate.reason
  if (detail.thread.closedAt !== null) return "De klant heeft dit gesprek beëindigd."
  const by = detail.thread.takenOverBy
  if (by !== null && by !== me) return `${who(by) ?? "Een collega"} heeft dit gesprek overgenomen.`
  return undefined
}

/** A first name for a member, as the letter says it: "Jij", or theirs. */
const namer = (me: string, people: InboxSource["people"]) => (memberId: string) =>
  memberId === me ? "Jij" : people.find((p) => p.id === memberId)?.name.split(" ")[0]

/** A website chat's letter, reading the rest of what it needs from the inbox's source. */
function ConsoleChatLetter({ thread }: { thread: InboxThread }) {
  const source = useInboxSource()
  const result = useAtomValue(threadAtom(thread.id))
  const refresh = useAtomRefresh(threadAtom(thread.id))
  const status = useChatChannels()
  const now = useNow(60_000)
  const detail = value(result)
  useEffect(() => {
    const timer = setInterval(refresh, LIVE_MS)
    return () => clearInterval(timer)
  }, [refresh])
  if (detail === undefined) return <div className="flex min-h-0 flex-1" />
  return <ChatLetterOf thread={thread} detail={detail} source={source} status={status} now={now} refresh={refresh} />
}

/** The letter once its thread is read: the hooks of its draft need it there. */
function ChatLetterOf(
  { thread, detail, source, status, now, refresh }: {
    thread: InboxThread
    detail: ThreadDetail
    source: InboxSource
    status: ChannelStatus | undefined
    now: number
    refresh: () => void
  }
) {
  const draft = useDraftActions(thread, detail, source.gate, refresh)
  const who = namer(source.me, source.people)
  const meName = source.people.find((p) => p.id === source.me)?.name ?? ""
  const channel = thread.channel ?? "webchat"
  const store = status?.channels.find((c) => c.kind === channel && c.storeId === detail.thread.storeId)
  return (
    <ChatLetterView
      channel={channel}
      customer={thread.other.name || "Websitebezoeker"}
      handle={store?.storeName}
      orderRef={detail.thread.orderNumber ?? undefined}
      messages={detail.chat.map((m) => bubbleOf(m, who))}
      live={store === undefined || store.status === "connected"}
      now={now}
      clock={source.time}
      banner={
        <Banner thread={thread} detail={detail} me={source.me} meName={meName} gate={source.gate} refresh={refresh} />
      }
      composerDisabled={shut(detail, source.me, source.gate, who)}
      draft={draft}
      onSend={(text) =>
        void Promise.resolve(source.writes.reply(thread, text, { label: "Antwoord verstuurd" })).then(() => refresh())}
    />
  )
}

const CHANNELS = { Header: ConsoleChannelHeader, Letter: ConsoleChatLetter }

/** The inbox's `channels`, where the workspace has a chat channel; absent until it has one. */
export function useConsoleChannels(): InboxSource["channels"] {
  const status = useChatChannels()
  return (status?.channels.length ?? 0) > 0 ? CHANNELS : undefined
}
