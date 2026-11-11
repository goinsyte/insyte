import { useNavigate } from "@tanstack/react-router"
import { useReducedMotion } from "motion/react"
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  type ChatAction,
  type ChatProfile,
  chatProfiles,
  type ChatRecordKind,
  type ChatRecordRef,
  conversationDescription,
  conversations,
  messagesByConversation,
  type RichMessage,
  threadsByMessage
} from "../../data-source"
import type { Conversation } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { useChatStore } from "../stores/chat-store"
import { useWorkspace } from "../stores/workspace-store"
import { COMMAND, INSYTE, mentionsInsyte } from "./commands"
import { canUndoHere, demoRules, insyteAnswer, ME, runAction, undoAction } from "./demo-commands"
import { refsInText as textRefs, resolve, searchRecords, seedRefOf, usePools } from "./demo-records"
import type { ChatRecord } from "./records"
import {
  type ChatPerson,
  type ChatsSource,
  ChatsSourceProvider,
  type ChatWrites,
  type ConversationView,
  type Message,
  type Participant,
  type Profile,
  type Related
} from "./source"

/*
 * The chats screen over the design app's stores, as it was before the seam (`source.tsx`): the seeded conversations and
 * the ones started in this browser, the seed's messages with what was written, edited, reacted and pinned here laid
 * over them, the workspace's records, its commands run against the store, and Insyte answering in the conversation.
 */

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const FIRST = ME.name.split(" ")[0] ?? ME.name

/** A seeded or written message, with this browser's edits, reactions, pins and card states on it. */
function useShown() {
  const edits = useChatStore((s) => s.edits)
  const reactions = useChatStore((s) => s.reactions)
  const actions = useChatStore((s) => s.actions)
  const pinned = useChatStore((s) => s.pinnedMessages)
  const threadExtra = useChatStore((s) => s.threadExtra)
  return useCallback((m: RichMessage, inThread: boolean): Message => {
    const edit = edits[m.id]
    const patch = m.action ? actions[m.action.id] : undefined
    const replies = inThread ? [] : [...(threadsByMessage[m.id] ?? []), ...(threadExtra[m.id] ?? [])]
    const last = replies[replies.length - 1]
    return {
      ...m,
      ...(edit?.body !== undefined ? { body: edit.body, edited_at: edit.edited_at } : {}),
      ...(edit?.deleted ? { deleted: true } : {}),
      ...(reactions[m.id] ? { reactions: reactions[m.id] } : {}),
      ...(m.action && patch ? { action: { ...m.action, ...patch } } : {}),
      pinned: pinned.includes(m.id),
      mentionsMe: m.sender_id !== ME.id && new RegExp(`@${FIRST}\\b`, "i").test(edit?.body ?? m.body),
      ...(last
        ? {
          thread: {
            count: replies.length,
            lastAt: last.at,
            people: [...new Map(replies.map((r) => [r.sender_id, r])).values()].slice(-3).map((r) => ({
              id: r.sender_id,
              name: r.sender_name
            }))
          }
        }
        : {})
    }
  }, [edits, reactions, actions, pinned, threadExtra])
}

function useConversation(c: Conversation): ConversationView {
  const extra = useChatStore((s) => s.extra[c.id])
  const shown = useShown()
  return useMemo(() => {
    const seeded = messagesByConversation[c.id] ?? []
    const n = c.unread_count
    return {
      messages: [...seeded, ...(extra ?? [])].map((m) => shown(m, false)),
      firstUnread: n > 0 ? seeded[Math.max(0, seeded.length - n)]?.id : undefined,
      ready: true
    }
  }, [c, extra, shown])
}

function useReplies(parent: Message): ReadonlyArray<Message> {
  const extra = useChatStore((s) => s.threadExtra[parent.id])
  const shown = useShown()
  return useMemo(() => [...(threadsByMessage[parent.id] ?? []), ...(extra ?? [])].map((m) => shown(m, true)), [
    parent.id,
    extra,
    shown
  ])
}

function useTyping(key: string) {
  const who = useChatStore((s) => s.typing[key])
  return who ? { id: INSYTE.id, name: who } : undefined
}

const useParticipants = (c: Conversation): ReadonlyArray<Participant> =>
  c.participants.map((p) => ({
    id: p.id,
    name: p.name,
    presence: chatProfiles[p.id]?.presence,
    title: chatProfiles[p.id]?.title
  }))

function profileOf(senderId: string, fallbackName: string): ChatProfile {
  const known = chatProfiles[senderId]
  if (known) return known
  const member = useWorkspace.getState().members.find((m) =>
    m.id === senderId || `u_${m.name.split(" ")[0]?.toLowerCase()}` === senderId
  )
  return {
    name: member?.name ?? fallbackName,
    title: member?.role ?? "Teamlid",
    ...(member?.email ? { email: member.email } : {}),
    timezone: "Europe/Amsterdam",
    presence: "offline",
    ...(member ? { memberId: member.id } : {})
  }
}

