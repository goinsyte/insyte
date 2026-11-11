import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  type ActionView,
  ChatList,
  ChatMembers,
  ChatThread,
  ConversationRow,
  MessageRow,
  type MessagesInput,
  MessagesPage,
  NotAMember,
  type RecordRef
} from "../domain/Chats.ts"

/*
 * The chat reads (M11 step 4; widgets/04 §C), at Klantenservice · Bekijken. A channel is the team's, so anyone at that
 * level reads it; a DM only its two members. The person's own row in `conversation_members` (pinned, muted, read up to)
 * is made the first time they open a conversation. A workspace with no channel yet gets `#algemeen`, as the design's
 * first day has it. A thread's replies stay out of the stream unless they were also sent to it.
 */

/** Active members whose role reads chats: who a channel reaches. */
export const READERS = `select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
  where m.deactivated_at is null and m.removed_at is null
    and (r.id = 'owner' or coalesce((r.levels ->> 'support')::int, 0) >= 1)`

/** In the stream: a top-level message, or a thread's answer also sent to the conversation. */
const IN_STREAM = `(m.reply_to is null or m.also_in_channel)`

export interface Conversation {
  readonly id: string
  readonly kind: ConversationRow["kind"]
  readonly name: string
  readonly archivedAt: Date | null
  readonly mine: boolean
}

/**
 * The conversation, if the principal may be in it: any channel at Klantenservice · Bekijken, a DM only for its two. An
 * archived channel, or a DM between others, is `NotAMember`; an unknown id `NotFound`.
 */
export const conversationOf = Effect.fn("Chats.conversationOf")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  options: { readonly lock?: boolean } = {}
) {
  const principal = yield* CurrentPrincipal
  const [row] = yield* sql<Conversation>`
    select c.id, c.kind, c.name, c.archived_at,
           exists (select 1 from conversation_members x where x.conversation_id = c.id
                   and x.principal_id = ${principal.id}) as mine
    from conversations c where c.id = ${id} ${options.lock === true ? sql`for update of c` : sql``}`
  if (row === undefined) return yield* new NotFound({ entity: "conversation", id })
  if (row.archivedAt !== null || (row.kind === "dm" && !row.mine)) {
    return yield* new NotAMember({ conversationId: id })
  }
  return row
})

/** The principal's own row in a conversation, made the first time they open or write in it. */
export const joinIn = (sql: SqlClient.SqlClient, conversationId: string, readNow: boolean) =>
  Effect.flatMap(
    CurrentPrincipal,
    (p) =>
      sql`insert into conversation_members (workspace_id, conversation_id, principal_kind, principal_id, last_read_at)
          values (${p.workspaceId}, ${conversationId}, ${p.kind}, ${p.id}, ${readNow ? new Date() : null})
          on conflict (conversation_id, principal_id) do update
            set last_read_at = case when ${readNow} then now() else conversation_members.last_read_at end`
  )

/** Who hears of a change in the conversation: a DM's two members, or the workspace's room (`null`) for a channel. */
export const audienceOf = Effect.fn("Chats.audienceOf")(function*(sql: SqlClient.SqlClient, c: Conversation) {
  if (c.kind !== "dm") return null
  const rows = yield* sql<{ principalId: string }>`
    select principal_id from conversation_members where conversation_id = ${c.id} order by principal_id`
  return rows.map((r) => r.principalId)
})

interface ConversationSql {
  readonly id: string
  readonly kind: ConversationRow["kind"]
  readonly name: string
  readonly topic: string
  readonly supplierId: string | null
  readonly createdAt: Date
  readonly lastMessageAt: Date | null
  readonly pinned: boolean | null
  readonly muted: boolean | null
  readonly dmMemberId: string | null
  readonly dmName: string | null
  readonly memberCount: number
  readonly unread: number
  readonly preview: string | null
}

const ms = (d: Date | null) => d?.getTime() ?? null

