import { Db } from "@insyte/database/Db"
import { TENANT_TABLES, type TenantTable } from "@insyte/database/Tenancy"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type Row, toCsv, withoutSecrets, zip, type ZipEntry } from "../domain/Archive.ts"
import type { RequestMade, SetExportSchedule } from "../domain/Privacy.ts"
import { requireOwner } from "./reads.ts"

/*
 * The workspace export (M17 step 5; security.md §6 "Workspace export"): everything the workspace holds, each table
 * as CSV and as JSON in one ZIP, for the owner only. Asking writes a `gdpr_requests` row (`workspace_export`) and
 * starts its run; the run's steps are below, as `system` in the workspace: plan the parts, write each part to the
 * bucket, then zip them into one file the request owns, and tell the asker. The file can be downloaded for 7 days.
 * A shopper's access package (`shoppers.ts`) runs through the same steps with its own parts.
 *
 * What is left out, and why, is `EXCLUDED`: every tenant table is either exported or named there, so a table added
 * later is a failing test until someone decides. Columns that hold a secret or its hash never leave (`withoutSecrets`).
 */

/** Tenant tables not in the export: secrets, or the machinery that runs requests, which holds nothing of the business. */
export const EXCLUDED: Readonly<Partial<Record<TenantTable, string>>> = {
  connection_credentials: "the stores' and services' tokens, sealed",
  oauth_states: "a connect in progress, for minutes",
  idempotency_keys: "replies kept to answer a retried request once",
  undo_tokens: "undo windows of seconds",
  outbox: "events on their way to the sinks",
  inbound_events: "webhooks as received, applied to the tables that are exported",
  push_subscriptions: "a browser's push address and keys",
  sync_cursors: "where an import left off",
  fact_dirty_days: "days the figures still have to be counted again"
}

/** The tenant tables an export holds, in the catalogue's order. */
export const EXPORTED: ReadonlyArray<TenantTable> = TENANT_TABLES.filter((t) => !(t in EXCLUDED))

/** The parts of a workspace export: the workspace's own row, then each table. */
const WORKSPACE_PARTS: ReadonlyArray<string> = ["workspaces", ...EXPORTED]

/** "Alles exporteren": one export at a time; a second ask while one is being made is that one. */
export const requestExport = Effect.fn("Workspaces.requestExport")(function*() {
  const principal = yield* requireOwner()
  const db = yield* Db
  const { id, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [running] = yield* sql<{ id: string }>`
        select id from gdpr_requests where kind = 'workspace_export' and state in ('open', 'running')
          and received_at > now() - interval '1 hour'`
      if (running !== undefined) return { id: running.id, outboxId: null }
      const made = yield* open(sql, principal.workspaceId, "operator", principal.id)
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.export_requested",
        subjectType: "gdpr_request",
        subjectId: made.id
      })
      return made
    })
  )
  if (outboxId !== null) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
  return { id } satisfies RequestMade
})

const open = (sql: SqlClient.SqlClient, workspaceId: string, source: "operator" | "insyte", by: string | null) =>
  Effect.gen(function*() {
    const id = mintId("gdpr")
    yield* sql`
      insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, requested_by, state)
      values (${id}, ${workspaceId}, 'workspace_export', ${source}, '{}'::jsonb, now() + interval '30 days',
              ${by}, 'open')`
    const outboxId = yield* Outbox.write(sql, workspaceId, {
      type: "privacy.export_requested",
      workspaceId,
      userId: by ?? "system",
      requestId: id
    })
    return { id, outboxId }
  })

