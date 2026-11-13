import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Documents, FileStore } from "../../shared/domain/Documents.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { statementHtml } from "../domain/StatementDocument.ts"
import {
  type MarkPaidInput,
  type Month,
  StatementChange,
  StatementDetail,
  type StatementInput,
  type StatementLine,
  StatementList,
  type StatementRestore,
  StatementRow,
  type StatementsInput
} from "../domain/Statements.ts"

/*
 * Supplier statements (M13 step 6; domain.md §5, widgets/06 §0.5). The rule, the demo's (`lib/supplier-statements.ts`)
 * on real rows:
 *
 * - a supplier's line is one of its leg's lines (`forwarding_items.line_ids`, the leg not cancelled), shipped when its
 *   `supplier_work` says so (the supplier's own parcel) or when the leg is confirmed and Shopify has the order shipped;
 *   it counts at its product's cost price × quantity, on the day it shipped;
 * - a correction takes the same cost off for each line of a return that was the supplier's fault (the return's reason
 *   counts for quality) and was settled with a refund, on the day it was settled;
 * - amounts are in the workspace's currency: a cost in another store currency at the latest `fx_rates` on or before
 *   its day. No cost price, or no rate, keeps the line with `missing` and counts nothing;
 * - every line is booked once per supplier: a month's close takes what happened up to its end and is not booked yet,
 *   so what arrives after a close lands in the next statement and a closed month is never reopened.
 *
 * Reading is Leveranciers at Bekijken, marking paid at Beheren (api.md §2.7). The close runs as `system`.
 */

const RESTORE = "suppliers.restore"

/** The day of the month after on which a month is paid (widgets/06 §0.5). */
const PAY_DAY = 15

interface Move {
  readonly kind: StatementLine["kind"]
  readonly supplierId: string
  readonly orderId: string
  readonly orderLineId: string
  readonly orderNumber: string
  readonly day: string
  readonly title: string
  readonly qty: number
  readonly unitCostMinor: string | null
  readonly missing: "cost" | "rate" | null
  readonly reason: string | null
  readonly returnId: string | null
  readonly returnLineId: string | null
}

/** What is to be booked for these suppliers (all, for `null`) up to the end of `month`, in the workspace's timezone. */
const moves = (sql: SqlClient.SqlClient, month: string, supplierIds: ReadonlyArray<string> | null) =>
  sql<Move>`
    with w as (
      select currency, timezone,
             (((${month} || '-01')::date + interval '1 month')::timestamp at time zone timezone) as until
      from workspaces where id = app_workspace_id()
    ),
    legs as (
      select f.supplier_id, f.order_id, f.line_ids, o.number, coalesce(st.currency, o.currency) as cost_currency,
             case when wk.status = 'shipped' then coalesce(wk.shipped_at, o.shipped_at)
                  when f.state = 'confirmed' then o.shipped_at end as shipped_at
      from forwarding_items f
      join orders o on o.id = f.order_id
      join stores st on st.id = o.store_id
      left join supplier_work wk on wk.order_id = f.order_id and wk.supplier_id = f.supplier_id
      where f.state <> 'cancelled' and f.supplier_id is not null
        and (${supplierIds === null}::boolean or f.supplier_id = any(${[...(supplierIds ?? [])]}::text[]))
    ),
    m as (
      select 'shipped' as kind, g.supplier_id, g.order_id, l.id as order_line_id, g.number, g.cost_currency,
             g.shipped_at as at, l.quantity as qty, null::text as reason, null::text as return_id,
             null::text as return_line_id
      from legs g cross join w
      cross join lateral unnest(g.line_ids) as li(id)
      join order_lines l on l.id = li.id
      where g.shipped_at is not null and g.shipped_at < w.until
        and not exists (select 1 from supplier_statement_lines b where b.kind = 'shipped'
                        and b.supplier_id = g.supplier_id and b.order_line_id = l.id)
      union all
      select 'correction', g.supplier_id, g.order_id, l.id, g.number, g.cost_currency, r.resolved_at, rl.quantity,
             coalesce(rr.label, r.reason_id), r.id, rl.id
      from legs g cross join w
      join returns r on r.order_id = g.order_id
      join return_lines rl on rl.return_id = r.id and rl.order_line_id = any(g.line_ids)
      join order_lines l on l.id = rl.order_line_id
      left join return_reasons rr on rr.workspace_id = r.workspace_id and rr.id = r.reason_id
      where g.shipped_at is not null and r.status = 'resolved' and r.resolution = 'refund' and r.quality
        and r.resolved_at is not null and r.resolved_at < w.until
        and not exists (select 1 from supplier_statement_lines b where b.kind = 'correction'
                        and b.supplier_id = g.supplier_id and b.return_line_id = rl.id)
    )
    select m.kind, m.supplier_id, m.order_id, m.order_line_id, m.number as order_number,
           to_char((m.at at time zone w.timezone)::date, 'YYYY-MM-DD') as day,
           l.title || coalesce(' · ' || nullif(l.variant_title, ''), '') as title, m.qty,
           case when p.cost_minor is null then null
                when m.cost_currency = w.currency then p.cost_minor
                when fx.rate is null then null
                else round(p.cost_minor * fx.rate)::bigint end as unit_cost_minor,
           case when p.cost_minor is null then 'cost'
                when m.cost_currency <> w.currency and fx.rate is null then 'rate' end as missing,
           m.reason, m.return_id, m.return_line_id
    from m cross join w
    join order_lines l on l.id = m.order_line_id
    left join products p on p.id = l.product_id
    left join lateral (
      select x.rate from fx_rates x
      where x.base = m.cost_currency and x.quote = w.currency and x.day <= (m.at at time zone w.timezone)::date
      order by x.day desc limit 1) fx on true
    order by m.supplier_id, m.at, m.number, m.kind desc, m.order_line_id`

