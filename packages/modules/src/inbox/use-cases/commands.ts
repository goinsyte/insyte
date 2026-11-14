import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents, Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type AssignInput,
  type Before,
  type ComposeInput,
  type ForwardInput,
  InboxRestore,
  type LabelInput,
  type LinkTicketInput,
  MailboxDisconnected,
  MessageQueued,
  NoMailbox,
  type ReadInput,
  type ReplyInput,
  type SnoozeInput,
  type StarInput,
  ThreadChange,
  TicketLinked
} from "../domain/Inbox.ts"
import { ThreadTickets } from "../domain/Ports.ts"
import { bare, mailDomain, mergeParticipants, previewOf } from "./inbound.ts"
import { messagesOf, rowsOf } from "./threads.ts"

/*
 * The inbox's commands (M11 step 2; widgets/04 §B), at Klantenservice · Bewerken; reading a thread (marking it read)
 * at Bekijken. Each change applies at once and has one undo token (`inbox.restore`) that puts the threads back as they
 * were, except a star, a label and the read state, which the design toggles without one. A reply, a forward and a new
 * mail wait out the undo window as `scheduled` messages: the relay's `support` sink sends them after it, and Undo means
 * they never left.
 */

export const RESTORE = "inbox.restore"

interface Locked {
  readonly id: string
  readonly mailboxId: string
  readonly subject: string
  readonly participants: string
  readonly unread: boolean
  readonly starred: boolean
  readonly labels: ReadonlyArray<string>
  readonly assigneeId: string | null
  readonly ticketId: string | null
  readonly customerId: string | null
  readonly archivedAt: Date | null
  readonly snoozedUntil: Date | null
  readonly spamAt: Date | null
  readonly deletedAt: Date | null
  readonly lastMessageAt: Date
  readonly lastMessagePreview: string
}

const lock = Effect.fn("Threads.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const rows = yield* sql<Locked>`
    select id, mailbox_id, subject, participants::text as participants, unread, starred, labels, assignee_id,
           ticket_id, customer_id, archived_at, snoozed_until, spam_at, deleted_at, last_message_at,
           last_message_preview
    from email_threads where id in ${sql.in([...new Set(ids)])} order by id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "thread", id: missing })
  return rows
})

const ms = (d: Date | null) => d?.getTime() ?? null
const at = (n: number | null) => (n === null ? null : new Date(n))

const before = (l: Locked): Before => ({
  id: l.id,
  unread: l.unread,
  starred: l.starred,
  labels: l.labels,
  assigneeId: l.assigneeId,
  ticketId: l.ticketId,
  archivedAt: ms(l.archivedAt),
  snoozedUntil: ms(l.snoozedUntil),
  spamAt: ms(l.spamAt),
  deletedAt: ms(l.deletedAt),
  lastMessageAt: l.lastMessageAt.getTime(),
  preview: l.lastMessagePreview
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "thread",
        subjectId: id,
        diff
      })
  )

const answer = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>, restore: InboxRestore | null) =>
  Effect.gen(function*() {
    const undo = restore === null ? null : yield* Undo.issue(sql, { command: RESTORE, compensation: restore })
    return new ThreadChange({ threads: yield* rowsOf(sql, ids), undo })
  })

const none = () => new ThreadChange({ threads: [], undo: null })

/** Selecting a thread reads it; "Markeren als ongelezen" puts the dot back. The reader's own, so no undo. */
export const markRead = Effect.fn("Threads.markRead")(function*(input: typeof ReadInput.Type) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const changed = locked.filter((l) => l.unread === input.read)
      for (const l of changed) yield* sql`update email_threads set unread = ${!input.read} where id = ${l.id}`
      // Reading is not audited (it would fill the log); the open tabs still hear of it.
      if (changed.length > 0) {
        const p = yield* CurrentPrincipal
        const outboxId = yield* Outbox.write(sql, p.workspaceId, {
          type: "records.changed",
          workspaceId: p.workspaceId,
          kind: "thread",
          ids: changed.map((l) => l.id)
        })
        ;(yield* PendingEvents)?.add(outboxId)
      }
      return yield* answer(sql, changed.map((l) => l.id), null)
    })
  )
})

