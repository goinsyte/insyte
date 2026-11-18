import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestV1, NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { List, Page } from "../Paging.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"
import { ApiKeyAuth } from "../Security.ts"

/*
 * The inbox (M11, M15 step 8): mail threads and website chats with their messages, the team's chat channels, and the
 * stores' chat channels; a reply, an assignment, archiving, and taking a chat over or handing it back. Every text a
 * shopper wrote is personal data, so every endpoint needs `support.read`, and a page holds only what the inbox shows.
 *
 * Not in `PublicApi.ts`: the public Worker loads this group with its first request (ADR-0041 §3), and the documents at
 * `/v1/openapi.json` and `/v1/docs` add it to the API there (`DocumentedApi`). So it carries the prefix and the key
 * door that `PublicApi` gives its own groups.
 */

const Participant = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  team: Schema.Boolean.annotate({ description: "The team's own mailbox address." })
})

/** A thread as the inbox's list shows it: a mail thread or a website chat. */
export const Thread = Schema.Struct({
  id: Schema.String,
  channel: Schema.Literals(["email", "webchat"]),
  mailbox_id: Schema.NullOr(Schema.String).annotate({
    description: "The mailbox a mail thread is in; null for a chat."
  }),
  channel_id: Schema.NullOr(Schema.String).annotate({
    description: "The chat channel a chat came in on; null for mail."
  }),
  store_id: Schema.NullOr(Schema.String).annotate({ description: "The store a chat came in at; mail is no store's." }),
  subject: Schema.String,
  participants: Schema.Array(Participant),
  preview: Schema.String.annotate({ description: "The start of the last message." }),
  last_message_at: Schema.String,
  unread: Schema.Boolean,
  starred: Schema.Boolean,
  labels: Schema.Array(Schema.String),
  assignee_id: Schema.NullOr(Schema.String),
  ticket_id: Schema.NullOr(Schema.String),
  customer_id: Schema.NullOr(Schema.String),
  has_attachments: Schema.Boolean,
  archived_at: Schema.NullOr(Schema.String),
  snoozed_until: Schema.NullOr(Schema.String),
  spam_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
  agent_state: Schema.NullOr(Schema.Literals(["handled", "handed_over", "active"])).annotate({
    description:
      "A chat's: Insyte's customer agent handled it, handed it over to the team (or a person took it over), or holds it."
  }),
  taken_over_by: Schema.NullOr(Schema.String).annotate({ description: "The member who took a chat over." }),
  closed_at: Schema.NullOr(Schema.String),
  order_number: Schema.NullOr(Schema.String).annotate({
    description: "A chat's customer's latest order in its store."
  })
}).annotate({ identifier: "Thread" })

const Address = Schema.Struct({ name: Schema.String, email: Schema.String })

export const ThreadMessage = Schema.Struct({
  id: Schema.String,
  direction: Schema.Literals(["inbound", "outbound"]),
  kind: Schema.Literals(["message", "reply", "forward"]),
  from: Address,
  to: Schema.Array(Address),
  cc: Schema.Array(Address),
  subject: Schema.String,
  body_text: Schema.String,
  sent_at: Schema.String,
  sent_by: Schema.NullOr(Schema.String).annotate({ description: "Who of the team sent it." }),
  send_state: Schema.NullOr(Schema.Literals(["scheduled", "sending", "sent", "failed"])).annotate({
    description: "What went out: scheduled while its undo window lasts."
  }),
  attachments: Schema.Array(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    mime: Schema.String,
    size: Schema.Int
  }))
}).annotate({ identifier: "ThreadMessage" })

export const ChatEntry = Schema.Struct({
  id: Schema.String,
  author: Schema.Literals(["shopper", "team", "agent", "system"]),
  text: Schema.String,
  at: Schema.String,
  sent_by: Schema.NullOr(Schema.String),
  send_state: Schema.Literals(["scheduled", "sent"]).annotate({
    description: "scheduled while its undo window lasts: the shopper does not see it yet."
  })
}).annotate({ identifier: "ChatEntry" })

/** One thread with its messages (mail) or its chat (a website chat), oldest first, and a chat's handover. */
export const ThreadDetailV1 = Schema.Struct({
  ...Thread.fields,
  messages: Schema.Array(ThreadMessage).annotate({ description: "A mail thread's messages, oldest first." }),
  chat: Schema.Array(ChatEntry).annotate({ description: "A website chat's messages, oldest first." }),
  handover: Schema.NullOr(Schema.Struct({
    reason: Schema.String,
    at: Schema.String,
    picked_up_at: Schema.NullOr(Schema.String),
    picked_up_by: Schema.NullOr(Schema.String),
    handed_back_at: Schema.NullOr(Schema.String)
  }))
}).annotate({ identifier: "ThreadDetail" })