/** "Automatisch exporteren": weekly, monthly or not. The owner's, like the export itself. */
export const setSchedule = Effect.fn("Privacy.setExportSchedule")(function*(input: SetExportSchedule) {
  const principal = yield* requireOwner()
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* sql<{ exportSchedule: string }>`
        select export_schedule from workspaces where id = ${principal.workspaceId} for update`
      if (before === undefined || before.exportSchedule === input.schedule) return
      yield* sql`update workspaces set export_schedule = ${input.schedule} where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.export_schedule_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        section: "data",
        diff: { from: before.exportSchedule, to: input.schedule }
      })
    })
  )
  return { schedule: input.schedule }
})

/** The workspaces whose scheduled export is due, read before any workspace is in scope. */
export const dueExports = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from privacy_exports_due()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** A scheduled export, as `system` in the workspace: the owner hears of it when it is ready. */
export const scheduleExport = Effect.fn("Privacy.scheduleExport")(function*() {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const { outboxId } = yield* db.scopedFor((sql) => open(sql, ws.id, "insyte", null))
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
})

/* ── the run's steps ──────────────────────────────────────────────────────────────────────────── */

interface Planned {
  readonly kind: string
  readonly state: string
  readonly subject: string | null
  readonly customerId: string | null
  readonly customerShopifyId: string | null
  readonly storeId: string | null
}

const partKey = (workspaceId: string, requestId: string, part: string, ext: "json" | "csv") =>
  `privacy/${workspaceId}/${requestId}/parts/${part}.${ext}`

/** The shopper's rows, by the customers the request is about (`ids`) and the address it names (`email`). */
const SHOPPER_PARTS: ReadonlyArray<readonly [string, string]> = [
  ["customers", "select to_jsonb(t)::text as row from customers t where t.id = any($1::text[])"],
  [
    "orders",
    "select to_jsonb(t)::text as row from orders t where t.customer_id = any($1::text[]) or lower(t.customer_email) = $2::text"
  ],
  [
    "order_lines",
    "select to_jsonb(t)::text as row from order_lines t where t.order_id in (select o.id from orders o where o.customer_id = any($1::text[]) or lower(o.customer_email) = $2::text)"
  ],
  [
    "fulfilments",
    "select to_jsonb(t)::text as row from fulfilments t where t.order_id in (select o.id from orders o where o.customer_id = any($1::text[]) or lower(o.customer_email) = $2::text)"
  ],
  [
    "refunds",
    "select to_jsonb(t)::text as row from refunds t where t.order_id in (select o.id from orders o where o.customer_id = any($1::text[]) or lower(o.customer_email) = $2::text)"
  ],
  [
    "returns",
    "select to_jsonb(t)::text as row from returns t where t.customer_id = any($1::text[]) or lower(t.customer_email) = $2::text"
  ],
  [
    "return_lines",
    "select to_jsonb(t)::text as row from return_lines t where t.return_id in (select r.id from returns r where r.customer_id = any($1::text[]) or lower(r.customer_email) = $2::text)"
  ],
  ["tickets", "select to_jsonb(t)::text as row from tickets t where t.customer_id = any($1::text[])"],
  [
    "ticket_comments",
    "select to_jsonb(t)::text as row from ticket_comments t where t.ticket_id in (select k.id from tickets k where k.customer_id = any($1::text[]))"
  ],
  ["email_threads", "select to_jsonb(t)::text as row from email_threads t where t.customer_id = any($1::text[])"],
  [
    "email_messages",
    "select to_jsonb(t)::text as row from email_messages t where t.thread_id in (select h.id from email_threads h where h.customer_id = any($1::text[]))"
  ],
  ["chargebacks", "select to_jsonb(t)::text as row from chargebacks t where t.customer_id = any($1::text[])"]
]

/** The customers a shopper request is about: the one it names, and every customer with its address. */
const shopperIds = (sql: SqlClient.SqlClient, planned: Planned) =>
  Effect.map(
    sql<{ id: string }>`
      select id from customers
      where id = ${planned.customerId ?? ""}
         or (${planned.subject ?? ""} <> '' and lower(email) = lower(${planned.subject ?? ""}))
         or (shopify_id = ${planned.customerShopifyId ?? ""} and store_id = ${planned.storeId ?? ""})`,
    (rows) => rows.map((r) => r.id)
  )

const load = (sql: SqlClient.SqlClient, requestId: string) =>
  Effect.map(
    sql<Planned>`
      select kind, state, subject, customer_id, customer_shopify_id, store_id
      from gdpr_requests where id = ${requestId}`,
    (rows) => rows[0]
  )

/** Which parts the request's file is made of; none when it is no longer open (asked twice, already made). */
export const planExport = Effect.fn("Privacy.export.plan")(function*(requestId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const planned = yield* load(sql, requestId)
      if (planned === undefined || (planned.state !== "open" && planned.state !== "running")) return []
      yield* sql`update gdpr_requests set state = 'running', error = null where id = ${requestId}`
      return planned.kind === "workspace_export" ? [...WORKSPACE_PARTS] : SHOPPER_PARTS.map(([part]) => part)
    })
  )
})

/** One part: its rows, written to the bucket as JSON and CSV. Answers how many rows it holds. */
export const writePart = Effect.fn("Privacy.export.part")(function*(requestId: string, part: string) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  const rows = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const planned = yield* load(sql, requestId)
      if (planned === undefined) return []
      const texts = planned.kind === "workspace_export"
        ? yield* workspaceRows(sql, part)
        : yield* shopperRows(sql, planned, part)
      return texts.map((t) => withoutSecrets(JSON.parse(t.row) as Row))
    })
  )
  const encoder = new TextEncoder()
  yield* files.put(
    partKey(ws.id, requestId, part, "json"),
    encoder.encode(JSON.stringify(rows, null, 2)),
    "application/json"
  )
  yield* files.put(partKey(ws.id, requestId, part, "csv"), encoder.encode(toCsv(rows)), "text/csv")
  return rows.length
})

const workspaceRows = (sql: SqlClient.SqlClient, part: string) => {
  if (part === "workspaces") {
    return sql<{ row: string }>`select to_jsonb(t)::text as row from workspaces t where t.id = app_workspace_id()`
  }
  // Only a name from the catalogue reaches the statement.
  if (!(EXPORTED as ReadonlyArray<string>).includes(part)) return Effect.succeed([])
  return sql.unsafe<{ row: string }>(`select to_jsonb(t)::text as row from ${part} t`)
}

const shopperRows = (sql: SqlClient.SqlClient, planned: Planned, part: string) =>
  Effect.gen(function*() {
    const statement = SHOPPER_PARTS.find(([p]) => p === part)?.[1]
    if (statement === undefined) return []
    const ids = yield* shopperIds(sql, planned)
    const email = (planned.subject ?? "").toLowerCase()
    // A statement takes the address only when it reads it: Postgres types every parameter it is given.
    const params = statement.includes("$2") ? [ids, email === "" ? "\u0000" : email] : [ids]
    return yield* sql.unsafe<{ row: string }>(statement, params)
  })

const README = (kind: string, counts: Readonly<Record<string, number>>, at: Date) =>
  [
    kind === "workspace_export" ? "Export van je werkruimte in Insyte" : "Gegevens van één klant in Insyte",
    `Gemaakt op ${at.toISOString()}.`,
    "",
    "Elke tabel staat er twee keer in: als CSV (te openen in een spreadsheet) en als JSON.",
    "Sleutels en wachtwoorden van gekoppelde diensten staan er niet in.",
    "",
    ...Object.entries(counts).map(([part, n]) => `${part}: ${n} ${n === 1 ? "rij" : "rijen"}`),
    ""
  ].join("\r\n")

/**
 * The parts as one ZIP the request owns, the parts removed after, the request ready, and whoever asked told. Answers
 * the file's id.
 */
export const finishExport = Effect.fn("Privacy.export.finish")(
  function*(requestId: string, counts: Readonly<Record<string, number>>) {
    const ws = yield* CurrentWorkspace
    const db = yield* Db
    const files = yield* FileStore
    const planned = yield* db.scopedFor((sql) => load(sql, requestId))
    if (planned === undefined || planned.state !== "running") return null
    const parts = Object.keys(counts)
    const entries: Array<ZipEntry> = []
    const at = new Date()
    entries.push({ name: "LEESMIJ.txt", bytes: new TextEncoder().encode(README(planned.kind, counts, at)) })
    entries.push({
      name: "manifest.json",
      bytes: new TextEncoder().encode(JSON.stringify({ kind: planned.kind, madeAt: at.toISOString(), counts }, null, 2))
    })
    for (const part of parts) {
      for (const ext of ["csv", "json"] as const) {
        const stored = yield* files.get(partKey(ws.id, requestId, part, ext))
        if (stored !== undefined) entries.push({ name: `${ext}/${part}.${ext}`, bytes: stored.bytes })
      }
    }
    const archive = yield* Effect.promise(() => zip(entries, at))
    const key = `privacy/${ws.id}/${requestId}/${requestId}.zip`
    yield* files.put(key, archive, "application/zip")
    const fileId = mintId("fil")
    const name = planned.kind === "workspace_export"
      ? `insyte-export-${at.toISOString().slice(0, 10)}.zip`
      : `insyte-klantgegevens-${at.toISOString().slice(0, 10)}.zip`
    const outboxId = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [still] = yield* sql<{ requestedBy: string | null }>`
          select requested_by from gdpr_requests where id = ${requestId} and state = 'running' for update`
        if (still === undefined) return null
        yield* sql`
          insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, scan_state)
          values (${fileId}, ${ws.id}, ${key}, ${name}, 'application/zip', ${archive.length}, 'export',
                  'gdpr_request', ${requestId}, 'clean')`
        yield* sql`
          update gdpr_requests set state = 'ready', file_id = ${fileId}, completed_at = now() where id = ${requestId}`
        yield* Audit.write(sql, ws.id, { kind: "system", id: "system" }, {
          action: planned.kind === "workspace_export" ? "workspace.export_ready" : "customer.data_exported",
          subjectType: "gdpr_request",
          subjectId: requestId,
          diff: { rows: Object.values(counts).reduce((n, c) => n + c, 0), bytes: archive.length }
        })
        return yield* Outbox.write(sql, ws.id, {
          type: "privacy.export_ready",
          workspaceId: ws.id,
          userId: still.requestedBy ?? "system",
          requestId
        })
      })
    )
    yield* files.remove(
      parts.flatMap((p) => [partKey(ws.id, requestId, p, "csv"), partKey(ws.id, requestId, p, "json")])
    )
    if (outboxId !== null) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
    return fileId
  }
)

/** The run gave up: the request says so and can be asked for again. */
export const failExport = Effect.fn("Privacy.export.fail")(function*(requestId: string, error: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update gdpr_requests set state = 'failed', error = ${error.slice(0, 500)}
        where id = ${requestId} and state in ('open', 'running')`
  )
})