/** "Ster geven" / "Ster verwijderen": a toggle, no undo. */
export const star = Effect.fn("Threads.star")(function*(input: typeof StarInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      if (l!.starred === input.starred) return none()
      yield* sql`update email_threads set starred = ${input.starred} where id = ${l!.id}`
      yield* audit(sql, input.starred ? "thread.starred" : "thread.unstarred", l!.id)
      return yield* answer(sql, [l!.id], null)
    })
  )
})

/** A thread label, on or off (the agent's `thread.label`; no console control yet). */
export const label = Effect.fn("Threads.label")(function*(input: typeof LabelInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      const name = input.label.trim()
      const has = l!.labels.includes(name)
      if (has === input.on || name === "") return none()
      const labels = input.on ? [...l!.labels, name] : l!.labels.filter((x) => x !== name)
      yield* sql`update email_threads set labels = ${labels}::text[] where id = ${l!.id}`
      yield* audit(sql, "thread.labelled", l!.id, { label: name, on: input.on })
      return yield* answer(sql, [l!.id], null)
    })
  )
})

const ASIDE = { archived: "archived_at", spam: "spam_at", trash: "deleted_at" } as const

/** "Archiveren", "Spam melden", "Naar prullenbak": out of the inbox, kept, with Undo. */
export const setAside = Effect.fn("Threads.setAside")(function*(
  input: { readonly ids: ReadonlyArray<string>; readonly as: keyof typeof ASIDE }
) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const going = locked.filter((l) =>
        input.as === "trash" ? l.deletedAt === null : input.as === "spam" ? l.spamAt === null : l.archivedAt === null
      )
      if (going.length === 0) return none()
      for (const l of going) {
        yield* sql`update email_threads set ${sql.literal(ASIDE[input.as])} = now() where id = ${l.id}`
        yield* audit(sql, `thread.${input.as}`, l.id)
      }
      return yield* answer(sql, going.map((l) => l.id), { kind: "fields", threads: going.map(before) })
    })
  )
})

/** "1 uur uitstellen": out of the inbox until then; back by itself when the time comes, or when mail arrives. */
export const snooze = Effect.fn("Threads.snooze")(function*(input: typeof SnoozeInput.Type) {
  yield* Policy.require("support", 2)
  if (input.until <= Date.now()) return yield* new Invalid({ fields: { until: "past" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      for (const l of locked) {
        yield* sql`update email_threads set snoozed_until = ${new Date(input.until)} where id = ${l.id}`
        yield* audit(sql, "thread.snoozed", l.id, { until: input.until })
      }
      return yield* answer(sql, locked.map((l) => l.id), { kind: "fields", threads: locked.map(before) })
    })
  )
})

/** Back in the inbox: out of the archive, spam, the Prullenbak and a snooze. */
export const putBack = Effect.fn("Threads.restore")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const going = locked.filter((l) =>
        l.deletedAt !== null || l.spamAt !== null || l.archivedAt !== null || l.snoozedUntil !== null
      )
      if (going.length === 0) return none()
      for (const l of going) {
        yield* sql`update email_threads set archived_at = null, spam_at = null, deleted_at = null,
                     snoozed_until = null where id = ${l.id}`
        yield* audit(sql, "thread.put_back", l.id)
      }
      return yield* answer(sql, going.map((l) => l.id), { kind: "fields", threads: going.map(before) })
    })
  )
})

/** "Deze mail toewijzen": one teammate, active in the team. */
export const assign = Effect.fn("Threads.assign")(function*(input: typeof AssignInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      if (l!.assigneeId === input.memberId) return none()
      const [m] = yield* sql`select 1 from members where id = ${input.memberId} and deactivated_at is null
                             and removed_at is null`
      if (m === undefined) return yield* new NotFound({ entity: "member", id: input.memberId })
      yield* sql`update email_threads set assignee_id = ${input.memberId} where id = ${l!.id}`
      yield* audit(sql, "thread.assigned", l!.id, { from: l!.assigneeId, to: input.memberId })
      return yield* answer(sql, [l!.id], { kind: "fields", threads: [before(l!)] })
    })
  )
})

