import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Config, Effect, Option } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { PendingEvents, Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type Address, ATTACHMENT_MAX_BYTES, type InboundMail } from "../domain/Inbox.ts"

/*
 * A mail that arrived (M11 step 1; integrations.md §3.4): at the forwarding address, through Cloudflare Email Routing
 * and the Worker's `email()` handler, or the dev route that feeds the same path. Inside the mailbox's workspace, as
 * `system`. It joins the thread one of its `In-Reply-To` or `References` ids names, in the same mailbox, or starts one.
 * The same mail delivered twice (Email Routing retries) is one message. New mail wakes its thread: back in the inbox,
 * unread, out of the archive and its snooze. The HTML body and the attachments go to R2; the text stays in Postgres.
 */

/** The domain Insyte's forwarding addresses and its own Message-IDs are on. */
export const mailDomain = Effect.orDie(Config.String("INBOUND_MAIL_DOMAIN").pipe(Config.withDefault("in.goinsyte.com")))

/** `<id@domain>`, as a header carries it, without its brackets and in lower case, so ids compare. */
export const bare = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase()

/** The mail's own words for the row's line: no quoted history, one line, 200 characters. */
export const previewOf = (text: string) => {
  const lines: Array<string> = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue
    // The client's line above the quoted history ends the message ("On … wrote:", "Op … schreef …:").
    if (/^\s*(On|Op)\s.+(wrote|schreef)[^:]*:\s*$/i.test(line)) break
    if (/^-{2,}\s*(Original Message|Oorspronkelijk bericht|Doorgestuurd bericht|Forwarded message)/i.test(line)) break
    lines.push(line)
  }
  return lines.join(" ").replace(/\s+/g, " ").trim().slice(0, 200)
}

/** Everyone on the thread, once each, the mailbox's own addresses marked as the team. */
export const mergeParticipants = (
  current: ReadonlyArray<{ name: string; email: string; team: boolean }>,
  added: ReadonlyArray<Address>,
  team: ReadonlySet<string>
) => {
  const out = [...current]
  for (const a of added) {
    const email = a.email.trim().toLowerCase()
    if (email === "") continue
    const at = out.findIndex((p) => p.email === email)
    if (at === -1) out.push({ name: a.name.trim(), email, team: team.has(email) })
    else if (out[at]!.name === "" && a.name.trim() !== "") out[at] = { ...out[at]!, name: a.name.trim() }
  }
  return out
}

