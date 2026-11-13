import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import { parseCsv } from "../domain/csv.ts"
import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "../domain/Data.ts"

/*
 * Reading an uploaded CSV (M14 step 5), the `ImportParseWorkflow`'s step, as `system` in the import's workspace: the
 * file from the bucket, parsed in the hub's dialect (`domain/csv.ts`), its rows into `import_rows` in batches, the
 * header and the count on the import, now `parsed` for its preview; or `failed` with why. A retried step starts the
 * rows over, so a read never doubles a row. `told` hears each batch (`job.progress{ import_parse }`).
 */

/** Rows per insert. */
const BATCH = 2000

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
      const parsed = stored === undefined
        ? ({ ok: false, error: "not_csv" } as const)
        : parseCsv(stored.bytes, { maxRows: MAX_IMPORT_ROWS, maxColumns: MAX_IMPORT_COLUMNS })
      if (!parsed.ok) {
        yield* sql`update imports set state = 'failed', error = ${parsed.error},
                     error_line = ${parsed.error === "parse_failed" ? parsed.line ?? null : null}, parsed_at = now()
                   where id = ${importId}`
        return { state: "failed", error: parsed.error } satisfies ParseOutcome as ParseOutcome
      }
      yield* sql`delete from import_rows where import_id = ${importId}`
      const total = parsed.rows.length
      for (let start = 0; start < total; start += BATCH) {
        const batch = parsed.rows.slice(start, start + BATCH).map((cells, i) => ({ n: start + i + 1, cells }))
        yield* sql`insert into import_rows (workspace_id, import_id, n, cells)
                   select app_workspace_id(), ${importId}, (x ->> 'n')::int,
                          array(select t.e from jsonb_array_elements_text(x -> 'cells') with ordinality t(e, o) order by t.o)
                   from jsonb_array_elements(${JSON.stringify(batch)}::jsonb) x`
        yield* told(Math.min(total, start + BATCH), total)
      }
      yield* sql`update imports set state = 'parsed', header = ${[...parsed.header]}::text[], row_count = ${total},
                   parsed_at = now() where id = ${importId}`
      return { state: "parsed", rows: total } satisfies ParseOutcome as ParseOutcome
    })
  )
})