/** "Toewijzing verwijderen". */
export const unassign = Effect.fn("Threads.unassign")(function*(input: { readonly id: string }) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      if (l!.assigneeId === null) return none()
      yield* sql`update email_threads set assignee_id = null where id = ${l!.id}`
      yield* audit(sql, "thread.unassigned", l!.id, { from: l!.assigneeId })
      return yield* answer(sql, [l!.id], { kind: "fields", threads: [before(l!)] })
    })
  )
})

/** The customer's side of the thread: who wrote last, or whoever on it is not the team. */
const otherSide = (l: Locked, lastInbound: { name: string; email: string } | undefined) => {
  const parts = JSON.parse(l.participants) as Array<{ name: string; email: string; team: boolean }>
  const found = lastInbound ?? parts.find((p) => !p.team) ?? parts[0]
  if (found === undefined) return undefined
  // A later mail may carry the bare address; the name the thread learnt for it stays.
  const name = found.name || parts.find((p) => p.email === found.email.toLowerCase())?.name || ""
  return { name, email: found.email }
}

/** "Aan ticket koppelen": to a ticket that exists, or a new one from the thread (its subject, who wrote, the line). */
export const linkTicket = Effect.fn("Threads.linkTicket")(function*(input: typeof LinkTicketInput.Type) {
  yield* Policy.require("support", 2)
  const tickets = yield* ThreadTickets
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.threadId])
      if (input.ticketId === undefined && l!.ticketId !== null) {
        const number = yield* tickets.numberOf(sql, l!.ticketId)
        if (number !== undefined) {
          const [thread] = yield* rowsOf(sql, [l!.id])
          return new TicketLinked({
            thread: thread!,
            ticketId: l!.ticketId,
            ticketNumber: number,
            created: false,
            undo: null
          })
        }
      }
      let ticket: { id: string; number: number }
      let created: string | null = null
      if (input.ticketId !== undefined) {
        const number = yield* tickets.numberOf(sql, input.ticketId)
        if (number === undefined) return yield* new NotFound({ entity: "ticket", id: input.ticketId })
        ticket = { id: input.ticketId, number }
      } else {
        const [last] = yield* sql<{ name: string; email: string }>`
          select from_name as name, from_address as email from email_messages
          where thread_id = ${l!.id} and direction = 'inbound' order by sent_at desc limit 1`
        const from = otherSide(l!, last)
        ticket = yield* tickets.make(sql, {
          title: (l!.subject.trim() || "Mail zonder onderwerp").slice(0, 200),
          description: `Van ${from?.name || from?.email || "onbekend"}${from?.email ? ` (${from.email})` : ""}: ${
            l!.lastMessagePreview
          }`.slice(0, 20_000),
          threadId: l!.id,
          customerId: l!.customerId
        })
        created = ticket.id
      }
      yield* sql`update email_threads set ticket_id = ${ticket.id} where id = ${l!.id}`
      yield* audit(sql, "thread.linked", l!.id, { ticketId: ticket.id, created: created !== null })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "linked", thread: before(l!), createdTicketId: created } satisfies InboxRestore
      })
      const [thread] = yield* rowsOf(sql, [l!.id])
      return new TicketLinked({
        thread: thread!,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        created: created !== null,
        undo
      })
    })
  )
})

/* ── what the team sends ──────────────────────────────────────────────────────────────────────── */

interface MailboxRow {
  readonly id: string
  readonly address: string
  readonly label: string
  readonly signature: string
  readonly status: "connected" | "disconnected"
}

const mailboxFor = (sql: SqlClient.SqlClient, id: string) =>
  Effect.gen(function*() {
    const [m] = yield* sql<MailboxRow>`
      select id, address, label, signature, status from mailboxes where id = ${id}`
    if (m === undefined) return yield* new NotFound({ entity: "mailbox", id })
    if (m.status !== "connected") return yield* new MailboxDisconnected({ mailboxId: id })
    return m
  })