interface Mailbox {
  readonly id: string
  readonly address: string
  readonly forwardingAddress: string | null
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "bijlage"

/** One mail into its mailbox, on the caller's transaction: answers the thread and message ids. */
export const store = Effect.fn("Inbox.store")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  mailbox: Mailbox,
  mail: InboundMail
) {
  const domain = yield* mailDomain
  const files = yield* FileStore
  const rfc822 = mail.messageId === null ? `${mintId("msg")}@${domain}` : bare(mail.messageId)
  const [seen] = yield* sql<{ id: string; threadId: string }>`
    select m.id, m.thread_id from email_messages m join email_threads t on t.id = m.thread_id
    where t.mailbox_id = ${mailbox.id} and m.rfc822_message_id = ${rfc822} and m.direction = 'inbound' limit 1`
  if (seen !== undefined) return { threadId: seen.threadId, messageId: seen.id, duplicate: true }

  const asked = [mail.inReplyTo, ...mail.references].filter((id): id is string => id !== null).map(bare)
  const [joined] = asked.length === 0 ? [] : yield* sql<{ threadId: string }>`
    select m.thread_id from email_messages m join email_threads t on t.id = m.thread_id
    where t.mailbox_id = ${mailbox.id} and m.rfc822_message_id in ${sql.in(asked)}
    order by m.sent_at desc limit 1`

  const team = new Set([
    mailbox.address.toLowerCase(),
    ...(mailbox.forwardingAddress === null ? [] : [mailbox.forwardingAddress])
  ])
  // The sender's `Date:`, never later than now: a mail dated in the future would sort above every reply to it.
  const now = new Date()
  const sentAt = mail.date === null || mail.date > now ? now : mail.date
  const messageId = mintId("eml")
  let threadId = joined?.threadId
  let participants: Array<{ name: string; email: string; team: boolean }> = []
  if (threadId === undefined) {
    threadId = mintId("thr")
    const [customer] = yield* sql<{ id: string }>`
      select id from customers where lower(email) = ${mail.from.email.toLowerCase()} and deleted_at is null
        and merged_into is null order by last_order_at desc nulls last limit 1`
    yield* sql`insert into email_threads (id, workspace_id, mailbox_id, subject, participants, last_message_at,
                                          customer_id)
               values (${threadId}, ${workspaceId}, ${mailbox.id}, ${mail.subject.slice(0, 998)}, '[]'::jsonb,
                       ${sentAt}, ${customer?.id ?? null})`
  } else {
    const [row] = yield* sql<{ participants: string }>`
      select participants::text as participants from email_threads where id = ${threadId} for update`
    participants = JSON.parse(row!.participants) as typeof participants
  }
  participants = mergeParticipants(participants, [mail.from, ...mail.to, ...mail.cc], team)

  let htmlKey: string | null = null
  if (mail.html !== null && mail.html.trim() !== "") {
    htmlKey = `${workspaceId}/mail/${messageId}.html`
    yield* files.put(htmlKey, new TextEncoder().encode(mail.html), "text/html; charset=utf-8").pipe(Effect.orDie)
  }
  yield* sql`
    insert into email_messages (id, workspace_id, thread_id, rfc822_message_id, in_reply_to, "references", direction,
                                kind, from_name, from_address, "to", cc, subject, body_text, body_html_key, sent_at)
    values (${messageId}, ${workspaceId}, ${threadId}, ${rfc822},
            ${mail.inReplyTo === null ? null : bare(mail.inReplyTo)}, ${mail.references.map(bare)}::text[],
            'inbound', 'message', ${mail.from.name.trim()}, ${mail.from.email.trim().toLowerCase()},
            ${JSON.stringify(mail.to)}::jsonb, ${JSON.stringify(mail.cc)}::jsonb, ${mail.subject.slice(0, 998)},
            ${mail.text}, ${htmlKey}, ${sentAt})`

  let kept = 0
  for (const [i, a] of mail.attachments.entries()) {
    if (a.bytes.byteLength > ATTACHMENT_MAX_BYTES) continue
    const fileId = mintId("fil")
    const key = `${workspaceId}/attachments/${fileId}/${safeName(a.filename)}`
    yield* files.put(key, a.bytes, a.mime).pipe(Effect.orDie)
    yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id)
               values (${fileId}, ${workspaceId}, ${key}, ${a.filename.slice(0, 255) || "bijlage"}, ${a.mime},
                       ${a.bytes.byteLength}, 'attachment', 'email_message', ${messageId})`
    yield* sql`insert into attachments (id, workspace_id, message_id, file_id, inline, content_id, position)
               values (${mintId("att")}, ${workspaceId}, ${messageId}, ${fileId}, ${a.inline}, ${a.contentId}, ${i})`
    if (!a.inline) kept += 1
  }

  yield* sql`
    update email_threads set
      participants = ${JSON.stringify(participants)}::jsonb,
      last_message_at = greatest(last_message_at, ${sentAt}),
      last_message_preview = case when last_message_at <= ${sentAt} then ${previewOf(mail.text)}
                                  else last_message_preview end,
      unread = true, has_inbound = true, has_attachments = has_attachments or ${kept > 0},
      archived_at = null, snoozed_until = null
    where id = ${threadId}`
  yield* sql`update mailboxes set last_synced_at = now() where id = ${mailbox.id}` // Automations hear of it (M12 step 3): "E-mail ontvangen", and "Antwoord van klant" when it answers an open thread.
  ;(yield* PendingEvents)?.add(
    yield* Outbox.write(sql, workspaceId, {
      type: "thread.received",
      workspaceId,
      threadId,
      messageId,
      reply: joined !== undefined
    })
  )
  yield* Audit.write(sql, workspaceId, { kind: "system", id: "system" }, {
    action: "thread.received",
    subjectType: "thread",
    subjectId: threadId,
    diff: { messageId, attachments: kept }
  })
  return { threadId, messageId, duplicate: false }
})

/**
 * The `email()` handler's and the dev route's way in: the mailbox a forwarding address is, then the mail into it. Once
 * it is committed the relay is kicked, where there is one, so the inbox's open tabs hear of it now rather than at the
 * next sweep.
 */
export const receive = Effect.fn("Inbox.receive")(function*(to: string, mail: InboundMail) {
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: string; mailboxId: string }>`select * from mailbox_route(${to.trim().toLowerCase()})`
  )
  if (route === undefined) return undefined
  const pending: Array<string> = []
  const stored = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [mailbox] = yield* sql<Mailbox>`
        select id, address, forwarding_address from mailboxes where id = ${route.mailboxId} for update`
      if (mailbox === undefined) return undefined
      return yield* store(sql, route.workspaceId, mailbox, mail)
    })
  ).pipe(
    Effect.provideService(CurrentWorkspace, { id: route.workspaceId as never }),
    Effect.provideService(PendingEvents, { add: (id) => void pending.push(id) })
  )
  const relay = yield* Effect.serviceOption(Relay)
  if (pending.length > 0 && Option.isSome(relay)) yield* relay.value.kick(pending)
  return stored
})