const lineOf = (m: Move, id: string): StatementLine => {
  const unit = m.unitCostMinor === null ? null : Number(m.unitCostMinor)
  const sign = m.kind === "correction" ? -1 : 1
  return {
    id,
    kind: m.kind,
    orderId: m.orderId,
    orderLineId: m.orderLineId,
    orderNumber: m.orderNumber,
    day: m.day,
    title: m.title,
    qty: m.qty,
    unitCostMinor: unit,
    totalMinor: unit === null ? 0 : sign * unit * m.qty,
    missing: m.missing,
    reason: m.reason,
    returnId: m.returnId
  }
}

const totals = (lines: ReadonlyArray<StatementLine>) => {
  const shipped = lines.filter((l) => l.kind === "shipped")
  const shippedMinor = shipped.reduce((n, l) => n + l.totalMinor, 0)
  const correctionsMinor = lines.filter((l) => l.kind === "correction").reduce((n, l) => n + l.totalMinor, 0)
  return {
    shippedMinor,
    correctionsMinor,
    totalMinor: shippedMinor + correctionsMinor,
    shippedLines: shipped.length,
    missingLines: lines.filter((l) => l.missing !== null).length
  }
}

/** The 15th of the month after `month`. */
const payDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  return `${next.y}-${String(next.m).padStart(2, "0")}-${String(PAY_DAY).padStart(2, "0")}`
}

interface StoredRow {
  readonly id: string
  readonly supplierId: string
  readonly supplierName: string
  readonly month: string
  readonly status: "processing" | "paid"
  readonly currency: string
  readonly shippedMinor: string
  readonly correctionsMinor: string
  readonly totalMinor: string
  readonly shippedLines: number
  readonly missingLines: number
  readonly payDay: string
  readonly closedAt: Date
  readonly paidAt: Date | null
  readonly paidReference: string | null
  readonly invoiceFileId: string | null
}

const SELECT_ROW = `
  s.id, s.supplier_id, sp.name as supplier_name, s.month, s.status, trim(s.currency) as currency, s.shipped_minor,
  s.corrections_minor, s.total_minor, s.shipped_lines, s.missing_lines, to_char(s.pay_day, 'YYYY-MM-DD') as pay_day,
  s.closed_at, s.paid_at, s.paid_reference, s.invoice_file_id
  from supplier_statements s join suppliers sp on sp.id = s.supplier_id`

const toRow = (r: StoredRow) =>
  new StatementRow({
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    month: r.month,
    status: r.status,
    currency: r.currency,
    shippedMinor: Number(r.shippedMinor),
    correctionsMinor: Number(r.correctionsMinor),
    totalMinor: Number(r.totalMinor),
    shippedLines: r.shippedLines,
    missingLines: r.missingLines,
    payDay: r.payDay,
    closedAt: r.closedAt.getTime(),
    paidAt: r.paidAt?.getTime() ?? null,
    paidReference: r.paidReference,
    invoiceFileId: r.invoiceFileId
  })

const storedWhere = (sql: SqlClient.SqlClient, where: ReturnType<SqlClient.SqlClient["and"]>) =>
  Effect.map(
    sql<StoredRow>`select ${sql.literal(SELECT_ROW)} where ${where} order by s.month desc, s.id`,
    (rows) => rows.map(toRow)
  )

