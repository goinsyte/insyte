import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { checkRetention } from "../domain/Check.ts"
import {
  type CountRetention,
  NotCounted,
  type RetentionClassId,
  type RetentionCount,
  type RetentionValue,
  type SetErasing
} from "../domain/Settings.ts"
import { erasingOf, lastCount, readRow, retentionOf } from "./sections.ts"

/*
 * Retention (M17 step 20.1b; domain.md §12.29, §16.1): "Nu tellen" counts what the periods would erase, and only a
 * count of the saved periods lets erasing be turned on (Beheren, after a confirm: what goes does not come back). While
 * it is on, the fifteen-minute sweep erases each workspace once a night at 03:00 in its timezone, as `system`, with the
 * same statements the count ran, so the dry run and the erase agree by construction.
 *
 * Conservative on purpose: a class is erased only where Insyte holds the data itself and nothing else hangs on it.
 * Today that is Klantcontact's mail threads (their messages with them; their attachments' files marked deleted).
 * Bijlagen (bytes in R2), Logboeken (the audit log is append-only, kept 13 months at least), Advertentielog and
 * Cursusvoortgang (not built yet) and Klantgegevens (Shopify's mirror, kept with the orders the law keeps 7 years) are
 * counted as nothing and erased as nothing until each has its own rule.
 */

export const ERASING = "retention.restore"

type Months = RetentionValue["classes"][number]["months"]

interface Target {
  readonly count: (sql: SqlClient.SqlClient, months: number) => Effect.Effect<number, unknown>
  readonly erase: (sql: SqlClient.SqlClient, months: number) => Effect.Effect<number, unknown>
}

/**
 * A customer mail thread whose last message is older than the period, not snoozed into the future, and whose ticket,
 * if it has one, is done: an open case keeps its mail.
 */
const threadsDue = (sql: SqlClient.SqlClient, months: number) =>
  sql`t.last_message_at < now() - make_interval(months => ${months})
      and (t.snoozed_until is null or t.snoozed_until < now())
      and (t.ticket_id is null or exists (select 1 from tickets k where k.id = t.ticket_id and k.status = 'done'))`

const one = (rows: ReadonlyArray<{ n: number }>) => rows[0]?.n ?? 0

const TARGETS: Partial<Record<RetentionClassId, Target>> = {
  contact: {
    count: (sql, months) =>
      Effect.map(
        sql<{ n: number }>`select count(*)::int as n from email_threads t where ${threadsDue(sql, months)}`,
        one
      ),
    erase: (sql, months) =>
      Effect.gen(function*() {
        // The attachments' files go with their thread: marked deleted, so nothing serves them any more.
        yield* sql`update files set deleted_at = now()
                   where deleted_at is null and id in (
                     select a.file_id from attachments a
                     join email_messages m on m.id = a.message_id
                     join email_threads t on t.id = m.thread_id
                     where ${threadsDue(sql, months)})`
        return one(
          yield* sql<{ n: number }>`
          with gone as (delete from email_threads t where ${threadsDue(sql, months)} returning 1)
          select count(*)::int as n from gone`
        )
      })
  }
}

/** What each class would take (or, `erase`, takes) under `classes`. Never-delete classes take nothing. */
const run = (sql: SqlClient.SqlClient, classes: RetentionValue["classes"], erase: boolean) =>
  Effect.gen(function*() {
    const perClass: Record<string, number> = {}
    for (const c of classes) {
      const target = TARGETS[c.id]
      perClass[c.id] = c.months === null || target === undefined
        ? 0
        : yield* (erase ? target.erase(sql, c.months) : target.count(sql, c.months)).pipe(Effect.orDie)
    }
    return { perClass, total: Object.values(perClass).reduce((n, v) => n + v, 0) }
  })

const record = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  kind: "count" | "erase",
  classes: RetentionValue["classes"],
  found: { perClass: Record<string, number>; total: number },
  by: string
) =>
  Effect.map(
    sql<{ ranAt: Date }>`insert into retention_runs (id, workspace_id, kind, periods, per_class, total, ran_by)
      values (${mintId("ret")}, ${workspaceId}, ${kind}, ${JSON.stringify({ classes })}::jsonb,
              ${JSON.stringify(found.perClass)}::jsonb, ${found.total}, ${by})
      returning ran_at`,
    (rows): RetentionCount => ({ ...found, at: rows[0]!.ranAt.getTime(), classes })
  )

