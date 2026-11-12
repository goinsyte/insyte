import type { ActionView, ConversationRow, MessageRow } from "@insyte/modules/chats/domain/Chats"
import { INSYTE, memberFrom, statusFrom } from "@insyte/ui/app/chats/commands"
import type { Message } from "@insyte/ui/app/chats/source"
import type { Conversation } from "@insyte/ui/app/lib/types/domain"
import type { ChatAction, ChatCommandId } from "@insyte/ui/data-source"

/*
 * `Chats.*` in the design's words (M11 step 4): a conversation as the panel and the header read it, a message with
 * its thread summary and its card, and a command's text turned into what the server takes (a member's id, a status
 * code) and back into what the card says. A `.tsx` without markup, as `chat-writes.tsx` is: the screen's types reach the
 * design's data seam, which `tsconfig.strict.json` does not hold.
 */

const iso = (ms: number) => new Date(ms).toISOString()

export const firstName = (name: string) => name.split(" ")[0] ?? name

/** A channel and a supplier's shared channel are both a `#` conversation in the design; a DM is a person's. */
export const conversationOf = (c: ConversationRow): Conversation => ({
  id: c.id,
  type: c.kind === "dm" ? "dm" : "group",
  name: c.name,
  participants: [],
  last_message_at: iso(c.lastMessageAt ?? c.createdAt),
  last_message_preview: c.preview,
  unread_count: c.unread,
  messages: []
})

/** The server's word for a ticket's status, as `/status` reads it back ("Bezig"). */
const STATUS_WORD: Record<string, string> = {
  intake: "nieuw",
  in_progress: "bezig",
  awaiting_reply: "wacht",
  done: "klaar"
}

/** A card's argument as the person typed it: the teammate's first name for `/toewijzen`, the status word for `/status`. */
const argShown = (a: ActionView, names: ReadonlyMap<string, string>): string | undefined => {
  if (a.arg === null) return undefined
  if (a.command === "assign") return firstName(names.get(a.arg) ?? a.arg)
  if (a.command === "status") return STATUS_WORD[a.arg] ?? a.arg
  return a.arg
}

/** A card as the design draws it. Its "Ongedaan maken" is only offered to who ran it: the server keeps it theirs. */
const actionOf = (a: ActionView, meId: string, names: ReadonlyMap<string, string>): ChatAction => {
  const arg = argShown(a, names)
  return {
    id: a.id,
    command: a.command,
    ...(a.target === null ? {} : { target: a.target }),
    ...(arg === undefined ? {} : { arg }),
    by: a.by,
    state: a.state,
    ...(a.decidedBy === null ? {} : { decidedBy: firstName(a.decidedBy.name) }),
    ...(a.undoUntil === null || a.createdBy !== meId ? {} : { undoUntil: a.undoUntil }),
    ...(a.error === null ? {} : { error: a.error })
  }
}

/** A command's text as the server takes it; `undefined` where it names no one or no status it knows. */
export const argSent = (
  command: ChatCommandId,
  arg: string | undefined,
  team: ReadonlyArray<{ id: string; name: string }>
): string | undefined => {
  if (arg === undefined) return undefined
  if (command === "assign") return memberFrom(arg, team)?.id
  if (command === "status") return statusFrom(arg)?.value
  return arg
}

export const messageOf = (m: MessageRow, meId: string, names: ReadonlyMap<string, string>): Message => ({
  id: m.id,
  conversation_id: m.conversationId,
  sender_id: m.author.kind === "insyte" ? INSYTE.id : m.author.id,
  sender_name: m.author.kind === "insyte" ? INSYTE.name : m.author.name,
  body: m.body,
  at: iso(m.createdAt),
  ...(m.reactions.length === 0 ? {} : { reactions: m.reactions.map((r) => ({ ...r })) }),
  ...(m.records.length === 0 ? {} : { records: m.records.map((r) => ({ ...r })) }),
  ...(m.action === null ? {} : { action: actionOf(m.action, meId, names) }),
  ...(m.editedAt === null ? {} : { edited_at: iso(m.editedAt) }),
  deleted: m.deleted,
  pinned: m.pinnedAt !== null,
  mentionsMe: m.author.id !== meId && m.mentions.includes(meId),
  ...(m.replyCount === 0
    ? {}
    : {
      thread: {
        count: m.replyCount,
        lastAt: iso(m.lastReplyAt ?? m.createdAt),
        // The server lists the newest first; the summary's faces read oldest to newest, as the design's do.
        people: m.replyAuthors.toReversed().map((p) => ({ id: p.id, name: p.name }))
      }
    })
})

/** Where the "Nieuw" line goes: the first message after the person last read, not their own. */
export const firstUnreadOf = (
  messages: ReadonlyArray<MessageRow>,
  lastReadAt: number | null,
  unread: number,
  meId: string
): string | undefined => {
  if (lastReadAt === null) return unread > 0 ? messages[Math.max(0, messages.length - unread)]?.id : undefined
  return messages.find((m) => m.createdAt > lastReadAt && m.author.id !== meId)?.id
}