const reSubject = (subject: string, prefix: "Re" | "Fwd") => {
  const s = subject.trim()
  return new RegExp(`^${prefix}:`, "i").test(s) ? s : `${prefix}: ${s}`.trim()
}

const withSignature = (body: string, signature: string) =>
  signature.trim() === "" ? body.trim() : `${body.trim()}\n\n${signature.trim()}`

const dutchTime = (d: Date) =>
  new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d)

/** One outgoing message on the caller's transaction, `scheduled`; its send waits out the undo window. */
const queueMessage = Effect.fn("Threads.queueMessage")(function*(
  sql: SqlClient.SqlClient,
  input: {
    readonly threadId: string
    readonly mailbox: MailboxRow
    readonly kind: "message" | "reply" | "forward"
    readonly to: { name: string; email: string }
    readonly subject: string
    readonly text: string
    readonly inReplyTo: string | null
    readonly references: ReadonlyArray<string>
  }
) {
  const principal = yield* CurrentPrincipal
  const domain = yield* mailDomain
  const id = mintId("eml")
  yield* sql`
    insert into email_messages (id, workspace_id, thread_id, rfc822_message_id, in_reply_to, "references", direction,
                                kind, from_name, from_address, "to", subject, body_text, sent_by, send_state)
    values (${id}, ${principal.workspaceId}, ${input.threadId}, ${`${id}@${domain}`}, ${input.inReplyTo},
            ${[...input.references]}::text[], 'outbound', ${input.kind}, ${input.mailbox.label},
            ${input.mailbox.address.toLowerCase()}, ${JSON.stringify([input.to])}::jsonb, ${
    input.subject.slice(0, 998)
  },
            ${input.text}, ${principal.id}, 'scheduled')`
  const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
    type: "thread.message_queued",
    workspaceId: principal.workspaceId,
    userId: principal.userId ?? "system",
    messageId: id
  }, { afterSeconds: UNDO_SECONDS })
  return { id, outboxId }
})

const kick = (outboxId: string) =>
  Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId], { afterSeconds: UNDO_SECONDS }))

const queued = (sql: SqlClient.SqlClient, threadId: string, messageId: string, undo: MessageQueued["undo"]) =>
  Effect.gen(function*() {
    const [thread] = yield* rowsOf(sql, [threadId])
    const message = (yield* messagesOf(sql, threadId)).find((m) => m.id === messageId)!
    return new MessageQueued({ thread: thread!, message, undo })
  })

/** What a message put in line on the caller's transaction answers: its thread, its outbox event, and its way back. */
export interface Queued {
  readonly threadId: string
  readonly messageId: string
  readonly outboxId: string
  readonly compensation: InboxRestore
}

/**
 * A reply in `threadId` on the caller's transaction (the caller checked the seat), without an undo token of its own: a
 * ticket's "Klant informeren" holds one token for the mail and the ticket together.
 */
export const replyOn = Effect.fn("Threads.replyOn")(function*(sql: SqlClient.SqlClient, input: typeof ReplyInput.Type) {
  const [l] = yield* lock(sql, [input.threadId])
  const mailbox = yield* mailboxFor(sql, l!.mailboxId)
  const [last] = yield* sql<{ name: string; email: string; rfc822: string; references: ReadonlyArray<string> }>`
        select from_name as name, from_address as email, rfc822_message_id as rfc822, "references"
        from email_messages where thread_id = ${l!.id} order by sent_at desc, created_at desc limit 1`
  const [lastInbound] = yield* sql<{ name: string; email: string }>`
        select from_name as name, from_address as email from email_messages
        where thread_id = ${l!.id} and direction = 'inbound' order by sent_at desc limit 1`
  const to = otherSide(l!, lastInbound)
  if (to === undefined) return yield* new Invalid({ fields: { to: "none" } })
  const text = withSignature(input.body, mailbox.signature)
  const { id, outboxId: held } = yield* queueMessage(sql, {
    threadId: l!.id,
    mailbox,
    kind: "reply",
    to,
    subject: reSubject(l!.subject, "Re"),
    text,
    // Kept bare, as the inbound ones are; the sink puts the brackets on.
    inReplyTo: last === undefined ? null : last.rfc822,
    references: last === undefined ? [] : [...last.references.map(bare), last.rfc822].slice(-20)
  })
  yield* sql`update email_threads set last_message_at = now(), last_message_preview = ${previewOf(input.body)},
                   unread = false where id = ${l!.id}`
  yield* audit(sql, "thread.replied", l!.id, { messageId: id })
  const compensation: InboxRestore = { kind: "unsent", messageId: id, thread: before(l!), removeThread: false }
  return { threadId: l!.id, messageId: id, outboxId: held, compensation } satisfies Queued
})

