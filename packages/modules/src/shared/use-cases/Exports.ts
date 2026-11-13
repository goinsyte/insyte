import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileParts, FileStore } from "../domain/Documents.ts"
import {
  EXPORT_DAYS,
  type ExportFormat,
  type ExportJob,
  type ExportPlan,
  ExportRefused,
  ExportSources,
  tooManyRows
} from "../domain/Exports.ts"
import { PendingEvents, Relay } from "../domain/Outbox.ts"
import * as Audit from "./Audit.ts"
import * as Outbox from "./Outbox.ts"

/*
 * The export pipeline (M14 step 5), shared by every slice that offers one: `request` on the asking command's
 * transaction, then the `ExportWorkflow`'s steps, each as `system` in the export's workspace: `begin` (the source's
 * plan), `writePage` once per page (each page an object of its own in the bucket), `finish` (the pages joined into one
 * file, kept as the export's for `EXPORT_DAYS`, the requester told), then `clearParts`; or `fail`. A step the Workflow
 * tries again writes the same object and the same counts, so a retry never doubles a page, and a `finish` tried again
 * finds its file joined and its row ready and does nothing twice.
 *
 * Everything an export puts in the bucket is under its own folder (`dirOf`): the parts and the file. `fail`, the
 * nightly sweep and the expiry each empty that folder by listing it, so a part being written when a step gave up is
 * not left behind, and a delete the bucket refused is tried again the next night (`cleared_at` stays empty until then).
 */

export interface ExportAsk {
  readonly source: string
  readonly sourceRef?: string | null | undefined
  readonly columns: ReadonlyArray<string>
  readonly filter?: unknown
  readonly format?: ExportFormat | undefined
  /** The file's name without its extension, as the requester will see it. */
  readonly fileName: string
}

/** Asks for an export: the row, the audit line (`data.export`, with what it holds), the Workflow's start event. */
export const request = Effect.fn("Exports.request")(function*(sql: SqlClient.SqlClient, ask: ExportAsk) {
  const principal = yield* CurrentPrincipal
  const id = mintId("exp")
  // The stores the requester reaches: the role's narrowed by the member's own (`storeScope`), not the role's alone.
  const scope = principal.storeScope === null ? null : [...principal.storeScope]
  const name = Array.from(ask.fileName.trim()).slice(0, 180).join("") || "export"
  yield* sql`insert into exports (id, workspace_id, source, source_ref, columns, filter, store_scope, format, file_name,
                                  requested_by)
             values (${id}, ${principal.workspaceId}, ${ask.source}, ${ask.sourceRef ?? null}, ${[
    ...ask.columns
  ]}::text[],
                     ${ask.filter === undefined ? null : JSON.stringify(ask.filter)}::jsonb, ${scope}::text[],
                     ${ask.format ?? "csv"}, ${name}, ${principal.id})`
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: "data.export",
    subjectType: "export",
    subjectId: id,
    diff: { source: ask.source, sourceRef: ask.sourceRef ?? null, columns: [...ask.columns] }
  })
  const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
    type: "export.requested",
    workspaceId: principal.workspaceId,
    exportId: id,
    userId: principal.id
  })
  ;(yield* PendingEvents)?.add(outboxId)
  return id
})

interface JobRow {
  readonly id: string
  readonly source: string
  readonly sourceRef: string | null
  readonly columns: ReadonlyArray<string>
  readonly filter: unknown
  readonly storeScope: ReadonlyArray<string> | null
  readonly format: ExportFormat
  readonly fileName: string
  readonly state: string
  readonly requestedBy: string
}

const jobOf = Effect.fn("Exports.jobOf")(function*(sql: SqlClient.SqlClient, exportId: string) {
  const ws = yield* CurrentWorkspace
  const [row] = yield* sql<JobRow>`
    select id, source, source_ref, columns, filter, store_scope, format, file_name, state, requested_by
    from exports where id = ${exportId}`
  if (row === undefined) return undefined
  const job: ExportJob = {
    id: row.id,
    workspaceId: ws.id,
    source: row.source,
    sourceRef: row.sourceRef,
    columns: row.columns,
    filter: row.filter,
    storeScope: row.storeScope,
    format: row.format,
    requestedBy: row.requestedBy
  }
  return { job, row }
})

const sourceOf = Effect.fn("Exports.sourceOf")(function*(name: string) {
  const source = (yield* ExportSources).get(name)
  if (source === undefined) return yield* new ExportRefused({ reason: `no export source "${name}"` })
  return source
})

/** The export's own folder in the bucket: its parts and its file, and nothing else. */
const dirOf = (workspaceId: string, exportId: string) => `${workspaceId}/exports/${exportId}/`
const partKey = (workspaceId: string, exportId: string, n: number) => `${dirOf(workspaceId, exportId)}part-${n}`
const fileKey = (workspaceId: string, exportId: string, extension: string) =>
  `${dirOf(workspaceId, exportId)}file.${extension}`

