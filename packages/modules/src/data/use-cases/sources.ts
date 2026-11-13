import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { csvBytes, type ExportJob, ExportRefused, type ExportSource } from "../../shared/domain/Exports.ts"
import { FilterGroup } from "../../shared/domain/Filter.ts"
import { compileFilter, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { type OrderColumn } from "../domain/Data.ts"

/*
 * The Data hub's two export sources (M14 step 5), registered with the `ExportWorkflow` (`platform/Exports.ts`):
 * Bestellingen, under the list's filter and inside the requester's stores as they were when asked; and an imported
 * file, its columns by index. Both write the hub's CSV (`;`, a BOM, the header on the first page), a few thousand rows
 * per page.
 */

const PAGE_ROWS = 2000
const CSV = { mime: "text/csv;charset=utf-8", extension: "csv", pageRows: PAGE_ROWS } as const

/** What the orders list filters on (the same whitelist as `Orders.list`, kept here: a slice reads its own copy). */
export const ORDER_FILTER: Whitelist = {
  status: { column: "o.status", type: "option" },
  payment_status: { column: "o.payment_status", type: "option" },
  fulfillment_status: { column: "o.fulfillment_status", type: "option" },
  store_id: { column: "o.store_id", type: "option" },
  currency: { column: "o.currency", type: "option" },
  number: { column: "o.number", type: "text" },
  customer_name: { column: "o.customer_name", type: "text" },
  customer_email: { column: "o.customer_email", type: "text" },
  total: { column: "o.total_minor", type: "number", scale: 100 },
  placed_at: { column: "o.placed_at", type: "date" },
  tags: { column: "o.tags", type: "tags" }
}

interface OrderLine {
  readonly id: string
  readonly number: string
  readonly customerName: string
  readonly customerEmail: string | null
  readonly totalMinor: string | number
  readonly currency: string
  readonly status: string
  readonly paymentStatus: string
  readonly fulfillmentStatus: string
  readonly lineCount: number
  readonly trackingNumber: string | null
  readonly placedAt: Date
  /** `placed_at` as the database writes it, to the microsecond: the page's cursor, compared as it is. */
  readonly placedKey: string
}

const STATUS: Record<string, string> = {
  placed: "Geplaatst",
  paid: "Betaald",
  at_supplier: "Bij leverancier",
  shipped: "Verzonden",
  delivered: "Bezorgd",
  refunded: "Terugbetaald",
  cancelled: "Geannuleerd"
}
const PAYMENT: Record<string, string> = {
  pending: "In afwachting",
  paid: "Betaald",
  partially_refunded: "Deels terugbetaald",
  refunded: "Terugbetaald",
  voided: "Vervallen"
}
const FULFILMENT: Record<string, string> = {
  unfulfilled: "Niet afgehandeld",
  partial: "Deels afgehandeld",
  fulfilled: "Afgehandeld",
  returned: "Retour"
}

/** Amounts with a decimal comma, as the `;` file is read by Dutch Excel. */
const amount = (minor: string | number) => (Number(minor) / 100).toFixed(2).replace(".", ",")

/** Each order column: its header in the file and its value. */
export const ORDER_EXPORT: Record<OrderColumn, { readonly label: string; readonly read: (o: OrderLine) => string }> = {
  number: { label: "Bestelling", read: (o) => o.number },
  customer: { label: "Klant", read: (o) => o.customerName },
  email: { label: "E-mail", read: (o) => o.customerEmail ?? "" },
  total: { label: "Totaal", read: (o) => amount(o.totalMinor) },
  currency: { label: "Valuta", read: (o) => o.currency.trim() },
  status: { label: "Status", read: (o) => STATUS[o.status] ?? o.status },
  payment: { label: "Betaling", read: (o) => PAYMENT[o.paymentStatus] ?? o.paymentStatus },
  fulfillment: { label: "Afhandeling", read: (o) => FULFILMENT[o.fulfillmentStatus] ?? o.fulfillmentStatus },
  items: { label: "Artikelen", read: (o) => String(o.lineCount) },
  tracking: { label: "Track & trace", read: (o) => o.trackingNumber ?? "" },
  placed: { label: "Geplaatst", read: (o) => o.placedAt.toISOString() }
}

const decodeFilter = Schema.decodeUnknownEffect(Schema.NullOr(FilterGroup))

/** The orders an export holds: not drafts, inside its stores, under its filter. */
const ordersWhere = Effect.fn("Data.ordersWhere")(function*(sql: SqlClient.SqlClient, job: ExportJob) {
  const filter = yield* decodeFilter(job.filter ?? null).pipe(
    Effect.mapError(() => new ExportRefused({ reason: "the filter does not decode" }))
  )
  const compiled = yield* compileFilter(sql, filter ?? undefined, ORDER_FILTER).pipe(
    Effect.mapError((e) => new ExportRefused({ reason: `filter: ${e._tag}` }))
  )
  const scope = job.storeScope === null ? sql`true` : sql`o.store_id = any(${[...job.storeScope]}::text[])`
  return sql.and([sql`not o.is_draft`, scope, compiled])
})

const columnsOf = (job: ExportJob) =>
  Effect.forEach(job.columns, (c) =>
    c in ORDER_EXPORT
      ? Effect.succeed(ORDER_EXPORT[c as OrderColumn])
      : Effect.fail(new ExportRefused({ reason: `unknown column ${c}` })))

/**
 * The orders page's cursor: the last row's `placed_at` as Postgres wrote it (to the microsecond, so two orders in one
 * millisecond are never skipped or written twice) and its id, compared as `(placed_at, id)` in the database.
 */
export const cursorOf = (row: { readonly placedKey: string; readonly id: string }) => `${row.placedKey}|${row.id}`

export const keyOf = (cursor: string | null) => {
  if (cursor === null) return undefined
  const at = cursor.lastIndexOf("|")
  return { placedAt: cursor.slice(0, at), id: cursor.slice(at + 1) }
}

/** Bestellingen as an export source, `pageRows` to a page (a test pages by two to cross many page ends). */
export const ordersSourceOf = (pageRows: number): ExportSource => ({
  name: "orders",
  plan: (sql, job) =>
    Effect.gen(function*() {
      yield* columnsOf(job)
      const where = yield* ordersWhere(sql, job)
      const [row] = yield* sql<{ n: number }>`select count(*)::int as n from orders o where ${where}`
      return { ...CSV, pageRows, total: row?.n ?? 0 }
    }).pipe(Effect.catchTag("SqlError", Effect.die)),
  page: (sql, job, cursor) =>
    Effect.gen(function*() {
      const columns = yield* columnsOf(job)
      const where = yield* ordersWhere(sql, job)
      const key = keyOf(cursor)
      const after = key === undefined
        ? sql`true`
        : sql`(o.placed_at, o.id) < (${key.placedAt}::timestamptz, ${key.id})`
      const rows = yield* sql<OrderLine>`
        select o.id, o.number, o.customer_name, o.customer_email, o.total_minor, o.currency, o.status,
               o.payment_status, o.fulfillment_status, o.placed_at, o.placed_at::text as placed_key,
               (select count(*) from order_lines l where l.order_id = o.id)::int as line_count,
               (select f.tracking_number from fulfilments f where f.order_id = o.id and f.tracking_number is not null
                  order by f.shipped_at desc nulls last limit 1) as tracking_number
        from orders o where ${where} and ${after}
        order by o.placed_at desc, o.id desc limit ${pageRows}`
      const last = rows.at(-1)
      return {
        bytes: csvBytes(rows.map((o) => columns.map((c) => c.read(o))), {
          header: cursor === null ? columns.map((c) => c.label) : undefined
        }),
        rows: rows.length,
        next: rows.length === pageRows && last !== undefined ? cursorOf(last) : null
      }
    }).pipe(Effect.catchTag("SqlError", Effect.die))
})

export const ordersSource = ordersSourceOf(PAGE_ROWS)

const importOf = Effect.fn("Data.exportImport")(function*(sql: SqlClient.SqlClient, job: ExportJob) {
  const [row] = yield* sql<{ header: ReadonlyArray<string>; rowCount: number }>`
    select header, row_count from imports where id = ${job.sourceRef ?? ""} and deleted_at is null and state = 'done'`
  if (row === undefined) return yield* new ExportRefused({ reason: "the import is gone" })
  const indexes = job.columns.map(Number)
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= row.header.length)) {
    return yield* new ExportRefused({ reason: "a column the import does not have" })
  }
  return { ...row, indexes }
})

export const importSource: ExportSource = {
  name: "import",
  plan: (sql, job) =>
    importOf(sql, job).pipe(
      Effect.map((i) => ({ ...CSV, total: i.rowCount })),
      Effect.catchTag("SqlError", Effect.die)
    ),
  page: (sql, job, cursor) =>
    Effect.gen(function*() {
      const imported = yield* importOf(sql, job)
      const after = cursor === null ? 0 : Number(cursor)
      const rows = yield* sql<{ n: number; cells: ReadonlyArray<string> }>`
        select n, cells from import_rows where import_id = ${job.sourceRef ?? ""} and n > ${after}
        order by n limit ${PAGE_ROWS}`
      const last = rows.at(-1)
      return {
        bytes: csvBytes(rows.map((r) => imported.indexes.map((i) => r.cells[i] ?? "")), {
          header: cursor === null
            ? imported.indexes.map((i) => imported.header[i] || `Kolom ${i + 1}`)
            : undefined
        }),
        rows: rows.length,
        next: rows.length === PAGE_ROWS && last !== undefined ? String(last.n) : null
      }
    }).pipe(Effect.catchTag("SqlError", Effect.die))
}