/** One undo token for a message just put in line, and the thread as the screen shows it. */
const settled = (sql: SqlClient.SqlClient, q: Queued) =>
  Effect.gen(function*() {
    const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: q.compensation, outboxIds: [q.outboxId] })
    return { change: yield* queued(sql, q.threadId, q.messageId, undo), outboxId: q.outboxId }
  })

/** "Antwoord versturen": to who wrote last, in their thread, from the mailbox it came in at. */
export const reply = Effect.fn("Threads.reply")(function*(input: typeof ReplyInput.Type) {
  yield* Policy.require("support", 2)
  if (input.body.trim() === "") return yield* new Invalid({ fields: { body: "required" } })
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) => Effect.flatMap(replyOn(sql, input), (q) => settled(sql, q)))
  yield* kick(outboxId)
  return change
})

/** "Doorsturen": the whole thread to someone, with a note above it, from the thread's mailbox. */
export const forward = Effect.fn("Threads.forward")(function*(input: typeof ForwardInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.threadId])
      const mailbox = yield* mailboxFor(sql, l!.mailboxId)
      const messages = yield* messagesOf(sql, l!.id)
      const quoted = messages.map((m) =>
        [
          "---------- Doorgestuurd bericht ----------",
          `Van: ${m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email}`,
          `Datum: ${dutchTime(new Date(m.sentAt))}`,
          `Onderwerp: ${m.subject}`,
          "",
          m.bodyText
        ].join("\n")
      ).join("\n\n")
      const note = input.note?.trim() ?? ""
      const text = withSignature(note === "" ? quoted : `${note}\n\n${quoted}`, mailbox.signature)
      const { id, outboxId: held } = yield* queueMessage(sql, {
        threadId: l!.id,
        mailbox,
        kind: "forward",
        to: { name: "", email: input.to.trim().toLowerCase() },
        subject: reSubject(l!.subject, "Fwd"),
        text,
        inReplyTo: null,
        references: []
      })
      yield* audit(sql, "thread.forwarded", l!.id, { messageId: id, to: input.to.trim().toLowerCase() })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "unsent", messageId: id, thread: before(l!), removeThread: false } satisfies InboxRestore,
        outboxIds: [held]
      })
      return { change: yield* queued(sql, l!.id, id, undo), outboxId: held }
    })
  )
  yield* kick(outboxId)
  return change
})

/**
 * A new thread with its first message on the caller's transaction (the caller checked the seat), without an undo token
 * of its own; `ticketId` links the thread to the ticket it was written from.
 */
