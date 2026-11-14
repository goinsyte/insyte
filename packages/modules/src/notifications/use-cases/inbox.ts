import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { notificationKind } from "@insyte/domain/Notifications"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import {
  type ListNotes,
  Note,
  NoteCounts,
  NotePage,
  type NoteTab,
  type SetRead,
  type Snooze
} from "../domain/Notifications.ts"
import { inTab, isRead, readNow, stateOf } from "./state.ts"

/*
 * The member's own notifications (M5.2): a tab at a time, newest first, 50 per page (or as many as the page asks, up
 * to 500); read, cleared (and back), set aside until a time. The rows are the recipient's alone (0019's restrictive
 * policy), so nothing here names them. Every write answers the counts; the console refetches the tab it shows.
 */

const PAGE = 50

interface Row {
  readonly id: string
  readonly kind: string
  readonly subjectType: string | null
  readonly subjectId: string | null
  readonly actorKind: string | null
  readonly actorId: string | null
  readonly actorName: string | null
  readonly data: unknown
  readonly createdAt: Date
  readonly read: boolean
  readonly state: NoteTab
  readonly snoozedUntil: Date | null
}

const toNote = (r: Row) =>
  new Note({
    id: r.id,
    kind: r.kind,
    primary: notificationKind(r.kind)?.primary ?? false,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    actor: r.actorKind === null || r.actorId === null ? null : { kind: r.actorKind, id: r.actorId, name: r.actorName },
    data: r.data as never,
    createdAt: r.createdAt.getTime(),
    read: r.read,
    state: r.state,
    snoozedUntil: r.snoozedUntil?.getTime() ?? null
  })

/** `<ms>:<id>` of the last row of a page. */
const cursorOf = (r: Row) => `${r.createdAt.getTime()}:${r.id}`
const parseCursor = (cursor: string | null) => {
  if (cursor === null) return null
  const [ms, id] = cursor.split(":")
  return ms === undefined || id === undefined || !/^\d+$/.test(ms) ? null : { at: new Date(Number(ms)), id }
}

export const readCounts = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ unread: number; primaryKinds: Array<string>; later: number }>`
      select (count(*) filter (where not ${isRead(sql)} and ${inTab(sql, "inbox")}))::int as unread,
             coalesce(array_agg(n.kind) filter (where not ${isRead(sql)} and ${inTab(sql, "inbox")}), '{}')
               as primary_kinds,
             (count(*) filter (where ${inTab(sql, "later")}))::int as later
      from notifications n`,
    ([row]) =>
      new NoteCounts({
        unread: row?.unread ?? 0,
        primaryUnread: (row?.primaryKinds ?? []).filter((k) => notificationKind(k)?.primary === true).length,
        later: row?.later ?? 0
      })
  )

export const list = Effect.fn("Notifications.list")(function*(input: ListNotes) {
  const db = yield* Db
  const after = parseCursor(input.cursor)
  const size = input.limit ?? PAGE
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<Row>`
        select n.id, n.kind, n.subject_type, n.subject_id, n.actor_kind, n.actor_id, u.name as actor_name, n.data,
               n.created_at, ${isRead(sql)} as read, ${stateOf(sql)} as state, n.snoozed_until
        from notifications n
        left join members m on n.actor_kind = 'member' and m.id = n.actor_id
        left join auth."user" u on u.id = m.user_id
        where ${inTab(sql, input.tab)}
          ${after === null ? sql`` : sql`and (n.created_at, n.id) < (${after.at}, ${after.id})`}
        order by n.created_at desc, n.id desc
        limit ${size + 1}`,
      (rows) =>
        new NotePage({
          items: rows.slice(0, size).map(toNote),
          next: rows.length > size ? cursorOf(rows[size - 1]!) : null
        })
    )
  )
})

export const counts = Effect.fn("Notifications.counts")(function*() {
  const db = yield* Db
  return yield* db.scoped(readCounts)
})

/** A write over the member's rows by id, answering the counts. */
const over = (
  ids: ReadonlyArray<string>,
  change: (sql: SqlClient.SqlClient) => Effect.Effect<unknown, SqlError.SqlError>
) =>
  Effect.flatMap(
    Effect.service(Db),
    (db) => db.scoped((sql) => Effect.andThen(ids.length === 0 ? Effect.void : change(sql), readCounts(sql)))
  )

export const setRead = Effect.fn("Notifications.setRead")(function*(input: SetRead) {
  return yield* over(
    input.ids,
    (sql) =>
      sql`update notifications n set read_at = ${input.read ? readNow(sql) : null}
        where n.id in ${sql.in(input.ids)}`
  )
})

export const markAllRead = Effect.fn("Notifications.markAllRead")(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.andThen(
      sql`update notifications n set read_at = now() where not ${isRead(sql)} and ${inTab(sql, "inbox")}`,
      readCounts(sql)
    )
  )
})

/** Cleared: out of the inbox (or out of Later, its time dropped), kept in Gewist, read. */
export const clear = Effect.fn("Notifications.clear")(function*(ids: ReadonlyArray<string>) {
  return yield* over(
    ids,
    (sql) =>
      sql`update notifications n set archived_at = now(), snoozed_until = null, read_at = ${readNow(sql)}
        where n.id in ${sql.in(ids)}`
  )
})

/** Back to the inbox from Gewist, or from Later. */
export const restore = Effect.fn("Notifications.restore")(function*(ids: ReadonlyArray<string>) {
  return yield* over(
    ids,
    (sql) => sql`update notifications set archived_at = null, snoozed_until = null where id in ${sql.in(ids)}`
  )
})

export const snooze = Effect.fn("Notifications.snooze")(function*(input: Snooze) {
  if (input.until <= Date.now()) return yield* new Invalid({ fields: { until: "past" } })
  return yield* over(
    input.ids,
    (sql) =>
      sql`update notifications set snoozed_until = ${new Date(input.until)}, archived_at = null
        where id in ${sql.in(input.ids)}`
  )
})
