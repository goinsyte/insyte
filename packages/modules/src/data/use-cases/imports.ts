import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { cleanFileName, FileStore } from "../../shared/domain/Documents.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import { likePattern } from "../../shared/domain/Search.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { textOf } from "../domain/csv.ts"
import {
  ImportChange,
  type ImportIdInput,
  ImportList,
  ImportNotReady,
  ImportPreview,
  ImportRows,
  type ImportRowsInput,
  MAX_IMPORT_BYTES,
  PREVIEW_ROWS,
  UploadNotFound
} from "../domain/Data.ts"
import { IMPORT_SELECT, importOf, type ImportRecord, importRecord } from "./queries.ts"

/*
 * CSV imports (M14 step 5; widgets/02 "/data?view=import"). Data · Bekijken reads them; Data · Importeren (level 2)
 * brings one in: the file through the session's upload route (`storeUpload`), then `upload` makes it an import and
 * the jobs Worker reads it (`parse`), then the member sees its first rows and imports it (`commit`) or cancels
 * (`remove` of one not imported yet takes it and its file away). Removing an imported file and importing one each come
 * with an undo token (`data.restore`). Imports are the workspace's, not the member's.
 */

export const RESTORE = "data.restore"

const CSV_TYPES = new Set(["text/csv", "text/plain", "text/tab-separated-values", "application/vnd.ms-excel"])

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "import",
        subjectId: id,
        diff
      })
  )

/**
 * The CSV as uploaded (`PUT /api/data/imports`): kept in the bucket and in `files` as the member's, not yet an import.
 * A name that is not a CSV's and a type that is not text is refused, and so is a file that is not text at all.
 */
