import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import { readCsv } from "../domain/csv.ts"
import { MAX_IMPORT_CELL_CHARS, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "../domain/Data.ts"

/*
 * Reading an uploaded CSV (M14 step 5), the `ImportParseWorkflow`'s step, as `system` in the import's workspace: the
 * file from the bucket, parsed in the hub's dialect (`domain/csv.ts`), its rows into `import_rows` in batches, the
 * header and the count on the import, now `parsed` for its preview; or `failed` with why. A retried step starts the
 * rows over, so a read never doubles a row. `told` hears each batch (`job.progress{ import_parse }`).
 *
 * The file is checked against every limit before a row is written, and its rows are then written a batch at a time
 * from the text (`readCsv`), so the step holds the file and one batch, never every cell: within the limits it stays far
 * below the isolate's 128 MB. A step the Workflow gives up on marks the import `unreadable` (`markUnreadable`).
 */

/** Rows per insert. */
const BATCH = 2000

const LIMITS = { maxRows: MAX_IMPORT_ROWS, maxColumns: MAX_IMPORT_COLUMNS, maxCellChars: MAX_IMPORT_CELL_CHARS }

export type ParseOutcome =
  | { readonly state: "parsed"; readonly rows: number }
  | { readonly state: "failed"; readonly error: string }
  | { readonly state: "skipped" }

export const parse = Effect.fn("Data.imports.parse")(function*(
  importId: string,
  told: (done: number, total: number) => Effect.Effect<void> = () => Effect.void
) {
  const db = yield* Db
  const files = yield* FileStore
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [record] = yield* sql<{ id: string; state: string; r2Key: string | null }>`
        select i.id, i.state, f.r2_key from imports i left join files f on f.id = i.file_id
        where i.id = ${importId} and i.deleted_at is null for update of i`
      if (record === undefined || (record.state !== "uploaded" && record.state !== "parsing")) {
        return { state: "skipped" } satisfies ParseOutcome as ParseOutcome
      }
      yield* sql`update imports set state = 'parsing' where id = ${importId}`
      const stored = record.r2Key === null ? undefined : yield* files.get(record.r2Key)
      const read = stored === undefined ? ({ ok: false, error: "not_csv" } as const) : readCsv(stored.bytes, LIMITS)
      if (!read.ok) {
        yield* sql`update imports set state = 'failed', error = ${read.error}, error_line = ${read.line ?? null},
                     parsed_at = now()
                   where id = ${importId}`
        return { state: "failed", error: read.error } satisfies ParseOutcome as ParseOutcome
      }
      yield* sql`delete from import_rows where import_id = ${importId}`
      const total = read.rowCount
      const insert = (batch: ReadonlyArray<{ readonly n: number; readonly cells: ReadonlyArray<string> }>) =>
        sql`insert into import_rows (workspace_id, import_id, n, cells)
            select app_workspace_id(), ${importId}, (x ->> 'n')::int,
                   array(select t.e from jsonb_array_elements_text(x -> 'cells') with ordinality t(e, o) order by t.o)
            from jsonb_array_elements(${JSON.stringify(batch)}::jsonb) x`
      let batch: Array<{ readonly n: number; readonly cells: ReadonlyArray<string> }> = []
      let n = 0
      for (const cells of read.rows()) {
        n++
        batch.push({ n, cells })
        if (batch.length === BATCH) {
          yield* insert(batch)
          batch = []
          yield* told(n, total)
        }
      }
      if (batch.length > 0) {
        yield* insert(batch)
        yield* told(n, total)
      }
      yield* sql`update imports set state = 'parsed', header = ${[...read.header]}::text[], row_count = ${n},
                   parsed_at = now() where id = ${importId}`
      return { state: "parsed", rows: n } satisfies ParseOutcome as ParseOutcome
    })
  )
})

/**
 * The `ImportParseWorkflow` gave up on the file (every retry of its step failed: the bucket away, the isolate out of
 * memory): the import is `failed` as `unreadable`, so the member sees why and can upload it again, instead of a file
 * that stays `uploaded`. One already read or failed is left as it is.
 */
export const markUnreadable = Effect.fn("Data.imports.markUnreadable")(function*(importId: string) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ id: string }>`
      update imports set state = 'failed', error = 'unreadable', error_line = null, parsed_at = now()
      where id = ${importId} and state in ('uploaded', 'parsing') returning id`
  )
  return row !== undefined
})