/** The workspace's currency, and its month now. */
const here = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ currency: string; month: string; year: string }>`
      select trim(currency) as currency, to_char(now() at time zone timezone, 'YYYY-MM') as month,
             to_char(now() at time zone timezone, 'YYYY') as year
      from workspaces where id = app_workspace_id()`,
    ([w]) => w!
  )

const supplierOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<{ id: string; name: string }>`select id, name from suppliers where id = ${id}`,
    ([s]) => (s === undefined ? Effect.fail(new NotFound({ entity: "supplier", id })) : Effect.succeed(s))
  )

/** The running month as it stands: what its close would book now. */
const running = (sql: SqlClient.SqlClient, supplier: { id: string; name: string }, month: string, currency: string) =>
  Effect.map(moves(sql, month, [supplier.id]), (found) => {
    const lines = found.map((m, i) => lineOf(m, `open-${i}`))
    return {
      lines,
      row: lines.length === 0 ? undefined : new StatementRow({
        id: null,
        supplierId: supplier.id,
        supplierName: supplier.name,
        month,
        status: "open",
        currency,
        ...totals(lines),
        payDay: payDayOf(month),
        closedAt: null,
        paidAt: null,
        paidReference: null,
        invoiceFileId: null
      })
    }
  })

/** `Suppliers.statements`: a supplier's statements, newest first, with the running month while it has lines. */
export const list = Effect.fn("Suppliers.statements")(function*(input: typeof StatementsInput.Type) {
  yield* Policy.require("suppliers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const supplier = yield* supplierOf(sql, input.supplierId)
      const now = yield* here(sql)
      const stored = yield* storedWhere(sql, sql.and([sql`s.supplier_id = ${supplier.id}`]))
      const open = stored.some((s) => s.month === now.month)
        ? undefined
        : (yield* running(sql, supplier, now.month, now.currency)).row
      const paidYtdMinor = stored
        .filter((s) =>
          s.status === "paid" && s.paidAt !== null && new Date(s.paidAt).getUTCFullYear() === Number(now.year)
        )
        .reduce((n, s) => n + s.totalMinor, 0)
      return new StatementList({
        supplier,
        rows: open === undefined ? stored : [open, ...stored],
        summary: { currency: now.currency, paidYtdMinor, payDay: PAY_DAY }
      })
    })
  )
})

interface StoredLine {
  readonly id: string
  readonly kind: StatementLine["kind"]
  readonly orderId: string | null
  readonly orderLineId: string | null
  readonly orderNumber: string
  readonly day: string
  readonly title: string
  readonly qty: number
  readonly unitCostMinor: string | null
  readonly totalMinor: string
  readonly missing: "cost" | "rate" | null
  readonly reason: string | null
  readonly returnId: string | null
}

const linesOf = (sql: SqlClient.SqlClient, statementId: string) =>
  Effect.map(
    sql<StoredLine>`
      select id, kind, order_id, order_line_id, order_number, to_char(day, 'YYYY-MM-DD') as day, title, qty,
             unit_cost_minor, total_minor, missing, reason, return_id
      from supplier_statement_lines where statement_id = ${statementId}
      order by day, order_number, kind desc, id`,
    (rows) =>
      rows.map((l): StatementLine => ({
        ...l,
        unitCostMinor: l.unitCostMinor === null ? null : Number(l.unitCostMinor),
        totalMinor: Number(l.totalMinor)
      }))
  )

/** `Suppliers.statement`: one month, line by line; the running month as it stands. */
export const get = Effect.fn("Suppliers.statement")(function*(input: typeof StatementInput.Type) {
  yield* Policy.require("suppliers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const supplier = yield* supplierOf(sql, input.supplierId)
      const [stored] = yield* storedWhere(
        sql,
        sql.and([sql`s.supplier_id = ${supplier.id}`, sql`s.month = ${input.month}`])
      )
      if (stored !== undefined) {
        return new StatementDetail({ statement: stored, lines: yield* linesOf(sql, stored.id!) })
      }
      const now = yield* here(sql)
      if (input.month === now.month) {
        const { lines, row } = yield* running(sql, supplier, now.month, now.currency)
        if (row !== undefined) return new StatementDetail({ statement: row, lines })
      }
      return yield* new NotFound({ entity: "supplier_statement", id: `${supplier.id}:${input.month}` })
    })
  )
})