function useProfile(senderId: string, name: string): Profile {
  const tickets = useWorkspace((s) => s.tickets)
  const created = useChatStore((s) => s.created)
  const p = profileOf(senderId, name)
  const open = p.memberId
    ? tickets.filter((t) => t.assignee_ids.includes(p.memberId as string) && t.status !== "done").length
    : undefined
  const channels = [...created, ...conversations]
    .filter((c) => c.type === "group" && c.participants.some((x) => x.id === senderId))
    .map((c) => c.name)
  return { ...p, openTickets: open, channels }
}

/** A person's direct-message thread: the seeded ones by their chat id, teammates by member id. */
function dmIdFor(senderId: string): string {
  const seeded: Record<string, string> = { u_maya: "conv_dm_maya", u_marco: "conv_dm_marco" }
  if (seeded[senderId]) return seeded[senderId]
  const memberId = chatProfiles[senderId]?.memberId
  return `conv_dm_${memberId ?? senderId}`
}

function useRecord(ref: ChatRecordRef | undefined): ChatRecord | null {
  const pools = usePools()
  return useMemo(() => (ref ? resolve(ref, pools) : null), [ref, pools])
}

function useRelated(r: ChatRecord): Related {
  const pools = usePools()
  return useMemo(() => ({
    chargebacks: r.kind === "order" ? pools.chargebacks.filter((c) => c.order_id === r.order.id) : [],
    orders: r.kind === "customer" ? pools.orders.filter((o) => o.customer_id === r.customer.id).slice(0, 6) : [],
    orderNumber: (id) => pools.orders.find((o) => o.id === id)?.number,
    currency: "USD"
  }), [r, pools])
}

function useRecordSearch(q: string | null, kinds?: ReadonlyArray<ChatRecordKind>) {
  const pools = usePools()
  return useMemo(() => (q === null ? [] : searchRecords(q, pools, kinds)), [q, pools, kinds])
}

