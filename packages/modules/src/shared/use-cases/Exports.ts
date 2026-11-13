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
  ExportSources
} from "../domain/Exports.ts"
import { PendingEvents, Relay } from "../domain/Outbox.ts"
import * as Audit from "./Audit.ts"
import * as Outbox from "./Outbox.ts"

/*
 * The export pipeline (M14 step 5), shared by every slice that offers one: `request` on the asking command's
 * transaction, then the `ExportWorkflow`'s steps, each as `system` in the export's workspace: `begin` (the source's
 * plan), `writePage` once per page (each page an object of its own in the bucket), `finish` (the pages joined into one
 * file, kept as the export's for `EXPORT_DAYS`, the requester told) or `fail`. A step the Workflow tries again writes
 * the same object and the same counts, so a retry never doubles a page.
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
  const scope = principal.role.stores === "all" ? null : [...principal.role.stores]
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

const partKey = (workspaceId: string, exportId: string, n: number) => `${workspaceId}/exports/${exportId}/part-${n}`

/** What `begin` hands the next steps: the plan, or that there is nothing (left) to write. */
export type Begun =
  | { readonly skip: true }
  | { readonly skip: false; readonly plan: ExportPlan; readonly requestedBy: string }

/** The first step: the export is running, the source's plan in hand. One already done or failed is left alone. */
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
      return { next: page.next, rows: page.rows, written }
    })
  )
})

/** The pages joined into the export's file, kept for `EXPORT_DAYS`, and the requester told. */
export const finish = Effect.fn("Exports.finish")(function*(input: {
  readonly exportId: string
  readonly parts: number
  readonly plan: ExportPlan
}) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const parts = yield* FileParts
  const keys = Array.from({ length: input.parts }, (_, n) => partKey(ws.id, input.exportId, n))
  const key = `${ws.id}/exports/${input.exportId}.${input.plan.extension}`
  const { sizeBytes } = yield* parts.join(key, keys, input.plan.mime).pipe(Effect.orDie)
  return yield* kicked(db.scopedFor((sql) =>
    Effect.gen(function*() {
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

/** The export could not be written: failed with why (for the logs, never shown), its pages removed, the requester told. */
export const fail = Effect.fn("Exports.fail")(function*(input: {
  readonly exportId: string
  readonly parts: number
  readonly reason: string
}) {
  const db = yield* Db
  const ws = yield* CurrentWorkspace
  const files = yield* FileStore
  yield* files.remove(Array.from({ length: input.parts }, (_, n) => partKey(ws.id, input.exportId, n)))
  yield* kicked(db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ requestedBy: string }>`
        update exports set state = 'failed', error = ${input.reason.slice(0, 500)}, finished_at = now()
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

/** The nightly sweep's workspaces: those holding an export's file past its seven days. */
export const dueWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from export_due_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** One workspace's lapsed exports: the files gone from the bucket and from `files`, the rows `expired`. */
export const expireIn = Effect.fn("Exports.expireIn")(function*() {
  const db = yield* Db
  const files = yield* FileStore
  const keys = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<{ id: string; r2Key: string | null }>`
        update exports e set state = 'expired', file_id = null
        from (select x.id, f.r2_key from exports x left join files f on f.id = x.file_id
              where x.state = 'ready' and x.expires_at <= now() limit 500) d
        where e.id = d.id returning e.id, d.r2_key`
      const ids = rows.map((r) => r.id)
      if (ids.length > 0) {
        yield* sql`update files set deleted_at = now() where owner_type = 'export' and owner_id in ${sql.in(ids)}`
      }
      return rows.flatMap((r) => (r.r2Key === null ? [] : [r.r2Key]))
    })
  )
  yield* files.remove(keys)
  return keys.length
})