/** What a change to a thread leaves: its state, without its words. */
export const ThreadState = Schema.Struct({
  id: Schema.String,
  channel: Schema.Literals(["email", "webchat"]),
  store_id: Schema.NullOr(Schema.String),
  assignee_id: Schema.NullOr(Schema.String),
  archived_at: Schema.NullOr(Schema.String),
  agent_state: Schema.NullOr(Schema.Literals(["handled", "handed_over", "active"])),
  taken_over_by: Schema.NullOr(Schema.String),
  closed_at: Schema.NullOr(Schema.String)
}).annotate({ identifier: "ThreadState" })

/** A reply in line: it leaves (mail) or shows in the shopper's widget (chat) once `sends_at` has passed. */
export const QueuedReply = Schema.Struct({
  object: Schema.Literal("reply"),
  id: Schema.String,
  thread_id: Schema.String,
  channel: Schema.Literals(["email", "webchat"]),
  send_state: Schema.Literal("scheduled"),
  sends_at: Schema.String.annotate({ description: "When it leaves; until then a person can still call it off." })
}).annotate({ identifier: "QueuedReply" })

export const ThreadPageV1 = Page(Thread)

export const Folder = Schema.Literals(["all", "unassigned", "mine", "linked", "archive", "trash", "spam"]).annotate({
  description:
    "all is the inbox (not archived, spam, in the trash or snoozed); unassigned and linked (to a ticket) within it; archive, spam and trash."
})
export const ThreadChannel = Schema.Literals(["email", "webchat"])

export const ThreadsQuery = Schema.Struct({
  folder: Schema.optional(Folder),
  mailbox_id: Schema.optional(Schema.String).annotate({ description: "A mailbox's id, or a chat channel's." }),
  channel: Schema.optional(ThreadChannel),
  store_id: Schema.optional(Schema.String).annotate({ description: "One store's chats; mail is no store's." }),
  q: Schema.optional(Schema.String).annotate({ description: "The subject, who is on it, and what it says." }),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.FiniteFromString).annotate({ description: "1–200, 50 by default." })
})
export type ThreadsQuery = typeof ThreadsQuery.Type

/** One of the team's chats: a channel, a channel shared with a supplier, or a DM the key is in (none). */
export const Chat = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["channel", "dm", "supplier_channel"]),
  name: Schema.String,
  topic: Schema.String,
  supplier_id: Schema.NullOr(Schema.String),
  member_count: Schema.Int,
  last_message_at: Schema.NullOr(Schema.String),
  preview: Schema.String,
  created_at: Schema.String
}).annotate({ identifier: "Chat" })

export const ChatMessage = Schema.Struct({
  id: Schema.String,
  chat_id: Schema.String,
  author: Schema.Struct({
    kind: Schema.Literals(["member", "supplier", "insyte", "system"]),
    id: Schema.String,
    name: Schema.String
  }),
  body: Schema.String,
  mentions: Schema.Array(Schema.String).annotate({ description: "The member ids it names." }),
  records: Schema.Array(Schema.Struct({ kind: Schema.String, id: Schema.String })),
  reply_to: Schema.NullOr(Schema.String),
  reply_count: Schema.Int,
  pinned_at: Schema.NullOr(Schema.String),
  edited_at: Schema.NullOr(Schema.String),
  deleted: Schema.Boolean,
  created_at: Schema.String
}).annotate({ identifier: "ChatMessage" })

export const ChatMessagesV1 = Schema.Struct({
  chat: Chat,
  data: Schema.Array(ChatMessage).annotate({
    description: "Oldest first: the newest page, or the one before `before`."
  }),
  next_cursor: Schema.NullOr(Schema.String).annotate({ description: "Pass as `before` for the older messages." })
})

export const ChatMessagesQuery = Schema.Struct({
  before: Schema.optional(Schema.String).annotate({ description: "A message id: the messages before it." }),
  limit: Schema.optional(Schema.FiniteFromString).annotate({ description: "1–100, 50 by default." })
})
export type ChatMessagesQuery = typeof ChatMessagesQuery.Type

export const ChannelV1 = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("webchat"),
  store_id: Schema.String,
  store_name: Schema.String,
  status: Schema.Literals(["connected", "disconnected"]),
  greeting: Schema.String,
  threads: Schema.Int.annotate({ description: "The chats in the inbox." }),
  theme_updated: Schema.Boolean.annotate({
    description: "Whether the store's theme loads the chat; a connected chat shows nothing until it does."
  }),
  connected_at: Schema.String
}).annotate({ identifier: "Channel" })

