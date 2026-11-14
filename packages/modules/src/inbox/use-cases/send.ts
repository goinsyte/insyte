import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type MailTry, retryAfter } from "../../shared/domain/MailRetry.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Senders from "../../shared/use-cases/Senders.ts"

/*
 * The relay's `support` sink (M11 step 2): a message the team wrote, once its undo window has passed, through the
 * mailbox it is from. For the forwarding mailbox that is Insyte's sending domain in the mailbox's name, answered to the
 * mailbox's own address, threaded by its headers. A message undone in the meantime is gone and sends nothing; one sent
 * already (a second delivery) is left alone. The provider busy or out: the message stays in line and is tried again
 * later from the same sender (`MailRetry.ts`), its try again answered for the relay to kick. A mail the provider
 * refuses, or that still does not go after its last try, is `failed` with its reason, for the thread to show; it is
 * not tried again after that, since the team decides whether to write it again.
 */

interface Queued {
  readonly id: string
  readonly workspaceId: string
  readonly threadId: string
  readonly rfc822MessageId: string
  readonly inReplyTo: string | null
  readonly references: ReadonlyArray<string>
  readonly to: string
  readonly subject: string
  readonly bodyText: string
  readonly sendState: "scheduled" | "sending" | "sent" | "failed"
  readonly label: string
  readonly address: string
  readonly status: "connected" | "disconnected"
}

const angle = (id: string) => `<${id}>`

export const sendQueued = Effect.fn("Inbox.sendQueued")(function*(
  sql: SqlClient.SqlClient,
  messageId: string,
  retry: MailTry = {}
) {
  const attempt = retry.attempt ?? 1
  const [m] = yield* sql<Queued>`
    select e.id, e.workspace_id, e.thread_id, e.rfc822_message_id, e.in_reply_to, e."references", e."to"::text as to,
           e.subject, e.body_text, e.send_state, b.label, b.address, b.status
    from email_messages e join email_threads t on t.id = e.thread_id join mailboxes b on b.id = t.mailbox_id
    where e.id = ${messageId} and e.direction = 'outbound' for update of e`
  if (m === undefined || m.sendState !== "scheduled") return
  const [to] = JSON.parse(m.to) as Array<{ name: string; email: string }>
  const failed = (reason: string) =>
    sql`update email_messages set send_state = 'failed', send_error = ${reason.slice(0, 500)} where id = ${m.id}`
  if (m.status !== "connected") yield* failed("De mailbox is ontkoppeld.")
  else if (to === undefined) yield* failed("Geen ontvanger.")
  else {
    const from = retry.from !== undefined
      ? retry.from
      : (yield* Senders.customerSender(sql, "support.message")).from ?? null
    const sent = yield* Senders.sendToCustomer(sql, {
      kind: "support.message",
      to: to.email,
      sender: m.label,
      reference: m.id,
      support: {
        subject: m.subject,
        text: m.bodyText,
        replyTo: m.address,
        messageId: angle(m.rfc822MessageId),
        inReplyTo: m.inReplyTo === null ? null : angle(m.inReplyTo),
        references: m.references.map(angle)
      }
    }, { from }).pipe(Effect.as(null), Effect.catchTag("MailNotSent", (e) => Effect.succeed(e)))
    const afterSeconds = sent === null ? undefined : retryAfter(sent, attempt)
    if (sent === null) {
      yield* sql`update email_messages set send_state = 'sent', sent_at = now(), send_error = null where id = ${m.id}`
    } else if (afterSeconds !== undefined) {
      yield* Effect.logWarning("support mail tried again later", { messageId: m.id, attempt, reason: sent.reason })
      const outboxId = yield* Outbox.write(sql, m.workspaceId, {
        type: "thread.message_queued",
        workspaceId: m.workspaceId,
        userId: "system",
        messageId: m.id,
        attempt: attempt + 1,
        from
      }, { afterSeconds })
      return { outboxId, afterSeconds }
    } else {
      yield* Effect.logWarning("support mail not sent", { messageId: m.id, reason: sent.reason })
      yield* failed("De mail is niet verstuurd.")
    }
  }
  // The thread's open tabs show it sent, or failed.
  const outboxId = yield* Outbox.write(sql, m.workspaceId, {
    type: "records.changed",
    workspaceId: m.workspaceId,
    kind: "thread",
    ids: [m.threadId]
  })
  ;(yield* PendingEvents)?.add(outboxId)
  return undefined
})