export const storeUpload = Effect.fn("Data.imports.storeUpload")(function*(input: {
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  yield* Policy.require("data", 2)
  const mime = input.mime.toLowerCase().split(";")[0]!.trim()
  const named = /\.(csv|tsv|txt)$/i.test(input.name)
  if (!named && !CSV_TYPES.has(mime)) return yield* new Invalid({ fields: { file: "type" } })
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMPORT_BYTES) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  if (textOf(input.bytes) === undefined) return yield* new Invalid({ fields: { file: "type" } })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const id = mintId("fil")
  const key = `${principal.workspaceId}/imports/${id}.csv`
  yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, "text/csv")).pipe(
    Effect.orDie
  )
  const name = Array.from(cleanFileName(input.name).trim()).slice(0, 200).join("").trim() || "import.csv"
  yield* db.scoped((sql) =>
    sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, uploaded_by)
        values (${id}, ${principal.workspaceId}, ${key}, ${name}, 'text/csv', ${input.bytes.byteLength},
                'import_csv', 'import', null, ${principal.id})`
  )
  return { fileId: id, name, sizeBytes: input.bytes.byteLength }
})

/** The uploaded file made an import, and the jobs Worker asked to read it. */
export const upload = Effect.fn("Data.imports.upload")(function*(input: { readonly fileId: string }) {
  yield* Policy.require("data", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [file] = yield* sql<{ id: string; name: string }>`
        select id, name from files
        where id = ${input.fileId} and kind = 'import_csv' and owner_type = 'import' and owner_id is null
          and uploaded_by = ${principal.id} and deleted_at is null
        for update`
      if (file === undefined) return yield* new UploadNotFound({ id: input.fileId })
      const id = mintId("imp")
      yield* sql`insert into imports (id, workspace_id, file_id, file_name, created_by)
                 values (${id}, ${principal.workspaceId}, ${file.id}, ${file.name}, ${principal.id})`
      yield* sql`update files set owner_id = ${id} where id = ${file.id}`
      yield* audit(sql, "data.import_upload", id, { fileName: file.name })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "import.uploaded",
        workspaceId: principal.workspaceId,
        importId: id,
        userId: principal.id
      })
      ;(yield* PendingEvents)?.add(outboxId)
      return importOf(yield* importRecord(sql, id).pipe(Effect.catchTag("ImportNotFound", Effect.die)))
    })
  )
})

/** Every import not removed, newest first: those still being read or waiting, and those imported. */
export const list = Effect.fn("Data.imports.list")(function*() {
  yield* Policy.require("data", 1)
  const db = yield* Db
  const rows = yield* db.scoped((sql) =>
    sql<ImportRecord>`select ${sql.literal(IMPORT_SELECT)} from imports i where i.deleted_at is null
                      order by i.created_at desc, i.id desc limit 200`
  )
  return new ImportList({ rows: rows.map(importOf) })
})

/** One import with its first rows, once it is read. */
export const preview = Effect.fn("Data.imports.preview")(function*(input: ImportIdInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const record = yield* importRecord(sql, input.importId)
      const rows = yield* sql<{ cells: ReadonlyArray<string> }>`
        select cells from import_rows where import_id = ${record.id} order by n limit ${PREVIEW_ROWS}`
      return new ImportPreview({ import: importOf(record), firstRows: rows.map((r) => r.cells) })
    })
  )
})

/** A page of an import's rows for Tabel, a search over every cell. */
export const rows = Effect.fn("Data.imports.rows")(function*(input: ImportRowsInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  const limit = input.limit ?? 500
  const after = input.after ?? 0
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const record = yield* importRecord(sql, input.importId)
      const q = input.q?.trim() ?? ""
      const search = q === ""
        ? sql`true`
        : sql`exists (select 1 from unnest(r.cells) c where c ilike ${likePattern(q)})`
      const page = yield* sql<{ n: number; cells: ReadonlyArray<string> }>`
        select r.n, r.cells from import_rows r
        where r.import_id = ${record.id} and r.n > ${after} and ${search} order by r.n limit ${limit + 1}`
      const [total] = q === ""
        ? [{ n: record.rowCount }]
        : yield* sql<{ n: number }>`select count(*)::int as n from import_rows r
                                     where r.import_id = ${record.id} and ${search}`
      const shown = page.slice(0, limit)
      return new ImportRows({
        rows: shown.map((r) => r.cells),
        total: total?.n ?? 0,
        next: page.length > limit ? (shown.at(-1)?.n ?? null) : null
      })
    })
  )
})

/**
 * "N rijen importeren": the read file is in Tabel and Exporteren; the token undoes exactly that, the file back to
 * `parsed` (waiting to be imported), not removed.
 */
export const commit = Effect.fn("Data.imports.commit")(function*(input: ImportIdInput) {
  yield* Policy.require("data", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const record = yield* importRecord(sql, input.importId, { lock: true })
      if (record.state !== "parsed") return yield* new ImportNotReady({ id: record.id, state: record.state })
      yield* sql`update imports set state = 'done', committed_at = now() where id = ${record.id}`
      yield* audit(sql, "data.import", record.id, { rows: record.rowCount, fileName: record.fileName })
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { id: record.id, to: "parsed" } })
      return new ImportChange({ import: importOf(yield* importRecord(sql, record.id)), undo })
    })
  )
})

/**
 * "Verwijderen" of an imported file: out of Tabel and Exporteren, its rows kept for the undo. "Annuleren" of one not
 * imported yet: it and its file are gone, nothing to undo.
 */
export const remove = Effect.fn("Data.imports.remove")(function*(input: ImportIdInput) {
  yield* Policy.require("data", 2)
  const db = yield* Db
  const removed = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const record = yield* importRecord(sql, input.importId, { lock: true })
      if (record.state !== "done") {
        const [file] = yield* sql<{ r2Key: string }>`
          update files set deleted_at = now() where id = ${record.fileId} returning r2_key`
        yield* sql`delete from imports where id = ${record.id}`
        yield* audit(sql, "data.import_cancel", record.id, { fileName: record.fileName })
        return { change: new ImportChange({ import: importOf(record), undo: null }), keys: file ? [file.r2Key] : [] }
      }
      yield* sql`update imports set deleted_at = now() where id = ${record.id}`
      yield* audit(sql, "data.import_remove", record.id, { fileName: record.fileName })
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { id: record.id, to: "restored" } })
      return { change: new ImportChange({ import: importOf(record), undo }), keys: [] }
    })
  )
  if (removed.keys.length > 0) yield* Effect.flatMap(Effect.service(FileStore), (f) => f.remove(removed.keys))
  return removed.change
})

/** A removed import back in Tabel and Exporteren. */
export const restore = Effect.fn("Data.imports.restore")(function*(input: ImportIdInput) {
  yield* Policy.require("data", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const record = yield* importRecord(sql, input.importId, { lock: true, removed: true })
      yield* sql`update imports set deleted_at = null where id = ${record.id}`
      yield* audit(sql, "data.import_restore", record.id)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { id: record.id, to: "removed" } })
      return new ImportChange({ import: importOf(yield* importRecord(sql, record.id)), undo })
    })
  )
})

/** What an undo puts the import back to: waiting to be imported, removed, or back in Tabel. */
const Snapshot = Schema.Struct({ id: Schema.String, to: Schema.Literals(["parsed", "removed", "restored"]) })
const decodeSnapshot = Schema.decodeUnknownEffect(Snapshot)

/**
 * `Shared.undo` for `data.restore`: the import as it was before the command. An import is only changed if it is still
 * as the command left it, and only a change is audited, so an undo that finds nothing to do leaves no line.
 */
export const restoreSnapshot = Effect.fn("Data.imports.restoreSnapshot")(
  function*(sql: SqlClient.SqlClient, compensation: unknown) {
    const snapshot = yield* decodeSnapshot(compensation).pipe(Effect.orDie)
    yield* Policy.require("data", 2)
    const changed = snapshot.to === "parsed"
      ? yield* sql<{ id: string }>`
          update imports set state = 'parsed', committed_at = null
          where id = ${snapshot.id} and state = 'done' and deleted_at is null returning id`
      : snapshot.to === "removed"
      ? yield* sql<{ id: string }>`
          update imports set deleted_at = now() where id = ${snapshot.id} and deleted_at is null returning id`
      : yield* sql<{ id: string }>`
          update imports set deleted_at = null where id = ${snapshot.id} and deleted_at is not null returning id`
    if (changed.length === 0) return
    yield* audit(
      sql,
      snapshot.to === "parsed"
        ? "data.import_undo"
        : snapshot.to === "removed"
        ? "data.import_remove"
        : "data.import_restore",
      snapshot.id
    )
  }
)

/** How long a removed import is kept for its undo, and a file never imported for the member to come back to. */
const PURGE_REMOVED_HOURS = 1
const PURGE_UNIMPORTED_DAYS = 7

/**
 * The nightly purge (M14 step 5), as `system` in one workspace: imports removed more than an hour ago (well past their
 * undo), and files uploaded but never imported within seven days (still waiting, failed, or never made an import), go
 * for good: their rows, their row and their file, in the database and then in the bucket. Up to 200 a night.
 */
export const purgeIn = Effect.fn("Data.imports.purge")(function*() {
  const db = yield* Db
  const keys = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const gone = yield* sql<{ id: string; fileId: string }>`
        delete from imports where id in (
          select id from imports
          where (deleted_at is not null and deleted_at < now() - make_interval(hours => ${PURGE_REMOVED_HOURS}))
             or (state <> 'done' and created_at < now() - make_interval(days => ${PURGE_UNIMPORTED_DAYS}))
          limit 200)
        returning id, file_id`
      const fileIds = gone.map((g) => g.fileId)
      const files = yield* sql<{ r2Key: string }>`
        update files set deleted_at = now()
        where kind = 'import_csv' and deleted_at is null
          and (${fileIds.length === 0 ? sql`false` : sql`id in ${sql.in(fileIds)}`}
               or (owner_id is null and created_at < now() - make_interval(days => ${PURGE_UNIMPORTED_DAYS})))
        returning r2_key`
      return files.map((f) => f.r2Key)
    })
  )
  yield* Effect.flatMap(Effect.service(FileStore), (f) => f.remove(keys))
  return keys.length
})
