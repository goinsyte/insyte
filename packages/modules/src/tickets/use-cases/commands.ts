import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { topicOf } from "../domain/Rules.ts"
import {
  type AssignInput,
  type Before,
  type CreateInput,
  MemberNotActive,
  type ReorderInput,
  type SetStatusInput,
  type SnoozeInput,
  TicketChange,
  TicketsRestore,
  type TicketStatus,
  type UpdateInput
} from "../domain/Tickets.ts"
import { rowsOf, ticketScope } from "./tickets.ts"

/*
 * The ticket commands (M11 step 3; widgets/04 §A), inside the role's stores. Every change takes Klantenservice ·
 * Bewerken, and to the trash (or back from it) Beheren. Each applies at once and has one undo token (`tickets.restore`)
 * that puts the tickets back as they were; a new ticket's takes it away. Assigning someone tells them once the undo
 * window has passed, so an undone assignment tells no one. A reorder is cosmetic and has none.
 */

export const RESTORE = "tickets.restore"

interface Locked {
  readonly id: string
  readonly number: string
  readonly title: string
  readonly description: string
  readonly status: TicketStatus
  readonly priority: Before["priority"]
  readonly topic: Before["topic"]
  readonly position: number
  readonly dueAt: Date | null
  readonly resolvedAt: Date | null
  readonly snoozedUntil: Date | null
  readonly archivedAt: Date | null
  readonly deletedAt: Date | null
  readonly spamAt: Date | null
}