/** What `begin` hands the next steps: the plan, that there is nothing (left) to write, or that it is too big. */
export type Begun =
  | { readonly skip: true }
  | { readonly skip: false; readonly refused: "too_many_rows" }
  | { readonly skip: false; readonly refused?: undefined; readonly plan: ExportPlan; readonly requestedBy: string }

/**
 * The first step: the export is running, the source's plan in hand. One already done or failed is left alone; one
 * whose plan holds more than `EXPORT_MAX_ROWS` rows is refused before a page is written (the Workflow then fails it).
 */
export const begin = Effect.fn("Exports.begin")(function*(exportId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const found = yield* jobOf(sql, exportId)
      if (found === undefined || (found.row.state !== "queued" && found.row.state !== "running")) {
        return { skip: true } satisfies Begun as Begun
      }
      const source = yield* sourceOf(found.job.source)
      const plan = yield* source.plan(sql, found.job)
      if (tooManyRows(plan)) {
        yield* sql`update exports set rows_total = ${plan.total} where id = ${exportId}`
        return { skip: false, refused: "too_many_rows" } satisfies Begun as Begun
      }
      yield* sql`update exports set state = 'running', started_at = coalesce(started_at, now()),
                   rows_total = ${plan.total}, rows_written = 0 where id = ${exportId}`
      return { skip: false, plan, requestedBy: found.row.requestedBy } satisfies Begun as Begun
    })
  )
})

/** One page into the bucket as part `n`; `writtenBefore` is what the earlier pages held. */
export const writePage = Effect.fn("Exports.writePage")(function*(input: {
  readonly exportId: string
  readonly cursor: string | null
  readonly n: number
  readonly writtenBefore: number
}) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const files = yield* FileStore
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const found = yield* jobOf(sql, input.exportId)
      if (found === undefined) return yield* new ExportRefused({ reason: "the export is gone" })
      const source = yield* sourceOf(found.job.source)
      const page = yield* source.page(sql, found.job, input.cursor)
      yield* files.put(partKey(ws.id, input.exportId, input.n), page.bytes, "application/octet-stream").pipe(
        Effect.orDie
      )
      const written = input.writtenBefore + page.rows
      yield* sql`update exports set rows_written = ${written} where id = ${input.exportId}`
      return { next: page.next, rows: page.rows, written, size: page.bytes.byteLength }
    })
  )
})

/**
 * The pages joined into the export's file, kept for `EXPORT_DAYS`, and the requester told. Safe to try again: the join
 * keeps a file already joined (`FileParts.join`), and an export already ready is answered as it is, told once. The
 * parts stay for `clearParts`, so a retry still has them.
 */
export const finish = Effect.fn("Exports.finish")(function*(input: {
  readonly exportId: string
  /** Each page's size in bytes, in order: part `n` is `sizes[n]`. */
  readonly sizes: ReadonlyArray<number>
  readonly plan: ExportPlan
}) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const parts = yield* FileParts
  const keys = input.sizes.map((size, n) => ({ key: partKey(ws.id, input.exportId, n), size }))
  const key = fileKey(ws.id, input.exportId, input.plan.extension)
  const { sizeBytes } = yield* parts.join(key, keys, input.plan.mime).pipe(Effect.orDie)
  return yield* kicked(db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [locked] = yield* sql<{ state: string; fileId: string | null }>`
        select state, file_id from exports where id = ${input.exportId} for update`
      if (locked === undefined) return yield* new ExportRefused({ reason: "the export is gone" })
      if (locked.state === "ready" && locked.fileId !== null) return { fileId: locked.fileId }
      // Failed meanwhile (the sweep called it stale): it stays failed, and `fail` empties its folder.
      if (locked.state !== "running") return yield* new ExportRefused({ reason: `the export is ${locked.state}` })
      const found = yield* jobOf(sql, input.exportId)
      if (found === undefined) return yield* new ExportRefused({ reason: "the export is gone" })
      const name = `${found.row.fileName}.${input.plan.extension}`
      const fileId = mintId("fil")
      const [file] = yield* sql<{ id: string }>`
        insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, uploaded_by,
                           scan_state)
        values (${fileId}, ${ws.id}, ${key}, ${name}, ${input.plan.mime}, ${sizeBytes}, 'export', 'export',
                ${input.exportId}, ${found.row.requestedBy}, 'clean')
        on conflict (r2_key) do update set size_bytes = excluded.size_bytes
        returning id`
      yield* sql`update exports set state = 'ready', file_id = ${file?.id ?? fileId}, finished_at = now(),
                   expires_at = now() + make_interval(days => ${EXPORT_DAYS}) where id = ${input.exportId}`
      yield* told(sql, ws.id, input.exportId, found.row.requestedBy, "ready")
      return { fileId: file?.id ?? fileId }
    })
  ))
})