export function DemoChatsSource({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion() ?? false
  const created = useChatStore((s) => s.created)
  const pinned = useChatStore((s) => s.pinned)
  const muted = useChatStore((s) => s.muted)
  const drafts = useChatStore((s) => s.drafts)
  const members = useWorkspace((s) => s.members)
  const pools = usePools()
  const poolsRef = useRef(pools)
  poolsRef.current = pools
  /* A thread's composer is not kept across reloads, as before. */
  const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({})
  const all = useMemo(() => [...created, ...conversations], [created])
  const people = useMemo<ReadonlyArray<ChatPerson>>(
    () =>
      members.filter((m) => m.status === "active").map((m) => ({ id: m.id, initial: m.name.charAt(0), name: m.name })),
    [members]
  )

  const store = useChatStore.getState
  const post = (c: Conversation, where: string | null, msg: RichMessage) => {
    if (where) store().appendReply(where, msg)
    else store().appendMessage(c.id, msg)
  }
  const base = (c: Conversation) => ({
    conversation_id: c.id,
    sender_id: ME.id,
    sender_name: ME.name,
    at: new Date().toISOString()
  })

  const writes: ChatWrites = {
    send: (c, out) => {
      const where = out.parent?.id ?? null
      const msg: RichMessage = {
        ...base(c),
        id: newId("m"),
        body: out.body,
        ...(out.records.length ? { records: [...out.records] } : {}),
        ...(out.attachments.length ? { attachments: [...out.attachments] } : {})
      }
      post(c, where, msg)
      if (out.parent && out.alsoToChannel) store().appendMessage(c.id, { ...msg, id: `${msg.id}_ch` })
      if (!mentionsInsyte(out.body)) return
      const s = store()
      const key = out.parent ? `${c.id}:${out.parent.id}` : c.id
      const history = out.parent
        ? [out.parent, ...(threadsByMessage[out.parent.id] ?? []), ...(s.threadExtra[out.parent.id] ?? [])]
        : [...(messagesByConversation[c.id] ?? []), ...(s.extra[c.id] ?? [])]
      s.setTyping(key, "Insyte")
      window.setTimeout(
        () => {
          const reply = insyteAnswer(
            out.body,
            out.records.length ? out.records : (out.parent?.records ?? []),
            [...history, msg],
            poolsRef.current
          )
          post(c, where, {
            conversation_id: c.id,
            id: newId("m"),
            sender_id: INSYTE.id,
            sender_name: INSYTE.name,
            at: new Date().toISOString(),
            body: reply.body,
            ...(reply.records?.length ? { records: reply.records } : {}),
            ...(reply.action ? { action: reply.action } : {})
          })
          store().setTyping(key, undefined)
          if (reply.action?.state === "running") {
            void runAction(
              reply.action,
              reply.action.target ? resolve(reply.action.target, poolsRef.current) : null
            )
          }
        },
        reduce ? 300 : 1300
      )
    },
    run: (c, run) => {
      const action: ChatAction = {
        id: newId("act"),
        command: run.command,
        ...(run.target ? { target: run.target } : {}),
        ...(run.arg ? { arg: run.arg } : {}),
        by: "person",
        state: COMMAND[run.command].money ? "confirm" : "running"
      }
      post(c, run.parent?.id ?? null, { ...base(c), id: newId("m"), body: "", action })
      if (action.state === "running") void runAction(action, run.record)
    },
    confirm: (a, r) => runAction(a, r, a.by === "insyte" ? FIRST : undefined),
    decline: (a) => store().setAction(a.id, { state: "declined", decidedBy: FIRST }),
    canUndo: (a) => canUndoHere(a.id),
    undo: (a) => Promise.resolve(undoAction(a)),
    react: (m, emoji) => {
      const current = m.reactions ?? []
      const found = current.find((r) => r.emoji === emoji)
      const next = !found
        ? [...current, { emoji, count: 1, mine: true }]
        : found.mine
        ? current.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) =>
          r.count > 0
        )
        : current.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
      store().setReactions(m.id, next)
    },
    edit: (m, body) => store().editMessage(m.id, body),
    remove: (m) => {
      store().deleteMessage(m.id)
      undoable("Bericht verwijderd", () => store().restoreMessage(m.id))
    },
    pinMessage: (m) => store().togglePinnedMessage(m.id),
    pin: (c) => store().togglePinned(c.id),
    mute: (c) => store().toggleMuted(c.id),
    createChannel: (name, topic) => {
      const id = `conv_ch_${Date.now().toString(36)}`
      store().addConversation({
        id,
        type: "group",
        name,
        participants: [{ id: ME.id, name: ME.name }],
        last_message_at: new Date().toISOString(),
        last_message_preview: topic,
        unread_count: 0,
        messages: []
      })
      void navigate({ to: "/chats", search: { id } } as never)
      undoable(`#${name} aangemaakt`, () => store().removeConversation(id))
    },
    ticketFrom: (m, c) => {
      const related = [...(m.records ?? []), ...textRefs(m.body, poolsRef.current)].find((r) =>
        r.kind === "order" || r.kind === "customer" || r.kind === "chargeback"
      )
      const t = useWorkspace.getState().createTicket({
        title: m.body.replace(/[*_`~]/g, "").slice(0, 80) || "Uit de teamchat",
        description: `${m.sender_name} in #${c.name}: ${m.body}`,
        priority: "medium",
        source: "chat",
        ...(related
          ? {
            related_entity: {
              type: related.kind as "order" | "customer" | "chargeback",
              id: related.id,
              label: related.id
            }
          }
          : {})
      })
      toast(`Ticket ${t.number} aangemaakt`, {
        action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: t.id } as never }) }
      })
    },
    openDirect: (id) => {
      const key = id.slice("conv_dm_".length)
      const member = useWorkspace.getState().members.find((m) => m.id === key)
      const name = member?.name ?? chatProfiles[key]?.name
      if (!name) return
      store().addConversation({
        id,
        type: "dm",
        name,
        participants: [{ id: ME.id, name: ME.name }, { id: member ? member.id : key, name }],
        last_message_at: new Date().toISOString(),
        last_message_preview: "",
        unread_count: 0,
        messages: []
      })
    },
    markRead: () => {},
    setDraft: (key, value) => {
      if (key.includes(":")) setThreadDrafts((d) => ({ ...d, [key]: value }))
      else store().setDraft(key, value)
    }
  }

  const source: ChatsSource = {
    me: ME,
    conversations: all,
    pinned: new Set(pinned),
    muted: new Set(muted),
    describe: (c) => conversationDescription[c.id]?.replace(/^\d+ teamleden · /, ""),
    useParticipants,
    useConversation,
    useReplies,
    useTyping,
    draft: (key) => (key.includes(":") ? threadDrafts[key] : drafts[key]) ?? "",
    people,
    rules: { team: members, available: demoRules().available },
    profileOf,
    useProfile,
    dmIdFor,
    useRecord,
    useRelated,
    useRecordSearch,
    refOf: seedRefOf,
    refsInText: (text) => textRefs(text, pools),
    insyte: true,
    attachments: true,
    writes
  }
  return <ChatsSourceProvider value={source}>{children}</ChatsSourceProvider>
}