/** `Suppliers.markStatementPaid`: a closed month paid (or back to be paid), with Undo. */
export const markPaid = Effect.fn("Suppliers.markStatementPaid")(function*(input: typeof MarkPaidInput.Type) {
  yield* Policy.require("suppliers", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [was] = yield* sql<{
        status: "processing" | "paid"
        paidAt: Date | null
        paidBy: string | null
        paidReference: string | null
      }>`select status, paid_at, paid_by, paid_reference from supplier_statements where id = ${input.id} for update`
      if (was === undefined) return yield* new NotFound({ entity: "supplier_statement", id: input.id })
      const paid = input.paid ?? true
      const reference = input.reference?.trim() || null
      const read = Effect.map(storedWhere(sql, sql.and([sql`s.id = ${input.id}`])), ([row]) => row!)
      if ((was.status === "paid") === paid && (!paid || reference === null || reference === was.paidReference)) {
        return new StatementChange({ statement: yield* read, undo: null })
      }
      const paidAt = paid ? (was.paidAt ?? new Date()) : null
      const paidBy = paid ? (was.paidBy ?? principal.id) : null
      yield* sql`
        update supplier_statements set status = ${paid ? "paid" : "processing"},
          paid_at = ${paidAt}, paid_by = ${paidBy},
          paid_reference = ${paid ? (reference ?? was.paidReference) : null}
        where id = ${input.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: paid ? "supplier_statement.paid" : "supplier_statement.unpaid",
        subjectType: "supplier_statement",
        subjectId: input.id,
        diff: { status: [was.status, paid ? "paid" : "processing"], ...(reference === null ? {} : { reference }) }
      })
      const compensation: typeof StatementRestore.Type = {
        kind: "statement_paid",
        id: input.id,
        status: was.status,
        paidAt: was.paidAt?.getTime() ?? null,
        paidBy: was.paidBy,
        paidReference: was.paidReference
      }
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation })
      return new StatementChange({ statement: yield* read, undo })
    })
  )
})

/** `Shared.undo` for `markStatementPaid`: the statement as it was. */
export const restorePaid = Effect.fn("Suppliers.restoreStatement")(function*(
  sql: SqlClient.SqlClient,
  undo: typeof StatementRestore.Type
) {
  yield* Policy.require("suppliers", 3)
  const principal = yield* CurrentPrincipal
  yield* sql`
    update supplier_statements set status = ${undo.status},
      paid_at = ${undo.paidAt === null ? null : new Date(undo.paidAt)}, paid_by = ${undo.paidBy},
      paid_reference = ${undo.paidReference}
    where id = ${undo.id}`
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: "supplier_statement.restored",
    subjectType: "supplier_statement",
    subjectId: undo.id
  })
})

const SYSTEM = { kind: "system" as const, id: "monthly_close" }

/**
 * The month's close in the request's workspace (as `system`): each supplier with something to book gets its statement,
 * once. A supplier whose month is already closed is left as it is, so running it again writes nothing. A month not
 * over in the workspace's timezone is not closed (`ended: false`), unless `early` (the dev route's, for tests).
 */
export const closeIn = Effect.fn("Statements.closeIn")(function*(
  sql: SqlClient.SqlClient,
  month: Month,
  options: { readonly early?: boolean } = {}
) {
  const now = yield* here(sql)
  // Not over yet in the workspace's timezone (the cron's 03:00 UTC is still the last day west of it): nothing yet.
  if (options.early !== true && month >= now.month) {
    return { month, written: [] as ReadonlyArray<string>, skipped: 0, ended: false }
  }
  const [ws] = yield* sql<{ id: string }>`select app_workspace_id() as id`
  const workspaceId = ws!.id
  const closed = new Set(
    (yield* sql<{ supplierId: string }>`select supplier_id from supplier_statements where month = ${month}`)
      .map((r) => r.supplierId)
  )
  const bySupplier = new Map<string, Array<Move>>()
  for (const m of yield* moves(sql, month, null)) {
    if (closed.has(m.supplierId)) continue
    bySupplier.set(m.supplierId, [...(bySupplier.get(m.supplierId) ?? []), m])
  }
  const written: Array<string> = []
  for (const [supplierId, found] of bySupplier) {
    const id = mintId("sst")
    const lines = found.map((m) => ({ move: m, line: lineOf(m, mintId("ssl")) }))
    const sum = totals(lines.map((l) => l.line))
    const inserted = yield* sql`
      insert into supplier_statements (id, workspace_id, supplier_id, month, status, currency, shipped_minor,
                                       corrections_minor, total_minor, shipped_lines, missing_lines, pay_day)
      values (${id}, ${workspaceId}, ${supplierId}, ${month}, 'processing', ${now.currency}, ${sum.shippedMinor},
              ${sum.correctionsMinor}, ${sum.totalMinor}, ${sum.shippedLines}, ${sum.missingLines},
              ${payDayOf(month)}::date)
      on conflict (workspace_id, supplier_id, month) do nothing returning id`
    if (inserted.length === 0) continue
    yield* sql`
      insert into supplier_statement_lines (id, workspace_id, statement_id, supplier_id, kind, order_id, order_line_id,
                                            order_number, day, title, qty, unit_cost_minor, total_minor, missing, reason,
                                            return_id, return_line_id)
      select r.id, ${workspaceId}, ${id}, ${supplierId}, r.kind, r.order_id, r.order_line_id, r.order_number, r.day,
             r.title, r.qty, r.unit_cost_minor, r.total_minor, r.missing, r.reason, r.return_id, r.return_line_id
      from jsonb_to_recordset(${
      JSON.stringify(lines.map(({ line, move }) => ({
        id: line.id,
        kind: line.kind,
        order_id: line.orderId,
        order_line_id: line.orderLineId,
        order_number: line.orderNumber,
        day: line.day,
        title: line.title,
        qty: line.qty,
        unit_cost_minor: line.unitCostMinor,
        total_minor: line.totalMinor,
        missing: line.missing,
        reason: line.reason,
        return_id: line.returnId,
        return_line_id: move.returnLineId
      })))
    }::jsonb) as r(id text, kind text, order_id text, order_line_id text, order_number text, day date, title text,
                    qty integer, unit_cost_minor bigint, total_minor bigint, missing text, reason text, return_id text,
                    return_line_id text)`
    yield* Audit.write(sql, workspaceId, SYSTEM, {
      action: "supplier_statement.closed",
      subjectType: "supplier_statement",
      subjectId: id,
      diff: { month, totalMinor: sum.totalMinor, lines: lines.length }
    })
    written.push(id)
  }
  if (written.length > 0) {
    yield* Outbox.write(sql, workspaceId, {
      type: "statements.closed",
      workspaceId,
      userId: "system",
      month,
      statementIds: written
    })
  }
  return { month, written: written as ReadonlyArray<string>, skipped: closed.size, ended: true }
})

/**
 * Each closed statement of the workspace without its PDF gets one: rendered (Browser Rendering), kept in the files
 * bucket, named on the statement. One that cannot be made now is tried again at the next turn; answers the ones made.
 */
export const renderPendingIn = Effect.fn("Statements.renderPendingIn")(function*(sql: SqlClient.SqlClient) {
  const [ws] = yield* sql<{ id: string; name: string; legal: string | null }>`
    select id, name, legal_entity as legal from workspaces where id = app_workspace_id()`
  const pending = yield* storedWhere(sql, sql.and([sql`s.invoice_file_id is null`]))
  const made: Array<string> = []
  for (const statement of pending) {
    const id = statement.id!
    const result = yield* Effect.gen(function*() {
      const lines = yield* linesOf(sql, id)
      const file = yield* Effect.flatMap(
        Effect.service(Documents),
        (d) => d.render(statementHtml({ brand: ws!.legal ?? ws!.name, statement, lines }))
      )
      const key = `${ws!.id}/statements/${id}.${file.extension}`
      yield* Effect.flatMap(Effect.service(FileStore), (s) => s.put(key, file.bytes, file.mime))
      const fileId = mintId("fil")
      const name = `afrekening-${statement.month}-${slug(statement.supplierName)}.${file.extension}`
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by, scan_state)
                 values (${fileId}, ${ws!.id}, ${key}, ${name}, ${file.mime}, ${file.bytes.length}, 'document',
                         'supplier_statement', ${id}, 'system', 'clean')
                 on conflict (r2_key) do nothing`
      const [kept] = yield* sql<{ id: string }>`select id from files where r2_key = ${key}`
      yield* sql`update supplier_statements set invoice_file_id = ${kept!.id} where id = ${id}`
      return id
    }).pipe(
      Effect.catchTag(
        "DocumentNotMade",
        (e) => Effect.as(Effect.logWarning("statement document not made", { statement: id, reason: e.reason }), null)
      )
    )
    if (result !== null) made.push(result)
  }
  return made
})

const slug = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "leverancier"

/** The close's workspaces: those with a supplier. */
export const statementWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from statement_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/**
 * One workspace's close (`CurrentWorkspace`, as `system`): the statements written on one transaction, then their PDFs
 * on another, so a document that cannot be made never holds the statements back.
 */
export const closeWorkspace = Effect.fn("Statements.closeWorkspace")(function*(
  month: Month,
  options: { readonly early?: boolean } = {}
) {
  const db = yield* Db
  const outcome = yield* db.scopedFor((sql) => closeIn(sql, month, options))
  const documents = yield* db.scopedFor(renderPendingIn)
  return { ...outcome, documents: documents as ReadonlyArray<string> }
})