const lock = Effect.fn("Tickets.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* ticketScope(sql)
  const rows = yield* sql<Locked>`
    select t.id, t.number, t.title, t.description, t.status, t.priority, t.topic, t.position, t.due_at, t.resolved_at,
           t.snoozed_until, t.archived_at, t.deleted_at, t.spam_at
    from tickets t where t.id in ${sql.in([...new Set(ids)])} and ${scope} order by t.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "ticket", id: missing })
  return rows
})

const ms = (d: Date | null) => d?.getTime() ?? null
const at = (n: number | null) => (n === null ? null : new Date(n))

const before = (l: Locked, extra: Pick<Before, "labels" | "assignees"> = {}): Before => ({
  id: l.id,
  title: l.title,
  description: l.description,
  status: l.status,
  priority: l.priority,
  topic: l.topic,
  dueAt: ms(l.dueAt),
  resolvedAt: ms(l.resolvedAt),
  snoozedUntil: ms(l.snoozedUntil),
  archivedAt: ms(l.archivedAt),
  deletedAt: ms(l.deletedAt),
  spamAt: ms(l.spamAt),
  ...extra
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "ticket",
        subjectId: id,
        diff
      })
  )

const answer = (
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>,
  restore: TicketsRestore | null,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.gen(function*() {
    const undo = restore === null
      ? null
      : yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds })
    return new TicketChange({ tickets: yield* rowsOf(sql, ids), undo })
  })

const none = () => new TicketChange({ tickets: [], undo: null })

/** The members among `ids` who are not active in the team; the first is refused. */
const activeMembers = Effect.fn("Tickets.activeMembers")(function*(
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>
) {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return wanted
  const rows = yield* sql<{ id: string }>`
    select id from members where id in ${sql.in(wanted)} and deactivated_at is null and removed_at is null`
  const active = new Set(rows.map((r) => r.id))
  const gone = wanted.find((id) => !active.has(id))
  if (gone !== undefined) return yield* new MemberNotActive({ memberId: gone })
  return wanted
})

/** Telling the new assignees once the undo window has passed; the person who assigned themself hears nothing. */
const tellAssigned = Effect.fn("Tickets.tellAssigned")(function*(
  sql: SqlClient.SqlClient,
  ticketId: string,
  memberIds: ReadonlyArray<string>
) {
  const principal = yield* CurrentPrincipal
  const told = memberIds.filter((m) => m !== principal.id)
  if (told.length === 0) return []
  const id = yield* Outbox.write(sql, principal.workspaceId, {
    type: "ticket.assigned",
    workspaceId: principal.workspaceId,
    userId: principal.userId ?? "system",
    ticketId,
    memberIds: told,
    by: principal.id
  }, { afterSeconds: UNDO_SECONDS })
  return [id]
})

const kick = (outboxIds: ReadonlyArray<string>) =>
  Effect.flatMap(
    Effect.service(Relay),
    (relay) => outboxIds.length === 0 ? Effect.void : relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  )

const label = (raw: string) => raw.trim()
const labelsOf = (raw: ReadonlyArray<string>) => [...new Set(raw.map(label).filter((l) => l !== ""))]

const writeLabels = (sql: SqlClient.SqlClient, workspaceId: string, ticketId: string, labels: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    yield* sql`delete from ticket_labels where ticket_id = ${ticketId}`
    for (const [i, l] of labels.entries()) {
      yield* sql`insert into ticket_labels (workspace_id, ticket_id, label, position)
                 values (${workspaceId}, ${ticketId}, ${l}, ${i})`
    }
  })

const labelsNow = (sql: SqlClient.SqlClient, ticketId: string) =>
  Effect.map(
    sql<{ label: string }>`select label from ticket_labels where ticket_id = ${ticketId} order by position, label`,
    (rows) => rows.map((r) => r.label)
  )

const assigneesNow = (sql: SqlClient.SqlClient, ticketId: string) =>
  Effect.map(
    sql<{ memberId: string }>`select member_id from ticket_assignees where ticket_id = ${ticketId}
                              order by assigned_at, member_id`,
    (rows) => rows.map((r) => r.memberId)
  )

/** Makes one ticket on the command's transaction; answers its id and the outbox rows telling its assignees. */
/** Where a ticket came from, when it was not written by hand: a chat message ("Ticket maken van bericht", `/ticket`),
 * a plate Insyte drew and someone filed, or a mail thread in the inbox. */
export interface Origin {
  readonly source: "chat" | "insyte" | "email"
  readonly sourceRef?: string
}

const make = Effect.fn("Tickets.make")(function*(
  sql: SqlClient.SqlClient,
  input: typeof CreateInput.Type,
  origin?: Origin
) {
  const principal = yield* CurrentPrincipal
  const title = input.title.trim()
  if (title === "") return yield* new Invalid({ fields: { title: "required" } })
  const assignees = yield* activeMembers(sql, input.assigneeIds ?? [])

  let related: { orderId: string | null; customerId: string | null; storeId: string | null } = {
    orderId: null,
    customerId: null,
    storeId: null
  }
  if (input.related !== undefined) {
    const table = input.related.type === "order" ? "orders" : "customers"
    const scope = yield* inScope(sql, "r.store_id")
    const [row] = yield* sql<{ id: string; storeId: string }>`
      select r.id, r.store_id from ${sql.literal(table)} r where r.id = ${input.related.id} and ${scope}`
    if (row === undefined) return yield* new NotFound({ entity: input.related.type, id: input.related.id })
    related = input.related.type === "order"
      ? { orderId: row.id, customerId: null, storeId: row.storeId }
      : { orderId: null, customerId: row.id, storeId: row.storeId }
  }

  const [counter] = yield* sql<{ n: string }>`
    update workspace_counters set next = next + 1 where kind = 'ticket' returning next - 1 as n`
  const [front] = yield* sql<{ p: number }>`select coalesce(min(position), 0) - 1 as p from tickets`
  const id = mintId("tkt")
  const description = input.description ?? ""
  const status = input.status ?? "intake"
  yield* sql`
    insert into tickets (id, workspace_id, number, title, description, status, priority, position, source, source_ref,
                         store_id, order_id, customer_id, template, topic, due_at, resolved_at, created_by)
    values (${id}, ${principal.workspaceId}, ${Number(counter!.n)}, ${title}, ${description}, ${status},
            ${input.priority ?? "medium"}, ${Number(front?.p ?? -1)}, ${origin?.source ?? "manual"},
            ${origin?.sourceRef ?? null}, ${related.storeId}, ${related.orderId},
            ${related.customerId}, ${input.template ?? null}, ${topicOf(title, description)},
            ${at(input.dueAt ?? null)}, ${status === "done" ? new Date() : null}, ${principal.id})`
  yield* writeLabels(sql, principal.workspaceId, id, labelsOf(input.labels ?? []))
  for (const m of assignees) {
    yield* sql`insert into ticket_assignees (workspace_id, ticket_id, member_id, assigned_by)
               values (${principal.workspaceId}, ${id}, ${m}, ${principal.id})`
  }
  yield* audit(sql, "ticket.created", id, {
    number: Number(counter!.n),
    status,
    priority: input.priority ?? "medium",
    assignees,
    template: input.template ?? null
  })
  return { id, outboxIds: yield* tellAssigned(sql, id, assignees) }
})

/**
 * A ticket made from a mail thread ("Aan ticket koppelen", the inbox slice's `ThreadTickets`), on the inbox's
 * transaction: `make`, with the thread as its origin. It lands in the customer's store where the person may see that
 * customer, and without a customer where not. No one is assigned, so no one is told.
 */
export const fromThread = Effect.fn("Tickets.fromThread")(function*(
  sql: SqlClient.SqlClient,
  input: {
    readonly title: string
    readonly description: string
    readonly threadId: string
    readonly customerId: string | null
  }
) {
  const origin: Origin = { source: "email", sourceRef: input.threadId }
  const fields = {
    title: input.title.trim().slice(0, 200) || "Mail zonder onderwerp",
    description: input.description.slice(0, 20_000)
  }
  const made = yield* (input.customerId === null
    ? make(sql, fields, origin)
    : make(sql, { ...fields, related: { type: "customer", id: input.customerId } }, origin).pipe(
      Effect.catchTag("NotFound", () => make(sql, fields, origin))
    )).pipe(
      // None can happen here: the title is never empty, no one is assigned, and the fallback names no customer.
      Effect.catchTags({ Invalid: Effect.die, MemberNotActive: Effect.die, NotFound: Effect.die })
    )
  const [row] = yield* sql<{ number: number }>`select number from tickets where id = ${made.id}`
  return { id: made.id, number: Number(row!.number) }
})

/** The ticket `fromThread` made, taken away again (the inbox's Undo). */
export const removeFromThread = Effect.fn("Tickets.removeFromThread")(function*(
  sql: SqlClient.SqlClient,
  ticketId: string
) {
  yield* sql`delete from tickets where id = ${ticketId}`
  yield* audit(sql, "ticket.removed", ticketId)
})

/** "Ticket aanmaken" (NewTicketDialog), by hand: `#n`, at the top of the board; `insyte` for one a filed plate opens. */
export const create = Effect.fn("Tickets.create")(function*(input: typeof CreateInput.Type, origin?: Origin) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const made = yield* make(sql, input, origin)
      return {
        change: yield* answer(sql, [made.id], { kind: "created", ids: [made.id] }, made.outboxIds),
        outboxIds: made.outboxIds
      }
    })
  )
  yield* kick(outboxIds)
  return change
})

