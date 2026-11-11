import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Mailer } from "../../shared/domain/Mailer.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"

/*
 * The relay's `support` sink (M11 step 2): a message the team wrote, once its undo window has passed, through the
 * mailbox it is from. For the forwarding mailbox that is Insyte's sending domain in the mailbox's name, answered to the
 * mailbox's own address, threaded by its headers. A message undone in the meantime is gone and sends nothing; one sent
 * already (a second delivery) is left alone. A mail the provider refuses is `failed` with its reason, for the thread
 * to show; it is not retried, since the team decides whether to write it again.
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

export const sendQueued = Effect.fn("Inbox.sendQueued")(function*(sql: SqlClient.SqlClient, messageId: string) {
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
    const sent = yield* (yield* Mailer).send({
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
    }).pipe(Effect.match({ onFailure: (e) => e.reason, onSuccess: () => null }))
    if (sent === null) {
      yield* sql`update email_messages set send_state = 'sent', sent_at = now(), send_error = null where id = ${m.id}`
    } else {
      yield* Effect.logWarning("support mail not sent", { messageId: m.id, reason: sent })
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
})