/** The conversations the principal sees, or the ones named, as the area panel lists them. */
export const conversationRows = Effect.fn("Chats.conversationRows")(function*(
  sql: SqlClient.SqlClient,
  ids?: ReadonlyArray<string>
) {
  const principal = yield* CurrentPrincipal
  const rows = yield* sql<ConversationSql>`
    select c.id, c.kind, c.name, c.topic, c.supplier_id, c.created_at, c.last_message_at, me.pinned, me.muted,
           other.principal_id as dm_member_id, coalesce(ou.name, '') as dm_name,
           case when c.kind = 'dm' then (select count(*)::int from conversation_members x where x.conversation_id = c.id)
                else (select count(*)::int from (${sql.literal(READERS)}) r) end as member_count,
           (select count(*)::int from messages m
            where m.conversation_id = c.id and ${sql.literal(IN_STREAM)} and m.deleted_at is null
              and m.author_id <> ${principal.id}
              and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)) as unread,
           (select m.body from messages m
            where m.conversation_id = c.id and ${sql.literal(IN_STREAM)} and m.deleted_at is null
            order by m.created_at desc, m.id desc limit 1) as preview
    from conversations c
    left join conversation_members me on me.conversation_id = c.id and me.principal_id = ${principal.id}
    left join lateral (select x.principal_id from conversation_members x
                       where c.kind = 'dm' and x.conversation_id = c.id and x.principal_id <> ${principal.id}
                       limit 1) other on true
    left join members om on om.id = other.principal_id
    left join auth."user" ou on ou.id = om.user_id
    where c.archived_at is null and (c.kind <> 'dm' or me.principal_id is not null)
      ${ids === undefined ? sql`` : sql`and c.id in ${sql.in([...ids, ""])}`}
    order by (c.kind = 'dm'), lower(c.name)`
  return rows.map((r) =>
    new ConversationRow({
      id: r.id,
      kind: r.kind,
      name: r.kind === "dm" ? (r.dmName || "Oud-collega") : r.name,
      topic: r.topic,
      supplierId: r.supplierId,
      dmMemberId: r.dmMemberId,
      memberCount: r.memberCount,
      unread: r.unread,
      lastMessageAt: ms(r.lastMessageAt),
      preview: (r.preview ?? "").slice(0, 120),
      pinned: r.pinned ?? false,
      muted: r.muted ?? false,
      createdAt: r.createdAt.getTime()
    })
  )
})

export const conversationRow = Effect.fn("Chats.conversationRow")(function*(sql: SqlClient.SqlClient, id: string) {
  const [row] = yield* conversationRows(sql, [id])
  if (row === undefined) return yield* new NotAMember({ conversationId: id })
  return row
})

interface MessageSql {
  readonly id: string
  readonly conversationId: string
  readonly authorKind: string
  readonly authorId: string
  readonly authorName: string
  readonly body: string
  readonly mentions: ReadonlyArray<string>
  readonly records: string
  readonly replyTo: string | null
  readonly alsoInChannel: boolean
  readonly pinnedAt: Date | null
  readonly editedAt: Date | null
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly replyCount: number
  readonly lastReplyAt: Date | null
  readonly replyAuthors: string
  readonly reactions: string
  readonly actionId: string | null
  readonly command: ActionView["command"] | null
  readonly targetKind: RecordRef["kind"] | null
  readonly targetId: string | null
  readonly arg: string | null
  readonly by: ActionView["by"] | null
  readonly state: ActionView["state"] | null
  readonly createdBy: string | null
  readonly decidedBy: string | null
  readonly decidedByName: string | null
  readonly undoUntil: Date | null
  readonly error: string | null
}

const SELECT = (me: string) =>
  `m.id, m.conversation_id, m.author_kind, m.author_id, coalesce(au.name, '') as author_name, m.body, m.mentions,
  m.records::text as records, m.reply_to, m.also_in_channel, m.pinned_at, m.edited_at, m.deleted_at, m.created_at,
  (select count(*)::int from messages r where r.reply_to = m.id and r.deleted_at is null) as reply_count,
  (select max(r.created_at) from messages r where r.reply_to = m.id and r.deleted_at is null) as last_reply_at,
  coalesce((select json_agg(json_build_object('id', x.author_id, 'name', x.name) order by x.at desc)::text
            from (select r.author_id, coalesce(ru.name, '') as name, max(r.created_at) as at from messages r
                  left join members rm on rm.id = r.author_id left join auth."user" ru on ru.id = rm.user_id
                  where r.reply_to = m.id and r.deleted_at is null group by r.author_id, ru.name
                  order by at desc limit 3) x), '[]') as reply_authors,
  coalesce((select json_agg(json_build_object('emoji', e.emoji, 'count', e.n, 'mine', e.mine) order by e.first)::text
            from (select emoji, count(*)::int as n, bool_or(principal_id = '${me.replaceAll("'", "''")}') as mine,
                         min(created_at) as first
                  from message_reactions where message_id = m.id group by emoji) e), '[]') as reactions,
  a.id as action_id, a.command, a.target_kind, a.target_id, a.arg, a.by, a.state, a.created_by, a.decided_by,
  coalesce(du.name, '') as decided_by_name, a.undo_until, a.error`