/** After `finish` committed: the parts out of the bucket, and the export marked clear. A failed delete fails the step. */
export const clearParts = Effect.fn("Exports.clearParts")(function*(exportId: string) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const parts = yield* FileParts
  yield* parts.clear(`${dirOf(ws.id, exportId)}part-`).pipe(Effect.orDie)
  yield* db.scopedFor((sql) => sql`update exports set cleared_at = now() where id = ${exportId} and state = 'ready'`)
})

/**
 * The export could not be written: failed with why (`too_many_rows` is shown to the member, anything else only
 * logged), everything it put in the bucket removed (the folder listed, so a part half-written goes too), the requester
 * told once.
 */
export const fail = Effect.fn("Exports.fail")(function*(input: {
  readonly exportId: string
  readonly reason: string
}) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const parts = yield* FileParts
  yield* parts.clear(dirOf(ws.id, input.exportId)).pipe(Effect.orDie)
  yield* kicked(db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ requestedBy: string }>`
        update exports set state = 'failed', error = ${input.reason.slice(0, 500)}, finished_at = now(),
               cleared_at = now()
        where id = ${input.exportId} and state in ('queued', 'running') returning requested_by`
      if (row !== undefined) yield* told(sql, ws.id, input.exportId, row.requestedBy, "failed")
    })
  ))
})

const told = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  exportId: string,
  userId: string,
  state: "ready" | "failed"
) =>
  Effect.gen(function*() {
    yield* Audit.write(sql, workspaceId, { kind: "system", id: "system" }, {
      action: state === "ready" ? "data.export_ready" : "data.export_failed",
      subjectType: "export",
      subjectId: exportId
    })
    const outboxId = yield* Outbox.write(sql, workspaceId, {
      type: "export.finished",
      workspaceId,
      exportId,
      userId,
      state
    })
    ;(yield* PendingEvents)?.add(outboxId)
  })

/**
 * A step's transaction with its events kicked once it commits: a Workflow has no request to do it, and the requester
 * should hear now, not at the next sweep.
 */
const kicked = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const ids: Array<string> = []
    const value = yield* effect.pipe(Effect.provideService(PendingEvents, { add: (id) => void ids.push(id) }))
    if (ids.length > 0) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(ids))
    return value
  })

/** How long an export may stay queued or running before the sweep calls it failed: no Workflow runs that long. */
const STALE_HOURS = 24

/** The nightly sweep's workspaces: those with an export or an import for it (`data_due_workspaces()`, ids only). */
export const dueWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from data_due_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/**
 * One workspace's exports, once a night: those past their seven days emptied from the bucket and then `expired`;
 * those stuck queued or running for a day `failed` (the requester told) and emptied; and any failed, expired or ready
 * export whose folder was never emptied (a delete the bucket refused) emptied now. The bucket goes first, so a delete
 * that fails leaves the row to be tried again the next night. Up to 200 of each per night.
 */
export const expireIn = Effect.fn("Exports.expireIn")(function*() {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const parts = yield* FileParts
  const stale = yield* kicked(db.scopedFor((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<{ id: string; requestedBy: string }>`
        update exports set state = 'failed', error = 'stale', finished_at = now()
        where id in (select id from exports where state in ('queued', 'running')
                       and created_at < now() - make_interval(hours => ${STALE_HOURS}) limit 200)
        returning id, requested_by`
      for (const r of rows) yield* told(sql, ws.id, r.id, r.requestedBy, "failed")
      return rows.length
    })
  ))
  const due = yield* db.scopedFor((sql) =>
    sql<{ id: string; state: string; expired: boolean }>`
      select id, state, (state = 'ready' and expires_at <= now()) as expired from exports
      where (state = 'ready' and expires_at <= now()) or (state in ('failed', 'expired') and cleared_at is null)
         or (state = 'ready' and cleared_at is null and finished_at < now() - interval '1 hour')
      order by created_at limit 200`
  )
  let expired = 0
  for (const row of due) {
    // A ready export still in its days only has its parts left behind; the rest lose the whole folder.
    const whole = row.expired || row.state !== "ready"
    yield* parts.clear(whole ? dirOf(ws.id, row.id) : `${dirOf(ws.id, row.id)}part-`).pipe(Effect.orDie)
    yield* db.scopedFor((sql) =>
      row.expired
        ? Effect.gen(function*() {
          yield* sql`update files set deleted_at = now() where owner_type = 'export' and owner_id = ${row.id}`
          yield* sql`update exports set state = 'expired', file_id = null, cleared_at = now() where id = ${row.id}`
        })
        : sql`update exports set cleared_at = now() where id = ${row.id}`
    )
    if (row.expired) expired++
  }
  return { expired, stale, cleared: due.length - expired }
})