/** "Dupliceren": a copy at the top, with the same words, priority, labels and record, and no one on it yet. */
export const duplicate = Effect.fn("Tickets.duplicate")(function*(id: string) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [id])
      const [row] = yield* sql<{ orderId: string | null; customerId: string | null }>`
        select order_id, customer_id from tickets where id = ${id}`
      const made = yield* make(sql, {
        title: `${l!.title} (kopie)`.slice(0, 200),
        description: l!.description,
        priority: l!.priority,
        labels: yield* labelsNow(sql, id),
        ...(row?.orderId ? { related: { type: "order" as const, id: row.orderId } } : {}),
        ...(row?.customerId ? { related: { type: "customer" as const, id: row.customerId } } : {})
      })
      return yield* answer(sql, [made.id], { kind: "created", ids: [made.id] })
    })
  )
})

/** The title, description, priority, deadline and labels; a priority (the selection bar) for many at once. */
export const update = Effect.fn("Tickets.update")(function*(input: typeof UpdateInput.Type) {
  yield* Policy.require("support", 2)
  const title = input.title?.trim()
  if (title === "") return yield* new Invalid({ fields: { title: "required" } })
  const single = input.title !== undefined || input.description !== undefined || input.labels !== undefined
  if (single && input.ids.length > 1) return yield* new Invalid({ fields: { ids: "one" } })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const restore: Array<Before> = []
      const changed: Array<string> = []
      for (const l of yield* lock(sql, input.ids)) {
        const diff: Record<string, unknown> = {}
        const next = {
          title: title ?? l.title,
          description: input.description ?? l.description,
          priority: input.priority ?? l.priority,
          dueAt: input.dueAt === undefined ? ms(l.dueAt) : input.dueAt
        }
        if (next.title !== l.title) diff["title"] = next.title
        if (next.description !== l.description) diff["description"] = true
        if (next.priority !== l.priority) diff["priority"] = [l.priority, next.priority]
        if (next.dueAt !== ms(l.dueAt)) diff["dueAt"] = next.dueAt
        const labelsBefore = input.labels === undefined ? undefined : yield* labelsNow(sql, l.id)
        const labels = input.labels === undefined ? undefined : labelsOf(input.labels)
        const labelsChanged = labels !== undefined && labels.join("\n") !== labelsBefore?.join("\n")
        if (labelsChanged) diff["labels"] = labels
        if (Object.keys(diff).length === 0) continue
        yield* sql`update tickets set title = ${next.title}, description = ${next.description},
                     priority = ${next.priority}, due_at = ${at(next.dueAt)},
                     topic = ${topicOf(next.title, next.description)}
                   where id = ${l.id}`
        if (labelsChanged) yield* writeLabels(sql, principal.workspaceId, l.id, labels)
        yield* audit(sql, "ticket.updated", l.id, diff)
        restore.push(before(l, labelsChanged && labelsBefore !== undefined ? { labels: labelsBefore } : {}))
        changed.push(l.id)
      }
      if (changed.length === 0) return none()
      return yield* answer(sql, changed, { kind: "fields", tickets: restore })
    })
  )
})