const FROM = `messages m
  left join members am on am.id = m.author_id left join auth."user" au on au.id = am.user_id
  left join chat_actions a on a.message_id = m.id
  left join members dm on dm.id = a.decided_by left join auth."user" du on du.id = dm.user_id`

const toMessage = (r: MessageSql) =>
  new MessageRow({
    id: r.id,
    conversationId: r.conversationId,
    author: {
      kind: r.authorKind === "member" || r.authorKind === "supplier" || r.authorKind === "insyte"
        ? r.authorKind
        : "system",
      id: r.authorId,
      name: r.authorKind === "insyte" ? "Insyte" : r.authorName || "Oud-collega"
    },
    body: r.deletedAt === null ? r.body : "",
    mentions: r.deletedAt === null ? r.mentions : [],
    // Read as text: the SQL client camelCases the keys of a json value.
    records: r.deletedAt === null ? JSON.parse(r.records) as Array<RecordRef> : [],
    action: r.actionId === null || r.deletedAt !== null
      ? null
      : {
        id: r.actionId,
        command: r.command!,
        target: r.targetKind === null || r.targetId === null ? null : { kind: r.targetKind, id: r.targetId },
        arg: r.arg,
        by: r.by!,
        state: r.state!,
        createdBy: r.createdBy!,
        decidedBy: r.decidedBy === null ? null : { id: r.decidedBy, name: r.decidedByName ?? "" },
        undoUntil: ms(r.undoUntil),
        error: r.error
      },
    reactions: r.deletedAt === null
      ? JSON.parse(r.reactions) as Array<{ emoji: string; count: number; mine: boolean }>
      : [],
    replyTo: r.replyTo,
    alsoInChannel: r.alsoInChannel,
    replyCount: r.replyCount,
    lastReplyAt: ms(r.lastReplyAt),
    replyAuthors: JSON.parse(r.replyAuthors) as Array<{ id: string; name: string }>,
    pinnedAt: r.deletedAt === null ? ms(r.pinnedAt) : null,
    editedAt: ms(r.editedAt),
    deleted: r.deletedAt !== null,
    createdAt: r.createdAt.getTime()
  })

/** Messages by id, as the stream draws them. */
export const messageRows = Effect.fn("Chats.messageRows")(function*(
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>
) {
  const principal = yield* CurrentPrincipal
  if (ids.length === 0) return []
  const rows = yield* sql<MessageSql>`
    select ${sql.literal(SELECT(principal.id))} from ${sql.literal(FROM)}
    where m.id in ${sql.in([...ids])} order by m.created_at, m.id`
  return rows.map(toMessage)
})

export const messageRow = Effect.fn("Chats.messageRow")(function*(sql: SqlClient.SqlClient, id: string) {
  const [row] = yield* messageRows(sql, [id])
  if (row === undefined) return yield* new NotFound({ entity: "message", id })
  return row
})

/** The message, in a conversation the principal may be in. */
export const messageIn = Effect.fn("Chats.messageIn")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  options: { readonly lock?: boolean } = {}
) {
  const [row] = yield* sql<{
    id: string
    conversationId: string
    authorId: string
    replyTo: string | null
    alsoInChannel: boolean
    deletedAt: Date | null
    pinnedAt: Date | null
  }>`select id, conversation_id, author_id, reply_to, also_in_channel, deleted_at, pinned_at from messages
     where id = ${id} ${options.lock === true ? sql`for update` : sql``}`
  if (row === undefined) return yield* new NotFound({ entity: "message", id })
  const conversation = yield* conversationOf(sql, row.conversationId)
  return { ...row, conversation }
})

