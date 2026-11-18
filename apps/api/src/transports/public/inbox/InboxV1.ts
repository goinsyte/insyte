import type { ChatMessagesQuery, ThreadsQuery } from "@insyte/api/http/groups/InboxGroup"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { ChatsService } from "@insyte/modules/chats/Chats"
import { InboxService } from "@insyte/modules/inbox/Inbox"
import { withChat } from "@insyte/modules/inbox/use-cases/chat/lazy"
import { page } from "@insyte/modules/inbox/use-cases/paged"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { conflict, notFound, scopeMissing, validation, type WriteRefusal, writeV1 } from "../shared/errors.ts"
import { invalid } from "../shared/paging.ts"
import {
  channelsV1,
  chatMessagesV1,
  chatMessageV1,
  chatV1,
  queuedReplyV1,
  threadDetailV1,
  threadPageV1,
  threadStateV1,
  Untrusted
} from "./present.ts"

/*
 * The inbox for a key (M11, M15 step 8, M19.2, M19.3): its threads a page at a time, one thread with its messages, the
 * team's chats and the stores' chat channels, at Klantenservice · Bekijken; a reply, an assignment, archiving, taking a
 * chat over for a teammate and handing it back, at Bewerken, each once per `Idempotency-Key`. Over the same use cases
 * as the console, so a key reads what a person with its role and stores reads: every mail, the chats of its stores, the
 * team's channels and no one's direct messages.
 */

type Refusal =
  | WriteRefusal
  | { readonly _tag: "TakenOver" }
  | { readonly _tag: "ThreadClosed" }
  | { readonly _tag: "MailboxDisconnected" }
  | { readonly _tag: "NotAMember" }
  | { readonly _tag: "EmptyMessage" }

/** The inbox's refusals in the V1 envelope. */
const inboxV1 = (e: Refusal) => {
  switch (e._tag) {
    case "TakenOver":
      return conflict("taken_over")
    case "ThreadClosed":
      return conflict("closed")
    case "MailboxDisconnected":
      return conflict("mailbox_disconnected")
    case "NotAMember":
      return notFound({ entity: "conversation" })
    case "EmptyMessage":
      return validation({ body: "required" })
    default:
      return writeV1(e)
  }
}

/** How the words are marked for whoever reads them: an agent's key reads them as data (`present.ts`). */
export const untrustedFor = Effect.map(
  CurrentPrincipal,
  (p): Untrusted => (p.kind === "agent" ? Untrusted.marked : Untrusted.plain)
)

const make = Effect.gen(function*() {
  const inbox = yield* InboxService
  const chats = yield* ChatsService
  /** The thread as it is now: what the change answered, or a read where nothing changed. */
  const stateOf = (id: string, threads: ReadonlyArray<Parameters<typeof threadStateV1>[0]>) =>
    threads[0] === undefined
      ? Effect.map(inbox.get(id), (d) => threadStateV1(d.thread))
      : Effect.succeed(threadStateV1(threads[0]))
  return {
    threads: (query: ThreadsQuery, u: Untrusted) =>
      page({
        folder: query.folder,
        mailboxId: query.mailbox_id,
        channel: query.channel,
        storeId: query.store_id,
        q: query.q,
        cursor: query.cursor,
        limit: query.limit
      }).pipe(
        Effect.map((p) => threadPageV1(p, u)),
        Effect.catchTags({ Forbidden: scopeMissing, Invalid: () => invalid("cursor") })
      ),
    thread: (id: string, u: Untrusted) =>
      inbox.get(id).pipe(
        Effect.map((d) => threadDetailV1(d, u)),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: () => notFound({ entity: "thread" }) })
      ),
    reply: (id: string, body: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.reply", id, body],
        Effect.map(inbox.reply({ threadId: id, body }), queuedReplyV1)
      ).pipe(Effect.catch(inboxV1)),
    assign: (id: string, memberId: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.assign", id, memberId],
        Effect.flatMap(inbox.assign({ id, memberId }), (c) => stateOf(id, c.threads))
      ).pipe(Effect.catch(inboxV1)),
    unassign: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.unassign", id],
        Effect.flatMap(inbox.unassign({ id }), (c) => stateOf(id, c.threads))
      ).pipe(Effect.catch(inboxV1)),
    archive: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.archive", id],
        Effect.flatMap(inbox.archive({ ids: [id] }), (c) => stateOf(id, c.threads))
      ).pipe(Effect.catch(inboxV1)),
    takeOver: (id: string, memberId: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.take_over", id, memberId],
        withChat((c) => c.takeOverFor({ threadId: id, memberId })).pipe(
          Effect.map((c) => threadStateV1(c.thread)),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      ).pipe(Effect.catch(inboxV1)),
    handBack: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["thread.hand_back", id],
        Effect.map(inbox.handBack({ threadId: id }), (c) => threadStateV1(c.thread))
      ).pipe(Effect.catch(inboxV1)),
    chats: (u: Untrusted) =>
      chats.list.pipe(
        Effect.map((l) => ({ data: l.conversations.map((c) => chatV1(c, u)) })),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    chatMessages: (id: string, query: ChatMessagesQuery, u: Untrusted) =>
      chats.messages({
        conversationId: id,
        ...(query.before === undefined ? {} : { before: query.before }),
        ...(query.limit === undefined ? {} : { limit: Math.min(100, Math.max(1, Math.floor(query.limit))) })
      }).pipe(
        Effect.map((p) => chatMessagesV1(p, u)),
        Effect.catchTags({
          Forbidden: scopeMissing,
          NotFound: () => notFound({ entity: "conversation" }),
          NotAMember: () => notFound({ entity: "conversation" })
        })
      ),
    postChatMessage: (id: string, body: string, replyTo: string | undefined, u: Untrusted, key?: string) =>
      Idempotency.once(
        key,
        ["chat.post", id, body, replyTo ?? null],
        Effect.map(
          chats.send({ conversationId: id, body, ...(replyTo === undefined ? {} : { replyTo }) }),
          (c) => chatMessageV1(c.message, u)
        )
      ).pipe(Effect.catch(inboxV1)),
    channels: inbox.channels.pipe(Effect.map(channelsV1), Effect.catchTag("Forbidden", scopeMissing))
  }
})

/**
 * The inbox, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class InboxV1 extends Context.Service<InboxV1, Effect.Success<typeof make>>()("api-worker/InboxV1") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(InboxService.layer, ChatsService.layer))
  )
}
