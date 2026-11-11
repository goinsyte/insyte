import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChatList } from "@insyte/modules/chats/domain/Chats"
import type { SearchHit } from "@insyte/modules/shared/domain/Search"
import { INSYTE } from "@insyte/ui/app/chats/commands"
import { type ChatRecord, customerRecord, orderRecord, productRecord, ticketRecord } from "@insyte/ui/app/chats/records"
import type {
  ChatPerson,
  ChatsSource,
  ConversationView,
  Message,
  Participant,
  Profile,
  RecordHit,
  Related
} from "@insyte/ui/app/chats/source"
import type { ChatCommandId, ChatProfile, ChatRecordKind, ChatRecordRef } from "@insyte/ui/data-source"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { consoleCustomerDetail } from "../customers/customer-detail-source.ts"
import { chatMembersAtom, chatMessagesAtom, chatThreadAtom, chatWrites, TYPING_MS, typingAtom } from "../data/chats.ts"
import { ConsoleClient } from "../data/client.ts"
import { customerAtom, CUSTOMERS } from "../data/customers.ts"
import { frameAtom, presenceAtom } from "../data/frame.ts"
import { orderAtom, ORDERS } from "../data/orders.ts"
import { productAtom, PRODUCTS } from "../data/products.ts"
import { ticketAtom, ticketsAtom } from "../data/tickets.ts"
import { consoleOrderDetail } from "../orders/order-detail-source.ts"
import { consoleProductDetail } from "../products/product-detail-source.ts"
import { initialOfName, ticketOf } from "../tickets/ticket-of.ts"
import { conversationOf, firstName, firstUnreadOf, messageOf } from "./chat-of.tsx"
import { useChatWrites } from "./chat-writes.tsx"

/*
 * The chats screen's source in the console (M11 step 4): `Chats.*` as the design's conversations and messages, the
 * team from the frame, each record shared in a conversation read through its own slice (an order, a customer, a
 * product, a ticket). What the server does not do yet is said where the control is, not made up: Insyte answering in
 * the conversation (M15), files (no file store yet), chargebacks and the money commands (M13). A record handle typed in
 * the text stays text; records are shared with `#`.
 */

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

/** What runs in a conversation today (`ChatCommandsLive`): the rest say "… kan hier nog niet". */
const AVAILABLE: ReadonlySet<ChatCommandId> = new Set(["note", "ticket", "assign", "status", "cancel"])

const IDLE = Atom.make(AsyncResult.initial<never, never>())
const NO_MESSAGES: ReadonlyArray<Message> = []
const NO_PARTICIPANTS: ReadonlyArray<Participant> = []
const NO_HITS: ReadonlyArray<RecordHit> = []

/** How often the composer says "{wie} is bezig" to the others while the person types. */
const TYPING_EVERY_MS = 3_000

const INSYTE_PROFILE: ChatProfile = {
  name: INSYTE.name,
  title: "AI-collega",
  timezone: "Europe/Amsterdam",
  presence: "online",
  status: "Volgt je regels in Zelfstandigheid",
  agent: true
}

const SEARCHED: ReadonlyArray<"order" | "customer" | "product"> = ["order", "customer", "product"]
const searchAtom = Atom.family((key: string) => {
  const [kinds = "", ...rest] = key.split("|")
  return ConsoleClient.query("Search.records", {
    q: rest.join("|"),
    kinds: SEARCHED.filter((k) => kinds.split(",").includes(k)),
    limit: 4
  }, { reactivityKeys: [...ORDERS, ...CUSTOMERS, ...PRODUCTS] })
})

const hitOf = (h: SearchHit): RecordHit => {
  const ref: ChatRecordRef = { kind: h.kind, id: h.id }
  if (h.kind === "order") return { ref, kind: h.kind, code: h.title, title: h.subtitle ?? "" }
  if (h.kind === "customer") return { ref, kind: h.kind, code: h.subtitle ?? h.title, title: h.title }
  return { ref, kind: h.kind, code: h.subtitle ?? "", title: h.title }
}

/** Without a query the picker mixes kinds rather than showing four orders first, as the design's does. */
const interleave = (lists: ReadonlyArray<ReadonlyArray<RecordHit>>, limit: number): ReadonlyArray<RecordHit> => {
  const out: Array<RecordHit> = []
  for (let i = 0; out.length < limit; i++) {
    const row = lists.map((l) => l[i]).filter((h): h is RecordHit => h !== undefined)
    if (row.length === 0) break
    out.push(...row)
  }
  return out.slice(0, limit)
}

