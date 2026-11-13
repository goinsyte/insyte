import { Context, type Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * Exports (M14 step 5; api.md §3.2, domain.md §5 "Exports"): any list, a sheet or the whole workspace as a file,
 * written by the `ExportWorkflow` on the jobs Worker. A slice that offers an export registers an `ExportSource` under a
 * name (`orders`, `import`; `sheet` and `workspace` come with theirs), asks for one with `Exports.request` (an `exports`
 * row, audited, `export.requested` in the outbox), and the Workflow does the rest: the source's pages, each a part in
 * the files bucket, joined into one file, the requester told, the link good for `EXPORT_DAYS`.
 *
 * A source only turns rows into bytes. It never sees the bucket, the Workflow or the notification; it reads the
 * database as `system` in the export's workspace, so it narrows to what the requester could see itself (`storeScope`,
 * kept when the export was asked for).
 */

/** How long an export's file can be downloaded. */
export const EXPORT_DAYS = 7

export const ExportFormat = Schema.Literals(["csv", "xlsx", "zip"])
export type ExportFormat = typeof ExportFormat.Type

/** One export as its source reads it: the `exports` row. */
export interface ExportJob {
  readonly id: string
  readonly workspaceId: string
  readonly source: string
  /** What the source exports from, where it has more than one (an import's id, a sheet's id). */
  readonly sourceRef: string | null
  readonly columns: ReadonlyArray<string>
  /** The list's filter (a `FilterGroup`), as the source's request schema took it. */
  readonly filter: unknown
  /** The requester's stores when they asked; `null` for every store. */
  readonly storeScope: ReadonlyArray<string> | null
  readonly format: ExportFormat
  readonly requestedBy: string
}

/** What a source says before its first page. */
export interface ExportPlan {
  readonly mime: string
  /** The file name's extension, without the dot. */
  readonly extension: string
  /** The rows it will write, for the progress; `null` when it cannot say. */
  readonly total: number | null
}

/** One page of the file: its bytes, how many rows they hold, and where the next starts (`null` after the last). */
export interface ExportPage {
  readonly bytes: Uint8Array
  readonly rows: number
  readonly next: string | null
}

/** The source cannot write this export (what it exports from is gone, a column it does not know). */
export class ExportRefused extends Schema.TaggedError<ExportRefused>()("ExportRefused", {
  reason: Schema.String
}) {}

export interface ExportSource {
  readonly name: string
  readonly plan: (sql: SqlClient.SqlClient, job: ExportJob) => Effect.Effect<ExportPlan, ExportRefused>
  /**
   * The page after `cursor` (`null` for the first). A page stays small (a few thousand rows): each is one durable step
   * of the Workflow, so an export of any size never holds more than a page.
   */
  readonly page: (
    sql: SqlClient.SqlClient,
    job: ExportJob,
    cursor: string | null
  ) => Effect.Effect<ExportPage, ExportRefused>
}

/** Every registered source by name; composed where the app is (`apps/api/src/platform/Exports.ts`). */
export class ExportSources extends Context.Service<ExportSources, ReadonlyMap<string, ExportSource>>()(
  "shared/ExportSources"
) {}

/** Starting an export's `ExportWorkflow`, named by the export, so a relay that delivers the request twice writes once. */
export class ExportRuns extends Context.Service<ExportRuns, {
  readonly start: (input: { readonly workspaceId: string; readonly exportId: string }) => Effect.Effect<void>
}>()("shared/ExportRuns") {}

/** A CSV cell the way Dutch Excel reads it: `;`-separated, quoted when it holds `;`, a quote or a line end. */
/**
 * A text that a spreadsheet would run as a formula (`=`, `+`, `@`, or `-` before anything but a number) starts with
 * `'`, so a customer's name cannot become one in the member's Excel (OWASP "CSV injection").
 */
const inert = (value: string) => (/^[=+@\t\r]|^-(?![\d.,])/.test(value) ? `'${value}` : value)

const cell = (raw: string) => {
  const value = inert(raw)
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value
}

const encoder = new TextEncoder()

/**
 * Rows as CSV bytes, for a source that writes CSV: `;` and CRLF, the BOM before the first page only (so Excel reads
 * it as UTF-8), the header with it.
 */
export const csvBytes = (
  rows: ReadonlyArray<ReadonlyArray<string>>,
  options: { readonly header?: ReadonlyArray<string> | undefined } = {}
) => {
  const lines = (options.header === undefined ? rows : [options.header, ...rows]).map((r) =>
    `${r.map(cell).join(";")}\r\n`
  )
  return encoder.encode(`${options.header === undefined ? "" : "\uFEFF"}${lines.join("")}`)
}