/** A drag to another column, the selection bar's moves, the modal's status menu. Klaar records when. */
export const setStatus = Effect.fn("Tickets.setStatus")(function*(input: typeof SetStatusInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const going = (yield* lock(sql, input.ids)).filter((l) => l.status !== input.status)
      if (going.length === 0) return none()
      for (const l of going) {
        yield* sql`update tickets set status = ${input.status},
                     resolved_at = case when ${input.status} = 'done' then now() else resolved_at end
                   where id = ${l.id}`
        yield* audit(sql, "ticket.status_changed", l.id, { from: l.status, to: input.status })
      }
      return yield* answer(sql, going.map((l) => l.id), { kind: "fields", tickets: going.map((l) => before(l)) })
    })
  )
})

/** Someone on the ticket; they hear of it once the window has passed. */
export const assign = Effect.fn("Tickets.assign")(function*(input: typeof AssignInput.Type) {
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      yield* activeMembers(sql, [input.memberId])
      const was = yield* assigneesNow(sql, input.id)
      if (was.includes(input.memberId)) return { change: none(), outboxIds: [] }
      yield* sql`insert into ticket_assignees (workspace_id, ticket_id, member_id, assigned_by)
                 values (${principal.workspaceId}, ${input.id}, ${input.memberId}, ${principal.id})`
      yield* sql`update tickets set updated_at = now() where id = ${input.id}`
      yield* audit(sql, "ticket.assigned", input.id, { memberId: input.memberId })
      const told = yield* tellAssigned(sql, input.id, [input.memberId])
      return {
        change: yield* answer(sql, [input.id], {
          kind: "fields",
          tickets: [before(l!, { assignees: was })]
        }, told),
        outboxIds: told
      }
    })
  )
  yield* kick(outboxIds)
  return change
})

/** Someone off the ticket. */
export const unassign = Effect.fn("Tickets.unassign")(function*(input: typeof AssignInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      const was = yield* assigneesNow(sql, input.id)
      if (!was.includes(input.memberId)) return none()
      yield* sql`delete from ticket_assignees where ticket_id = ${input.id} and member_id = ${input.memberId}`
      yield* sql`update tickets set updated_at = now() where id = ${input.id}`
      yield* audit(sql, "ticket.unassigned", input.id, { memberId: input.memberId })
      return yield* answer(sql, [input.id], { kind: "fields", tickets: [before(l!, { assignees: was })] })
    })
  )
})

const ASIDE = {
  archived: "archived_at",
  spam: "spam_at",
  trash: "deleted_at"
} as const

/** "Archiveren", "Melden als spam", "Naar prullenbak": out of every view but its own, kept. The trash takes Beheren. */
export const setAside = Effect.fn("Tickets.setAside")(function*(
  input: { readonly ids: ReadonlyArray<string>; readonly as: keyof typeof ASIDE }
) {
  yield* Policy.require("support", input.as === "trash" ? 3 : 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const going = locked.filter((l) =>
        input.as === "trash" ? l.deletedAt === null : input.as === "spam" ? l.spamAt === null : l.archivedAt === null
      )
      if (going.length === 0) return none()
      for (const l of going) {
        yield* sql`update tickets set ${sql.literal(ASIDE[input.as])} = now() where id = ${l.id}`
        yield* audit(sql, `ticket.${input.as}`, l.id)
      }
      return yield* answer(sql, going.map((l) => l.id), { kind: "fields", tickets: going.map((l) => before(l)) })
    })
  )
})