/** The `#` picker: orders, customers and products from `Search.records`, the tickets from the board's list. */
function useRecordSearch(q: string | null, kinds?: ReadonlyArray<ChatRecordKind>): ReadonlyArray<RecordHit> {
  const [typed, setTyped] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => setTyped(q), 150)
    return () => clearTimeout(t)
  }, [q])
  const want = (k: ChatRecordKind) => kinds === undefined || kinds.includes(k)
  const searched = SEARCHED.filter(want)
  const open = typed !== null
  const hits = value(useAtomValue(open && searched.length > 0 ? searchAtom(`${searched.join(",")}|${typed}`) : IDLE))
  const tickets = value(useAtomValue(open && want("ticket") ? ticketsAtom : IDLE))
  const last = useRef(NO_HITS)
  const needle = (typed ?? "").trim().toLowerCase()
  const found = useMemo(() => {
    if (!open) return NO_HITS
    const byKind = SEARCHED.map((k) => (hits ?? []).filter((h) => h.kind === k).map(hitOf))
    const ticketHits = (tickets?.rows ?? [])
      .map(ticketOf)
      .filter((t) => t.status !== "done" && (!needle || `${t.number} ${t.title}`.toLowerCase().includes(needle)))
      .slice(0, 4)
      .map((t): RecordHit => ({ ref: { kind: "ticket", id: t.id }, kind: "ticket", code: t.number, title: t.title }))
    const lists = [byKind[0] ?? [], ticketHits, byKind[1] ?? [], byKind[2] ?? []]
    return needle ? lists.flat().slice(0, 7) : interleave(lists, 7)
  }, [open, hits, tickets, needle])
  if (hits !== undefined || tickets !== undefined || !open) last.current = found
  return q === null ? NO_HITS : last.current
}

/** A record shared in a conversation, read through its own slice; a chargeback waits for M13. */
function useRecord(ref: ChatRecordRef | undefined): ChatRecord | null {
  const order = value(useAtomValue(ref?.kind === "order" ? orderAtom(ref.id) : IDLE))
  const customer = value(useAtomValue(ref?.kind === "customer" ? customerAtom(ref.id) : IDLE))
  const product = value(useAtomValue(ref?.kind === "product" ? productAtom(ref.id) : IDLE))
  const ticket = value(useAtomValue(ref?.kind === "ticket" ? ticketAtom(ref.id) : IDLE))
  return useMemo(() => {
    if (ref === undefined) return null
    if (ref.kind === "order" && order !== undefined) return orderRecord(consoleOrderDetail(order).order, ref)
    if (ref.kind === "customer" && customer !== undefined) {
      const d = consoleCustomerDetail(customer)
      return customerRecord(d.customer, d.currency, ref)
    }
    if (ref.kind === "product" && product !== undefined) {
      return productRecord(consoleProductDetail(product, undefined).product, ref)
    }
    if (ref.kind === "ticket" && ticket !== undefined) return ticketRecord(ticketOf(ticket.ticket), ref)
    return null
  }, [ref, order, customer, product, ticket])
}

/** A customer's newest orders; an order's chargebacks wait for M13. */
function useRelated(r: ChatRecord): Related {
  const customer = value(useAtomValue(r.kind === "customer" ? customerAtom(r.customer.id) : IDLE))
  return useMemo(() => {
    const d = customer === undefined ? undefined : consoleCustomerDetail(customer)
    return {
      chargebacks: [],
      orders: d?.orders.slice(0, 6) ?? [],
      orderNumber: () => undefined,
      currency: d?.currency ?? (r.kind === "order" ? r.order.currency : "EUR")
    }
  }, [customer, r])
}