/** A workspace's first channel, as the design's first day has it. */
const ensureFirstChannel = Effect.fn("Chats.ensureFirstChannel")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  yield* sql`
    insert into conversations (id, workspace_id, kind, name, topic, created_by)
    select ${mintId("cnv")}, ${principal.workspaceId}, 'channel', 'algemeen', 'Alles voor het hele team', 'system'
    where not exists (select 1 from conversations where kind = 'channel')
    on conflict do nothing`
})

/** `Chats.list`: the channels, the shared supplier channels and the person's DMs. */
export const list = Effect.fn("Chats.list")(function*() {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* ensureFirstChannel(sql)
      return new ChatList({ conversations: yield* conversationRows(sql) })
    })
  )
})

/**
 * `Chats.messages`: a page of the stream, newest at the bottom, 50 at a time going up (`before`). Opening a conversation
 * makes the person's row in it; it is read once the newest message is on screen (`Chats.markRead`).
 */
export const messages = Effect.fn("Chats.messages")(function*(input: typeof MessagesInput.Type) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const limit = input.limit ?? 50
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* conversationOf(sql, input.conversationId)
      const [read] = yield* sql<{ lastReadAt: Date | null }>`
        select last_read_at from conversation_members
        where conversation_id = ${input.conversationId} and principal_id = ${principal.id}`
      yield* joinIn(sql, input.conversationId, false)
      const cursor = input.before === undefined
        ? undefined
        : (yield* sql<{ createdAt: Date; id: string }>`
            select created_at, id from messages where id = ${input.before}
              and conversation_id = ${input.conversationId}`)[0]
      const rows = yield* sql<MessageSql>`
        select ${sql.literal(SELECT(principal.id))} from ${sql.literal(FROM)}
        where m.conversation_id = ${input.conversationId} and ${sql.literal(IN_STREAM)}
          ${cursor === undefined ? sql`` : sql`and (m.created_at, m.id) < (${cursor.createdAt}, ${cursor.id})`}
        order by m.created_at desc, m.id desc limit ${limit + 1}`
      const page = rows.slice(0, limit).map(toMessage).reverse()
      return new MessagesPage({
        conversation: yield* conversationRow(sql, input.conversationId),
        messages: page,
        before: rows.length > limit ? page[0]!.id : null,
        lastReadAt: ms(read?.lastReadAt ?? null)
      })
    })
  )
})

/** `Chats.thread`: a message and its replies, oldest first, for the thread column. */
export const thread = Effect.fn("Chats.thread")(function*(messageId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* messageIn(sql, messageId)
      const parentId = m.replyTo ?? m.id
      const replies = yield* sql<{ id: string }>`
        select id from messages where reply_to = ${parentId} order by created_at, id`
      return new ChatThread({
        parent: yield* messageRow(sql, parentId),
        replies: yield* messageRows(sql, replies.map((r) => r.id))
      })
    })
  )
})

/** `Chats.pinnedMessages`: "Vastgezet in #…", the latest pinned first. */
export const pinnedMessages = Effect.fn("Chats.pinnedMessages")(function*(conversationId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* conversationOf(sql, conversationId)
      const rows = yield* sql<{ id: string }>`
        select id from messages where conversation_id = ${conversationId} and pinned_at is not null
          and deleted_at is null order by pinned_at desc`
      const byId = new Map((yield* messageRows(sql, rows.map((r) => r.id))).map((m) => [m.id, m]))
      return rows.map((r) => byId.get(r.id)!)
    })
  )
})

/** `Chats.members`: who is in it, with their role as their title (a channel: everyone who reads chats). */
export const members = Effect.fn("Chats.members")(function*(conversationId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* conversationOf(sql, conversationId)
      const rows = yield* sql<{ id: string; name: string; image: string | null; title: string }>`
        select m.id, coalesce(u.name, '') as name, u.image, r.label as title
        from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
        left join auth."user" u on u.id = m.user_id
        where m.deactivated_at is null and m.removed_at is null
          and ${
        c.kind === "dm"
          ? sql`m.id in (select principal_id from conversation_members where conversation_id = ${c.id})`
          : sql`m.id in (${sql.literal(READERS)})`
      }
        order by lower(coalesce(u.name, '')), m.id`
      return new ChatMembers({
        members: rows.map((r) => ({ id: r.id, kind: "member" as const, name: r.name, image: r.image, title: r.title }))
      })
    })
  )
})