/** "Nu tellen": a dry run over the periods given (the page's draft) or the saved ones; it is kept as the newest count. */
export const count = Effect.fn("Retention.count")(function*(input: CountRetention) {
  yield* Policy.require("settings", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      let classes = retentionOf((yield* readRow(sql, "retention"))?.value).classes
      if (input.classes !== undefined) {
        const checked = checkRetention({ classes: input.classes })
        if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
        classes = checked.ok.classes
      }
      return yield* record(sql, principal.workspaceId, "count", classes, yield* run(sql, classes, false), principal.id)
    })
  )
})

const samePeriods = (
  a: ReadonlyArray<{ id: string; months: Months }>,
  b: ReadonlyArray<{ id: string; months: Months }>
) => a.length === b.length && a.every((c) => b.some((d) => d.id === c.id && d.months === c.months))

/** Switches the stored flag and audits it; answers the page's state. */
const writeErasing = (sql: SqlClient.SqlClient, on: boolean) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    const row = yield* readRow(sql, "retention", true)
    const was = erasingOf(row?.value)
    const classes = retentionOf(row?.value).classes
    if (row === undefined) {
      yield* sql`insert into workspace_settings (workspace_id, section, value, updated_by)
                 values (${principal.workspaceId}, 'retention', ${JSON.stringify({ classes, erasing: on })}::jsonb,
                         ${principal.id})`
    } else {
      yield* sql`update workspace_settings
                 set value = jsonb_set(value, '{erasing}', to_jsonb(${on}::boolean)), version = version + 1,
                     updated_by = ${principal.id}, updated_at = now()
                 where section = 'retention'`
    }
    if (was !== on) {
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "settings.retention.erasing",
        subjectType: "workspace_settings",
        subjectId: "retention",
        section: "retention",
        diff: { before: was, after: on }
      })
    }
    return { was, state: { classes, erasing: on, lastCount: yield* lastCount(sql) } }
  })

/**
 * The nightly erase on or off. On takes Beheren and a count of the saved periods first (`NotCounted`); the console
 * confirms before it asks. Off takes Bewerken: stopping an erase is always safe. Either answers an undo.
 */
export const setErasing = Effect.fn("Retention.setErasing")(function*(input: SetErasing) {
  yield* Policy.require("settings", input.on ? 3 : 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (input.on) {
        const saved = retentionOf((yield* readRow(sql, "retention"))?.value).classes
        const counted = yield* lastCount(sql)
        if (counted === null || !samePeriods(counted.classes, saved)) return yield* new NotCounted()
      }
      const { was, state } = yield* writeErasing(sql, input.on)
      const undo = yield* Undo.issue(sql, { command: ERASING, compensation: { on: was } })
      return { state, undo }
    })
  )
})

const decodeErasing = Schema.decodeUnknownEffect(Schema.Struct({ on: Schema.Boolean }))

/** `Shared.undo` for `retention.restore`: the switch as it was (turning it back on needs Beheren again). */
export const restoreErasing = Effect.fn("Retention.restoreErasing")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown
) {
  const { on } = yield* decodeErasing(compensation).pipe(Effect.orDie)
  yield* Policy.require("settings", on ? 3 : 2)
  yield* writeErasing(sql, on)
})

/**
 * One workspace's nightly erase, as `system` (the sweep found it due): the saved periods, the statements the count
 * runs, a run row and an audit line. A workspace whose erasing went off since is left alone.
 */
export const eraseWorkspace = Effect.fn("Retention.erase")(function*() {
  const { id: workspaceId } = yield* CurrentWorkspace
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const row = yield* readRow(sql, "retention", true)
      if (!erasingOf(row?.value)) return null
      const classes = retentionOf(row?.value).classes
      const done = yield* record(sql, workspaceId, "erase", classes, yield* run(sql, classes, true), "system")
      yield* Audit.write(sql, workspaceId, { kind: "system", id: "system" }, {
        action: "retention.erased",
        subjectType: "workspace_settings",
        subjectId: "retention",
        section: "retention",
        diff: { perClass: done.perClass, total: done.total }
      })
      return done
    })
  )
})

/** The workspaces whose nightly erase is due at `at` (0061). */
export const dueWorkspaces = (at: Date) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.routing((sql) =>
      Effect.map(
        sql<{ workspaceId: string }>`select workspace_id from retention_due_workspaces(${at})`,
        (rows) => rows.map((r) => r.workspaceId)
      )
    ))