/** The person's own messages and the rest, over the conversations of `Chats.list`. */
export function useConsoleChatsSource(list: ChatList): ChatsSource {
  const frame = value(useAtomValue(frameAtom))
  const presence = useAtomValue(presenceAtom)
  const meId = frame?.me.memberId ?? ""
  const meName = frame?.me.name ?? ""
  const teammates = frame?.teammates
  const team = useMemo(() => teammates?.map((t) => ({ id: t.id, name: t.name })) ?? [], [teammates])
  const names = useMemo(() => new Map(team.map((t) => [t.id, t.name])), [team])
  const titles = useMemo(() => new Map(teammates?.map((t) => [t.id, t.roleLabel]) ?? []), [teammates])
  const people = useMemo<ReadonlyArray<ChatPerson>>(
    () => team.map((t) => ({ id: t.id, initial: initialOfName(t.name), name: t.name })),
    [team]
  )
  const rows = useMemo(() => new Map(list.conversations.map((c) => [c.id, c])), [list])
  const conversations = useMemo(() => list.conversations.map(conversationOf), [list])
  const pinned = useMemo(() => new Set(list.conversations.filter((c) => c.pinned).map((c) => c.id)), [list])
  const muted = useMemo(() => new Set(list.conversations.filter((c) => c.muted).map((c) => c.id)), [list])
  const channels = useMemo(() => list.conversations.filter((c) => c.kind === "channel").map((c) => c.name), [list])

  /* The composers' text, per conversation and per thread, for as long as the tab is open. */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  const setDraft = useCallback((key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v })), [])
  const sendTyping = useAtomSet(chatWrites.typing, { mode: "promiseExit" })
  const lastTyped = useRef(new Map<string, number>())
  const typed = (conversationId: string) => {
    const now = Date.now()
    if (now - (lastTyped.current.get(conversationId) ?? 0) < TYPING_EVERY_MS) return
    lastTyped.current.set(conversationId, now)
    void sendTyping({ payload: { conversationId } })
  }
  const writes = useChatWrites({ team, setDraft, typed })

  const profileOf = (senderId: string, name: string): ChatProfile => {
    if (senderId === INSYTE.id) return INSYTE_PROFILE
    const known = names.get(senderId)
    return {
      name: known ?? name,
      title: titles.get(senderId) ?? (known === undefined ? "Leverancier" : "Teamlid"),
      // Where they are is not known yet: the card reads the time where the reader is.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      presence: presence.includes(senderId) ? "online" : "offline",
      ...(known === undefined ? {} : { memberId: senderId })
    }
  }

  const useConversation = (c: { id: string }): ConversationView => {
    const page = value(useAtomValue(chatMessagesAtom(c.id)))
    return useMemo(() =>
      page === undefined
        ? { messages: NO_MESSAGES, firstUnread: undefined, ready: false }
        : {
          messages: page.messages.map((m) => messageOf(m, meId, names)),
          firstUnread: firstUnreadOf(page.messages, page.lastReadAt, page.conversation.unread, meId),
          ready: true
        }, [page, meId, names])
  }

  const useReplies = (parent: Message): ReadonlyArray<Message> => {
    const thread = value(useAtomValue(chatThreadAtom(`${parent.conversation_id}:${parent.id}`)))
    return useMemo(() => thread?.replies.map((m) => messageOf(m, meId, names)) ?? NO_MESSAGES, [thread, meId, names])
  }

  const useParticipants = (c: { id: string }): ReadonlyArray<Participant> => {
    const members = value(useAtomValue(chatMembersAtom(c.id)))
    return useMemo(() =>
      members?.members.map((m) => ({
        id: m.kind === "insyte" ? INSYTE.id : m.id,
        name: m.name,
        presence: presence.includes(m.id) ? "online" as const : "offline" as const,
        title: m.title
      })) ?? NO_PARTICIPANTS, [members, presence])
  }

  /** "{wie} is bezig" above a conversation's composer, until a few seconds after the last frame. */
  const useTyping = (key: string) => {
    const all = useAtomValue(typingAtom)
    const [, tick] = useState(0)
    const now = Date.now()
    const t = all.find((x) => x.conversationId === key && x.principalId !== meId && now - x.at < TYPING_MS)
    useEffect(() => {
      if (t === undefined) return
      const timer = setTimeout(() => tick((n) => n + 1), TYPING_MS - (Date.now() - t.at) + 50)
      return () => clearTimeout(timer)
    }, [t])
    return t === undefined ? undefined : { id: t.principalId, name: firstName(names.get(t.principalId) ?? "Iemand") }
  }

  const dmIdFor = (senderId: string) =>
    list.conversations.find((c) => c.kind === "dm" && c.dmMemberId === senderId)?.id ?? `conv_dm_${senderId}`

  return {
    me: { id: meId, name: meName, memberId: meId },
    conversations,
    pinned,
    muted,
    describe: (c) => rows.get(c.id)?.topic || undefined,
    useParticipants,
    useConversation,
    useReplies,
    useTyping,
    draft: (key) => drafts[key] ?? "",
    people,
    rules: { team, available: AVAILABLE },
    profileOf,
    useProfile: (senderId, name): Profile => ({
      ...profileOf(senderId, name),
      channels: names.has(senderId) ? channels : []
    }),
    dmIdFor,
    useRecord,
    useRelated,
    useRecordSearch,
    refOf: () => undefined,
    refsInText: () => [],
    insyte: false,
    attachments: false,
    writes
  }
}
