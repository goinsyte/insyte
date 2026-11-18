import { dataBlock, defused } from "@insyte/modules/ai/domain/Guards"
import type { ConversationRow, MessageRow, MessagesPage } from "@insyte/modules/chats/domain/Chats"
import type { ChannelStatus } from "@insyte/modules/inbox/domain/Chat"
import type { MessageQueued, ThreadDetail, ThreadRow } from "@insyte/modules/inbox/domain/Inbox"
import type { ThreadPage } from "@insyte/modules/inbox/use-cases/paged"
import { iso } from "../shared/time.ts"

/*
 * The inbox in the public shape (M11, M15 step 8): a thread, a page of them, one with its messages, a change's state,
 * a reply in line, the team's chats and the stores' chat channels. Only what the inbox shows.
 *
 * Words someone outside the team controls (a shopper's mail and chat, the names and addresses they send, a supplier's
 * message, what a teammate quotes of them) are data for whoever reads them, never instructions. An agent reads them
 * through `Untrusted.marked` (MCP, and an agent's key on `/v1`): each longer text inside an `<untrusted_text>` block and
 * every angle bracket defused (‹ ›), as Insyte's own model reads a shopper's words (ai.md §6.3), so nothing in a mail can
 * close the block or pose as the tool's own answer. A script reads the words as they came (`Untrusted.plain`).
 */

export interface Untrusted {
  /** A longer text (a subject, a body, a preview). */
  readonly text: (s: string) => string
  /** A short one (a name, an address, a file name). */
  readonly word: (s: string) => string
}

const BLOCK = "untrusted_text"

export const Untrusted = {
  plain: { text: (s: string) => s, word: (s: string) => s } satisfies Untrusted,
  marked: {
    text: (s: string) => (s === "" ? "" : dataBlock(BLOCK, s)),
    word: defused
  } satisfies Untrusted
}

const channelOf = (t: ThreadRow) => (t.channel === null ? "email" as const : t.channel)

const threadV1 = (t: ThreadRow, u: Untrusted) => ({
  id: t.id,
  channel: channelOf(t),
  mailbox_id: t.channel === null ? t.mailboxId : null,
  channel_id: t.channel === null ? null : t.mailboxId,
  store_id: t.storeId,
  subject: u.text(t.subject),
  participants: t.participants.map((p) => ({ name: u.word(p.name), email: u.word(p.email), team: p.team })),
  preview: u.text(t.preview),
  last_message_at: iso(t.lastMessageAt)!,
  unread: t.unread,
  starred: t.starred,
  labels: [...t.labels],
  assignee_id: t.assigneeId,
  ticket_id: t.ticketId,
  customer_id: t.customerId,
  has_attachments: t.hasAttachments,
  archived_at: iso(t.archivedAt),
  snoozed_until: iso(t.snoozedUntil),
  spam_at: iso(t.spamAt),
  deleted_at: iso(t.deletedAt),
  agent_state: t.agentState,
  taken_over_by: t.takenOverBy,
  closed_at: iso(t.closedAt),
  order_number: t.orderNumber
})

export const threadPageV1 = (page: ThreadPage, u: Untrusted) => ({
  data: page.rows.map((t) => threadV1(t, u)),
  next_cursor: page.nextCursor,
  total: page.total
})

export const threadDetailV1 = (d: ThreadDetail, u: Untrusted) => ({
  ...threadV1(d.thread, u),
  messages: d.messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    kind: m.kind,
    from: { name: u.word(m.from.name), email: u.word(m.from.email) },
    to: m.to.map((a) => ({ name: u.word(a.name), email: u.word(a.email) })),
    cc: m.cc.map((a) => ({ name: u.word(a.name), email: u.word(a.email) })),
    subject: u.text(m.subject),
    body_text: u.text(m.bodyText),
    sent_at: iso(m.sentAt)!,
    sent_by: m.sentBy,
    send_state: m.sendState,
    attachments: m.attachments.map((a) => ({ id: a.id, name: u.word(a.name), mime: a.mime, size: a.size }))
  })),
  chat: d.chat.map((c) => ({
    id: c.id,
    author: c.author,
    text: u.text(c.text),
    at: iso(c.at)!,
    sent_by: c.sentBy,
    send_state: c.sendState
  })),
  handover: d.handover === null ? null : {
    reason: u.text(d.handover.reason),
    at: iso(d.handover.at)!,
    picked_up_at: iso(d.handover.pickedUpAt),
    picked_up_by: d.handover.pickedUpBy,
    handed_back_at: iso(d.handover.handedBackAt)
  }
})

/** A change's answer: the thread's state, and none of its words (an idempotent answer is kept a day). */
export const threadStateV1 = (t: ThreadRow) => ({
  id: t.id,
  channel: channelOf(t),
  store_id: t.storeId,
  assignee_id: t.assigneeId,
  archived_at: iso(t.archivedAt),
  agent_state: t.agentState,
  taken_over_by: t.takenOverBy,
  closed_at: iso(t.closedAt)
})

/** A reply in line, without its words or its addressee (an idempotent answer is kept a day). */
export const queuedReplyV1 = (q: MessageQueued) => ({
  object: "reply" as const,
  id: q.message.id,
  thread_id: q.thread.id,
  channel: channelOf(q.thread),
  send_state: "scheduled" as const,
  sends_at: iso(q.undo.until)!
})

export const chatV1 = (c: ConversationRow, u: Untrusted) => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  topic: c.topic,
  supplier_id: c.supplierId,
  member_count: c.memberCount,
  last_message_at: iso(c.lastMessageAt),
  preview: u.text(c.preview),
  created_at: iso(c.createdAt)!
})

export const chatMessageV1 = (m: MessageRow, u: Untrusted) => ({
  id: m.id,
  chat_id: m.conversationId,
  author: { kind: m.author.kind, id: m.author.id, name: u.word(m.author.name) },
  body: u.text(m.body),
  mentions: [...m.mentions],
  records: m.records.map((r) => ({ kind: r.kind, id: r.id })),
  reply_to: m.replyTo,
  reply_count: m.replyCount,
  pinned_at: iso(m.pinnedAt),
  edited_at: iso(m.editedAt),
  deleted: m.deleted,
  created_at: iso(m.createdAt)!
})

export const chatMessagesV1 = (p: MessagesPage, u: Untrusted) => ({
  chat: chatV1(p.conversation, u),
  data: p.messages.map((m) => chatMessageV1(m, u)),
  next_cursor: p.before
})

export const channelsV1 = (s: ChannelStatus) => ({
  available: s.available,
  data: s.channels.map((c) => ({
    id: c.id,
    kind: c.kind,
    store_id: c.storeId,
    store_name: c.storeName,
    status: c.status,
    greeting: c.greeting,
    threads: c.threads,
    theme_updated: c.themeUpdated,
    connected_at: iso(c.connectedAt)!
  }))
})