export const ChannelsV1 = Schema.Struct({
  available: Schema.Boolean.annotate({ description: "Whether this Insyte can run the website chat at all." }),
  data: Schema.Array(ChannelV1)
})

const ReadErrors = [ScopeMissingV1, NotFoundV1]
const READ = "Needs `support.read`."
const WRITE = "Needs `support.write`."

export class InboxGroup extends HttpApiGroup.make("inbox")
  .add(
    HttpApiEndpoint.get("threads", "/threads", {
      query: ThreadsQuery,
      success: ThreadPageV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      `The inbox's mail threads and website chats, newest first, a page at a time, with how many match. Every mail, and the chats of the key's stores. ${READ}`
    ),
    HttpApiEndpoint.get("thread", "/threads/:id", {
      params: ById,
      success: ThreadDetailV1,
      error: ReadErrors
    }).annotate(OpenApi.Description, `One thread with its messages, or a chat with its messages and handover. ${READ}`),
    HttpApiEndpoint.post("reply", "/threads/:id/replies", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        body: Schema.String.annotate({ description: "Plain text; the mailbox's signature is added." })
      }),
      success: QueuedReply,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      `Replies to who wrote last, from the mailbox it came in at (mail), or in the shopper's widget (a chat). It waits out a few seconds first. A chat someone took over, or one that closed, is \`ConflictV1\` (\`taken_over\`, \`closed\`). ${WRITE}`
    ),
    HttpApiEndpoint.post("assign", "/threads/:id/assign", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        member_id: Schema.String.annotate({ description: "An active member, from /members." })
      }),
      success: ThreadState,
      error: WriteErrors
    }).annotate(OpenApi.Description, `Puts one teammate on the thread. ${WRITE}`),
    HttpApiEndpoint.post("unassign", "/threads/:id/unassign", {
      params: ById,
      headers: Writes,
      success: ThreadState,
      error: WriteErrors
    }).annotate(OpenApi.Description, `Takes the teammate off the thread. ${WRITE}`),
    HttpApiEndpoint.post("archive", "/threads/:id/archive", {
      params: ById,
      headers: Writes,
      success: ThreadState,
      error: WriteErrors
    }).annotate(OpenApi.Description, `Moves the thread out of the inbox into the archive. ${WRITE}`),
    HttpApiEndpoint.post("takeOver", "/threads/:id/take_over", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        member_id: Schema.String.annotate({ description: "The active member who takes the chat over." })
      }),
      success: ThreadState,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      `Gives a website chat to a teammate, as their "Overnemen": Insyte's customer agent stays silent on it, and only they reply. An agent's key cannot. ${WRITE}`
    ),
    HttpApiEndpoint.post("handBack", "/threads/:id/hand_back", {
      params: ById,
      headers: Writes,
      success: ThreadState,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      `Gives a website chat back to Insyte's customer agent ("Teruggeven aan Insyte"). ${WRITE}`
    ),
    HttpApiEndpoint.get("chats", "/chats", {
      success: List(Chat),
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      `The team's chat channels and the channels shared with suppliers. People's direct messages are theirs: a key reads none. ${READ}`
    ),
    HttpApiEndpoint.get("chatMessages", "/chats/:id/messages", {
      params: ById,
      query: ChatMessagesQuery,
      success: ChatMessagesV1,
      error: ReadErrors
    }).annotate(OpenApi.Description, `A chat's messages, 50 at a time going back. ${READ}`),
    HttpApiEndpoint.post("postChatMessage", "/chats/:id/messages", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        body: Schema.String,
        reply_to: Schema.optional(Schema.String).annotate({ description: "A message id: an answer in its thread." })
      }),
      success: ChatMessage,
      error: WriteErrors
    }).annotate(OpenApi.Description, `Posts in one of the team's chats, as the key. ${READ}`),
    HttpApiEndpoint.get("channels", "/channels", {
      success: ChannelsV1,
      error: [ScopeMissingV1]
    }).annotate(OpenApi.Description, `The stores' website chats: on or off, and how many chats each has. ${READ}`)
  )
  .middleware(ApiKeyAuth)
  .prefix("/v1")
  .annotate(OpenApi.Title, "Inbox")
{}

/** The group's own API, for its routes only: the public Worker serves it beside `PublicApi`. */
export class InboxApi extends HttpApi.make("insyte").add(InboxGroup) {}
