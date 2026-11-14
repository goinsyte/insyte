import type { SqlClient } from "effect/sql"
import type { NoteTab } from "../domain/Notifications.ts"

/*
 * Where a notification is and whether it is read, as of a moment (PLAN 10, M5.2), as SQL over `notifications n`: the
 * inbox, the bell's count, the realtime frame and the daily digest all read a note the same way. `at` is the moment:
 * the database's `now()`, or a sweep's own clock.
 */

const clock = (sql: SqlClient.SqlClient, at?: Date) => at === undefined ? sql`now()` : sql`${at}::timestamptz`

/**
 * A tab, as plain predicates (not a `case`), so the planner can use the inbox's partial index: set aside until a time
 * still ahead is Later; cleared is Gewist; the rest is the inbox.
 */
export const inTab = (sql: SqlClient.SqlClient, tab: NoteTab, at?: Date) =>
  tab === "cleared"
    ? sql`n.archived_at is not null`
    : tab === "later"
    ? sql`(n.archived_at is null and n.snoozed_until > ${clock(sql, at)})`
    : sql`(n.archived_at is null and (n.snoozed_until is null or n.snoozed_until <= ${clock(sql, at)}))`

/** A row's tab as a value, for the list to say which it is. */
export const stateOf = (sql: SqlClient.SqlClient) =>
  sql`case when n.archived_at is not null then 'cleared' when n.snoozed_until > now() then 'later' else 'inbox' end`

/**
 * Whether a row is read: a note set aside comes back unread once its time has come, so a read before it woke does not
 * count; read again after, it is. A cleared note keeps how it was read.
 */
export const isRead = (sql: SqlClient.SqlClient, at?: Date) =>
  sql`(n.read_at is not null and (n.archived_at is not null or n.snoozed_until is null
        or n.snoozed_until > ${clock(sql, at)} or n.read_at >= n.snoozed_until))`

/** `read_at` for a row being read: kept when it is read already, now when it is not. */
export const readNow = (sql: SqlClient.SqlClient) => sql`case when ${isRead(sql)} then n.read_at else now() end`