/** "Uitstellen": off the board until then; it is back by itself when the time comes. */
export const snooze = Effect.fn("Tickets.snooze")(function*(input: typeof SnoozeInput.Type) {
  yield* Policy.require("support", 2)
  if (input.until <= Date.now()) return yield* new Invalid({ fields: { until: "past" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      for (const l of locked) {
        yield* sql`update tickets set snoozed_until = ${new Date(input.until)} where id = ${l.id}`
        yield* audit(sql, "ticket.snoozed", l.id, { until: input.until })
      }
      return yield* answer(sql, locked.map((l) => l.id), { kind: "fields", tickets: locked.map((l) => before(l)) })
    })
  )
})

/** "Nu terugzetten": every set-aside field cleared, back on the board. From the trash it takes Beheren. */
export const putBack = Effect.fn("Tickets.putBack")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      if (locked.some((l) => l.deletedAt !== null)) yield* Policy.require("support", 3)
      const going = locked.filter((l) =>
        l.deletedAt !== null || l.spamAt !== null || l.archivedAt !== null || l.snoozedUntil !== null
      )
      if (going.length === 0) return none()
      for (const l of going) {
        yield* sql`update tickets set snoozed_until = null, archived_at = null, deleted_at = null, spam_at = null
                   where id = ${l.id}`
        yield* audit(sql, "ticket.put_back", l.id)
      }
      return yield* answer(sql, going.map((l) => l.id), { kind: "fields", tickets: going.map((l) => before(l)) })
    })
  )
})

/** A drag within a column: the cards take the places they held between them, in the new order. */
export const reorder = Effect.fn("Tickets.reorder")(function*(input: typeof ReorderInput.Type) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const ids = [...new Set(input.ids)]
      // The places these cards held, top to bottom.
      const places = (yield* sql<{ position: number }>`
        select position from tickets where id in ${sql.in(ids)} order by position`).map((r) => Number(r.position))
      for (const [i, id] of ids.entries()) {
        const was = locked.find((l) => l.id === id)!
        if (Number(was.position) === places[i]) continue
        yield* sql`update tickets set position = ${places[i]!} where id = ${id}`
        yield* audit(sql, "ticket.reordered", id)
      }
      return yield* answer(sql, ids, null)
    })
  )
})

/** "Ticket volgen" / "Niet meer volgen": the viewer's own, so it is not audited. */
export const watch = Effect.fn("Tickets.watch")(function*(id: string, on: boolean) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* ticketScope(sql)
      const [t] = yield* sql`select 1 from tickets t where t.id = ${id} and ${scope}`
      if (t === undefined) return yield* new NotFound({ entity: "ticket", id })
      if (on) {
        yield* sql`insert into ticket_watchers (workspace_id, ticket_id, member_id)
                   values (${principal.workspaceId}, ${id}, ${principal.id}) on conflict do nothing`
      } else {
        yield* sql`delete from ticket_watchers where ticket_id = ${id} and member_id = ${principal.id}`
      }
      return { watching: on }
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(TicketsRestore)

/** `Shared.undo`'s compensation: the tickets as they were, or a new one taken away again. */
export const restore = Effect.fn("Tickets.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  if (undo.kind === "created") {
    yield* sql`delete from tickets where id in ${sql.in([...undo.ids])}`
    for (const id of undo.ids) yield* audit(sql, "ticket.removed", id)
    return
  }
  for (const t of undo.tickets) {
    yield* sql`update tickets set title = ${t.title}, description = ${t.description}, status = ${t.status},
                 priority = ${t.priority}, topic = ${t.topic}, due_at = ${at(t.dueAt)},
                 resolved_at = ${at(t.resolvedAt)}, snoozed_until = ${at(t.snoozedUntil)},
                 archived_at = ${at(t.archivedAt)}, deleted_at = ${at(t.deletedAt)}, spam_at = ${at(t.spamAt)}
               where id = ${t.id}`
    if (t.labels !== undefined) yield* writeLabels(sql, principal.workspaceId, t.id, t.labels)
    if (t.assignees !== undefined) {
      yield* sql`delete from ticket_assignees where ticket_id = ${t.id}`
      for (const m of t.assignees) {
        yield* sql`insert into ticket_assignees (workspace_id, ticket_id, member_id, assigned_by)
                   select ${principal.workspaceId}, ${t.id}, ${m}, ${principal.id}
                   where exists (select 1 from members where id = ${m})`
      }
    }
    yield* audit(sql, "ticket.restored", t.id)
  }
})