export const composeOn = Effect.fn("Threads.composeOn")(function*(
  sql: SqlClient.SqlClient,
  input: typeof ComposeInput.Type & { readonly ticketId?: string | undefined }
) {
  const principal = yield* CurrentPrincipal
  const [chosen] = input.mailboxId !== undefined
    ? [{ id: input.mailboxId }]
    : yield* sql<{ id: string }>`select id from mailboxes where status = 'connected'
                                     order by is_default desc, created_at limit 1`
  if (chosen === undefined) return yield* new NoMailbox()
  const mailbox = yield* mailboxFor(sql, chosen.id)
  const to = { name: "", email: input.to.trim().toLowerCase() }
  const threadId = mintId("thr")
  const [customer] = yield* sql<{ id: string }>`
        select id from customers where lower(email) = ${to.email} and deleted_at is null and merged_into is null
        order by last_order_at desc nulls last limit 1`
  const participants = mergeParticipants(
    [],
    [{ name: mailbox.label, email: mailbox.address }, to],
    new Set([
      mailbox.address.toLowerCase()
    ])
  )
  yield* sql`
        insert into email_threads (id, workspace_id, mailbox_id, subject, participants, last_message_at,
                                   last_message_preview, unread, assignee_id, customer_id, ticket_id)
        values (${threadId}, ${principal.workspaceId}, ${mailbox.id}, ${input.subject.trim().slice(0, 998)},
                ${JSON.stringify(participants)}::jsonb, now(), ${previewOf(input.body)}, false, ${principal.id},
                ${customer?.id ?? null}, ${input.ticketId ?? null})`
  const { id, outboxId: held } = yield* queueMessage(sql, {
    threadId,
    mailbox,
    kind: "message",
    to,
    subject: input.subject.trim(),
    text: withSignature(input.body, mailbox.signature),
    inReplyTo: null,
    references: []
  })
  yield* audit(sql, "thread.composed", threadId, { messageId: id })
  const [l] = yield* lock(sql, [threadId])
  const compensation: InboxRestore = { kind: "unsent", messageId: id, thread: before(l!), removeThread: true }
  return { threadId, messageId: id, outboxId: held, compensation } satisfies Queued
})

/** "Nieuwe e-mail": a thread of its own, at the top, with the writer on it. */
export const compose = Effect.fn("Threads.compose")(function*(input: typeof ComposeInput.Type) {
  yield* Policy.require("support", 2)
  if (input.body.trim() === "") return yield* new Invalid({ fields: { body: "required" } })
  if (input.subject.trim() === "") return yield* new Invalid({ fields: { subject: "required" } })
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) => Effect.flatMap(composeOn(sql, input), (q) => settled(sql, q)))
  yield* kick(outboxId)
  return change
})

const decodeRestore = Schema.decodeUnknownEffect(InboxRestore)

const putFields = (sql: SqlClient.SqlClient, t: Before) =>
  sql`update email_threads set unread = ${t.unread}, starred = ${t.starred}, labels = ${[...t.labels]}::text[],
        assignee_id = (select id from members where id = ${t.assigneeId}), ticket_id = ${t.ticketId},
        archived_at = ${at(t.archivedAt)}, snoozed_until = ${at(t.snoozedUntil)}, spam_at = ${at(t.spamAt)},
        deleted_at = ${at(t.deletedAt)}, last_message_at = ${new Date(t.lastMessageAt)},
        last_message_preview = ${t.preview}
      where id = ${t.id}`

/** `Shared.undo`'s compensation: the threads as they were, a message that never left, a ticket made taken away. */
export const restore = Effect.fn("Inbox.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("support", 2)
  switch (undo.kind) {
    case "fields":
      for (const t of undo.threads) {
        yield* putFields(sql, t)
        yield* audit(sql, "thread.restored", t.id)
      }
      return
    case "unsent":
      // The outbox row is cancelled by the redeem; the message never left, so it is taken away.
      yield* sql`delete from email_messages where id = ${undo.messageId} and send_state = 'scheduled'`
      if (undo.removeThread) {
        yield* sql`delete from email_threads where id = ${undo.thread.id}
                   and not exists (select 1 from email_messages where thread_id = ${undo.thread.id})`
        yield* audit(sql, "thread.removed", undo.thread.id)
      } else {
        yield* putFields(sql, undo.thread)
        yield* audit(sql, "thread.unsent", undo.thread.id, { messageId: undo.messageId })
      }
      return
    case "linked": {
      yield* putFields(sql, undo.thread)
      if (undo.createdTicketId !== null) yield* (yield* ThreadTickets).remove(sql, undo.createdTicketId)
      yield* audit(sql, "thread.unlinked", undo.thread.id)
      return
    }
  }
})
