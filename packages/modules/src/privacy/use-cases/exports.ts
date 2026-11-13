import { Db } from "@insyte/database/Db"
import { TENANT_TABLES, type TenantTable } from "@insyte/database/Tenancy"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Config, Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore, type UploadedPart } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { cut, type Row, toCsv, withoutSecrets, zipEnd, zipEntry, type ZipRecord } from "../domain/Archive.ts"
import type { RequestMade, SetExportSchedule } from "../domain/Privacy.ts"
import { requireOwner } from "./reads.ts"

/*
 * The workspace export (M17 step 5; security.md §6 "Workspace export"): everything the workspace holds, each table
 * as CSV and as JSON in one ZIP, for the owner only. Asking writes a `gdpr_requests` row (`workspace_export`) and
 * starts its run; the run's steps are below, as `system` in the workspace: plan the parts and begin the file, then
 * each table a page at a time (keyset over its primary key), each page deflated into the ZIP as it goes and the ZIP
 * sent to the bucket in parts (R2 multipart), so no step holds more than a page and a part; then the ZIP's directory,
 * the file the request owns, and the asker told. The file can be downloaded for 7 days, then the daily sweep removes
 * it. A shopper's access package (`shoppers.ts`) runs through the same steps with its own parts.
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
      insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, requested_by, state, attempts,
                                 started_at)
      values (${id}, ${workspaceId}, 'workspace_export', ${source}, '{}'::jsonb, now() + interval '30 days',
              ${by}, 'open', 1, now())`
    const outboxId = yield* Outbox.write(sql, workspaceId, {
      type: "privacy.export_requested",
      workspaceId,
      userId: by ?? "system",
      requestId: id,
      attempt: 1
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
  readonly attempts: number
  readonly subject: string | null
  readonly customerId: string | null
  readonly customerShopifyId: string | null
  readonly storeId: string | null
  readonly stores: ReadonlyArray<string> | null
}

/** Where a request's files are kept: under the workspace, so its purge finds them by prefix. */
export const requestPrefix = (workspaceId: string, requestId: string) => `${workspaceId}/privacy/${requestId}/`

/** The ZIP as it is being written, carried from step to step: small, so the run keeps it as a step's answer. */
export interface Stream {
  /** The attempt's folder: the archive, and the bytes carried between steps (`carry/<n>`). */
  readonly dir: string
  readonly key: string
  readonly uploadId: string
  readonly madeAt: number
  /** The archive's bytes so far, sent and carried. */
  readonly offset: number
  readonly nextPart: number
  /** The carry object the next step reads (`carry/<carry>`), and how many bytes it holds (none: nothing to read). */
  readonly carry: number
  readonly carried: number
}

/** Where a table's next page starts: the last row's primary key, as `to_jsonb` gave it. */
export type Cursor = Readonly<Record<string, string | number | boolean | null>> | null

/** What a page step answers: its rows, where the next page starts (null: the part is done), and what it sent. */
export interface Paged {
  readonly rows: number
  readonly cursor: Cursor
  readonly stream: Stream
  readonly records: ReadonlyArray<ZipRecord>
  readonly uploaded: ReadonlyArray<UploadedPart>
}

/**
 * The shopper's rows, by the customers the request is about (`$1`, already held to the stores the asker's role
 * reached), the address it names (`$2`, null when there is none) and those stores (`$3`, null for all).
 */
const BY_ORDER = `(select o.id from orders o where o.customer_id = any($1::text[])
  or ($2::text is not null and lower(o.customer_email) = $2 and ($3::text[] is null or o.store_id = any($3))))`
const BY_RETURN = `(select r.id from returns r where r.customer_id = any($1::text[]) or r.order_id in ${BY_ORDER}
  or ($2::text is not null and lower(r.customer_email) = $2 and ($3::text[] is null or r.store_id = any($3))))`
const BY_TICKET = `(select k.id from tickets k where k.customer_id = any($1::text[]) or k.order_id in ${BY_ORDER})`
const BY_THREAD = `(select h.id from email_threads h where h.customer_id = any($1::text[])
  or ($2::text is not null and $3::text[] is null and strpos(lower(h.participants::text), $2) > 0))`
const SHOPPER_PARTS: ReadonlyArray<readonly [string, string]> = [
  ["customers", "select to_jsonb(t)::text as row from customers t where t.id = any($1::text[])"],
  ["orders", `select to_jsonb(t)::text as row from orders t where t.id in ${BY_ORDER}`],
  ["order_lines", `select to_jsonb(t)::text as row from order_lines t where t.order_id in ${BY_ORDER}`],
  ["fulfilments", `select to_jsonb(t)::text as row from fulfilments t where t.order_id in ${BY_ORDER}`],
  ["refunds", `select to_jsonb(t)::text as row from refunds t where t.order_id in ${BY_ORDER}`],
  ["order_notes", `select to_jsonb(t)::text as row from order_notes t where t.order_id in ${BY_ORDER}`],
  ["order_mails", `select to_jsonb(t)::text as row from order_mails t where t.order_id in ${BY_ORDER}`],
  ["returns", `select to_jsonb(t)::text as row from returns t where t.id in ${BY_RETURN}`],
  ["return_lines", `select to_jsonb(t)::text as row from return_lines t where t.return_id in ${BY_RETURN}`],
  ["return_events", `select to_jsonb(t)::text as row from return_events t where t.return_id in ${BY_RETURN}`],
  ["tickets", `select to_jsonb(t)::text as row from tickets t where t.id in ${BY_TICKET}`],
  ["ticket_comments", `select to_jsonb(t)::text as row from ticket_comments t where t.ticket_id in ${BY_TICKET}`],
  ["email_threads", `select to_jsonb(t)::text as row from email_threads t where t.id in ${BY_THREAD}`],
  ["email_messages", `select to_jsonb(t)::text as row from email_messages t where t.thread_id in ${BY_THREAD}`],
  [
    "chargebacks",
    `select to_jsonb(t)::text as row from chargebacks t where t.customer_id = any($1::text[])
       or t.order_id in ${BY_ORDER}`
  ]
]

/**
 * The customers a shopper request is about, within the stores the asker's role reached: the one it names, every
 * customer with its address, the Shopify customer it names, and the duplicates merged into any of them.
 */
const shopperIds = (sql: SqlClient.SqlClient, planned: Planned) =>
  Effect.map(
    sql.unsafe<{ id: string }>(
      `with named as (
         select id from customers
         where (id = $1 or ($2::text is not null and lower(email) = $2) or (shopify_id = $3 and store_id = $4))
           and ($5::text[] is null or store_id = any($5)))
       select id from named
       union select c.id from customers c join named n on c.merged_into = n.id
        where $5::text[] is null or c.store_id = any($5)`,
      [
        planned.customerId,
        planned.subject === null || planned.subject === "" ? null : planned.subject.toLowerCase(),
        planned.customerShopifyId,
        planned.storeId,
        planned.stores === null ? null : [...planned.stores]
      ]
    ),
    (rows) => rows.map((r) => r.id)
  )

const load = (sql: SqlClient.SqlClient, requestId: string) =>
  Effect.map(
    sql<Planned>`
      select kind, state, attempts, subject, customer_id, customer_shopify_id, store_id, stores
      from gdpr_requests where id = ${requestId}`,
    (rows) => rows[0]
  )

/**
 * Which parts the request's file is made of, and the file begun; null when this attempt is no longer the request's
 * (asked again, already made, stopped).
 */
export const planExport = Effect.fn("Privacy.export.plan")(function*(requestId: string, attempt: number) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  const planned = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const planned = yield* load(sql, requestId)
      if (
        planned === undefined || planned.attempts !== attempt ||
        (planned.state !== "open" && planned.state !== "running")
      ) return undefined
      yield* sql`update gdpr_requests set state = 'running', error = null where id = ${requestId}`
      return planned
    })
  )
  if (planned === undefined) return null
  const dir = `${requestPrefix(ws.id, requestId)}${attempt}/`
  const key = `${dir}archive.zip`
  const uploadId = yield* files.begin(key, "application/zip")
  const stream: Stream = { dir, key, uploadId, madeAt: Date.now(), offset: 0, nextPart: 1, carry: 0, carried: 0 }
  const parts = planned.kind === "workspace_export" ? [...WORKSPACE_PARTS] : SHOPPER_PARTS.map(([part]) => part)
  return { parts, stream }
})

/** Entries written at the stream's end, sent in whole parts, the rest carried to the next step. */
const append = (stream: Stream, entries: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array }>) =>
  Effect.gen(function*() {
    const at = new Date(stream.madeAt)
    const written: Array<Uint8Array> = []
    const records: Array<ZipRecord> = []
    let offset = stream.offset
    for (const entry of entries) {
      const one = yield* Effect.promise(() => zipEntry(entry, offset, at))
      written.push(one.bytes)
      records.push(one.record)
      offset += one.bytes.length
    }
    const sent = yield* send(stream, written, false)
    return { records, uploaded: sent.uploaded, stream: { ...sent.stream, offset } }
  })

/** The carried bytes and `bytes`, sent as whole parts; at the end, the rest as the last part too. */
const send = (stream: Stream, bytes: ReadonlyArray<Uint8Array>, last: boolean) =>
  Effect.gen(function*() {
    const files = yield* FileStore
    const carried = stream.carried === 0
      ? new Uint8Array()
      : (yield* files.get(`${stream.dir}carry/${stream.carry}`))?.bytes
    if (carried === undefined) return yield* Effect.die(new Error(`privacy export: carry ${stream.carry} is gone`))
    const { parts, rest } = cut(carried, bytes)
    const out = last && rest.length > 0 ? [...parts, rest] : parts
    const uploaded: Array<UploadedPart> = []
    for (const [i, part] of out.entries()) {
      uploaded.push(yield* files.putPart(stream.key, stream.uploadId, stream.nextPart + i, part))
    }
    // A new carry object each step, so a step tried again reads what its first try read.
    const next = stream.carry + 1
    const carry = last ? 0 : rest.length
    if (carry > 0) yield* files.put(`${stream.dir}carry/${next}`, rest, "application/octet-stream")
    return { uploaded, stream: { ...stream, nextPart: stream.nextPart + out.length, carry: next, carried: carry } }
  })

const entryName = (part: string, page: number, ext: "csv" | "json") =>
  `${ext}/${part}${page === 1 ? "" : `-${String(page).padStart(4, "0")}`}.${ext}`

/** One page of a part: its rows, without secrets, deflated into the ZIP as JSON and CSV. */
export const exportPage = Effect.fn("Privacy.export.page")(
  function*(
    requestId: string,
    input: { readonly part: string; readonly page: number; readonly cursor: Cursor; readonly stream: Stream }
  ) {
    const db = yield* Db
    const limit = yield* Config.Int("PRIVACY_EXPORT_PAGE_ROWS").pipe(Config.withDefault(1000), Effect.orDie)
    const read = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const planned = yield* load(sql, requestId)
        if (planned === undefined) return { texts: [], keys: [] as ReadonlyArray<string> }
        return planned.kind === "workspace_export"
          ? yield* workspacePage(sql, input.part, input.cursor, limit)
          : { texts: yield* shopperRows(sql, planned, input.part), keys: [] as ReadonlyArray<string> }
      })
    )
    const raw = read.texts.map((t) => JSON.parse(t.row) as Row)
    const rows = raw.map(withoutSecrets)
    const more = read.keys.length > 0 && raw.length === limit
    const cursor: Cursor = more
      ? Object.fromEntries(read.keys.map((k) => [k, raw[raw.length - 1]![k] as string | number | boolean | null]))
      : null
    // A last page with nothing on it (the rows ended on a page's edge) adds no files.
    const entries = rows.length === 0 && input.page > 1 ? [] : [
      { name: entryName(input.part, input.page, "csv"), bytes: new TextEncoder().encode(toCsv(rows)) },
      {
        name: entryName(input.part, input.page, "json"),
        bytes: new TextEncoder().encode(JSON.stringify(rows, null, 2))
      }
    ]
    const appended = yield* append(input.stream, entries)
    return { rows: rows.length, cursor, ...appended } satisfies Paged
  }
)

const ident = (name: string) => `"${name.replaceAll("\"", "\"\"")}"`

/** A table's page after `cursor`, in its primary key's order; a table without one, whole. */
const workspacePage = (sql: SqlClient.SqlClient, part: string, cursor: Cursor, limit: number) =>
  Effect.gen(function*() {
    if (part === "workspaces") {
      const texts = yield* sql<{ row: string }>`
        select to_jsonb(t)::text as row from workspaces t where t.id = app_workspace_id()`
      return { texts, keys: [] as ReadonlyArray<string> }
    }
    // Only a name from the catalogue reaches the statement.
    if (!(EXPORTED as ReadonlyArray<string>).includes(part)) return { texts: [], keys: [] as ReadonlyArray<string> }
    const keys = (yield* sql<{ name: string }>`
      select a.attname as name from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ${part}::regclass and i.indisprimary
      order by array_position(i.indkey::int2[], a.attnum)`).map((k) => k.name)
    if (keys.length === 0) {
      return { texts: yield* sql.unsafe<{ row: string }>(`select to_jsonb(t)::text as row from ${part} t`), keys }
    }
    const t = keys.map((k) => `t.${ident(k)}`).join(", ")
    const c = keys.map((k) => `c.${ident(k)}`).join(", ")
    const texts = yield* sql.unsafe<{ row: string }>(
      `select to_jsonb(t)::text as row from ${part} t
       where $1::jsonb is null or (${t}) > (select ${c} from jsonb_populate_record(null::${part}, $1::jsonb) c)
       order by ${t} limit $2`,
      [cursor === null ? null : JSON.stringify(cursor), limit]
    )
    return { texts, keys }
  })

const shopperRows = (sql: SqlClient.SqlClient, planned: Planned, part: string) =>
  Effect.gen(function*() {
    const statement = SHOPPER_PARTS.find(([p]) => p === part)?.[1]
    if (statement === undefined) return []
    const ids = yield* shopperIds(sql, planned)
    const email = planned.subject === null || planned.subject === "" ? null : planned.subject.toLowerCase()
    // A statement is given only the parameters it reads: Postgres types every one it is given.
    const params: Array<unknown> = [ids]
    if (statement.includes("$2")) params.push(email)
    if (statement.includes("$3")) params.push(planned.stores === null ? null : [...planned.stores])
    return yield* sql.unsafe<{ row: string }>(statement, params)
  })

const README = (
  kind: string,
  counts: Readonly<Record<string, number>>,
  pages: Readonly<Record<string, number>>,
  at: Date
) =>
  [
    kind === "workspace_export" ? "Export van je werkruimte in Insyte" : "Gegevens van één klant in Insyte",
    `Gemaakt op ${at.toISOString()}.`,
    "",
    "Elke tabel staat er twee keer in: als CSV (te openen in een spreadsheet) en als JSON.",
    "Een grote tabel is in delen opgeslagen: orders.csv, orders-0002.csv, enzovoort.",
    "Sleutels en wachtwoorden van gekoppelde diensten staan er niet in.",
    "",
    ...Object.entries(counts).map(([part, n]) =>
      `${part}: ${n} ${n === 1 ? "rij" : "rijen"}${(pages[part] ?? 1) > 1 ? ` in ${pages[part]} delen` : ""}`
    ),
    ""
  ].join("\r\n")

/**
 * The ZIP finished (its read-me, manifest and directory, the last part sent, the upload completed), owned by the
 * request as a file, the request ready, and whoever asked told. Answers the file's id; null when this attempt is no
 * longer the request's.
 */
export const finishExport = Effect.fn("Privacy.export.finish")(function*(
  requestId: string,
  input: {
    readonly counts: Readonly<Record<string, number>>
    readonly pages: Readonly<Record<string, number>>
    readonly stream: Stream
    readonly records: ReadonlyArray<ZipRecord>
    readonly uploaded: ReadonlyArray<UploadedPart>
  }
) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  const planned = yield* db.scopedFor((sql) => load(sql, requestId))
  if (planned === undefined || planned.state !== "running") return null
  const at = new Date(input.stream.madeAt)
  const encoder = new TextEncoder()
  const tail = yield* append(input.stream, [
    { name: "LEESMIJ.txt", bytes: encoder.encode(README(planned.kind, input.counts, input.pages, at)) },
    {
      name: "manifest.json",
      bytes: encoder.encode(
        JSON.stringify({ kind: planned.kind, madeAt: at.toISOString(), counts: input.counts }, null, 2)
      )
    }
  ])
  const end = zipEnd([...input.records, ...tail.records], tail.stream.offset, at)
  const last = yield* send(tail.stream, [end], true)
  yield* files.complete(input.stream.key, input.stream.uploadId, [
    ...input.uploaded,
    ...tail.uploaded,
    ...last.uploaded
  ])
  const size = tail.stream.offset + end.length
  const fileId = mintId("fil")
  const name = planned.kind === "workspace_export"
    ? `insyte-export-${at.toISOString().slice(0, 10)}.zip`
    : `insyte-klantgegevens-${at.toISOString().slice(0, 10)}.zip`
  const done = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [still] = yield* sql<{ requestedBy: string | null }>`
        select requested_by from gdpr_requests where id = ${requestId} and state = 'running' for update`
      if (still === undefined) return null
      // An earlier package of the same request goes: the newest answers it.
      const earlier = yield* sql<{ key: string }>`
        update files set deleted_at = now()
        where owner_type = 'gdpr_request' and owner_id = ${requestId} and deleted_at is null
        returning r2_key as key`
      yield* sql`
        insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, scan_state)
        values (${fileId}, ${ws.id}, ${input.stream.key}, ${name}, 'application/zip', ${size}, 'export',
                'gdpr_request', ${requestId}, 'clean')`
      yield* sql`
        update gdpr_requests set state = 'ready', file_id = ${fileId}, completed_at = now(), files_removed_at = null
        where id = ${requestId}`
      yield* Audit.write(sql, ws.id, { kind: "system", id: "system" }, {
        action: planned.kind === "workspace_export" ? "workspace.export_ready" : "customer.data_exported",
        subjectType: "gdpr_request",
        subjectId: requestId,
        diff: { rows: Object.values(input.counts).reduce((n, c) => n + c, 0), bytes: size }
      })
      const outboxId = yield* Outbox.write(sql, ws.id, {
        type: "privacy.export_ready",
        workspaceId: ws.id,
        userId: still.requestedBy ?? "system",
        requestId
      })
      return { outboxId, earlier: earlier.map((e) => e.key).filter((k) => k !== input.stream.key) }
    })
  )
  yield* files.removePrefix(`${input.stream.dir}carry/`)
  if (done === null) return null
  yield* files.remove(done.earlier)
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([done.outboxId]))
  return fileId
})

/** The run gave up: the request says so and can be asked for again; what the attempt had written goes. */
export const failExport = Effect.fn("Privacy.export.fail")(
  function*(requestId: string, attempt: number, error: string, stream: Stream | null) {
    const db = yield* Db
    const files = yield* FileStore
    yield* db.scopedFor((sql) =>
      sql`update gdpr_requests set state = 'failed', error = ${error.slice(0, 500)}
          where id = ${requestId} and attempts = ${attempt} and state in ('open', 'running')`
    )
    if (stream !== null) {
      yield* files.abandon(stream.key, stream.uploadId)
      yield* files.removePrefix(stream.dir)
    }
  }
)

/* ── the daily sweep ──────────────────────────────────────────────────────────────────────────── */

/** The requests whose files are due to go, across workspaces: past their 7 days, failed, or stalled for a day. */
export const expiredFiles = Effect.flatMap(
  Effect.service(Db),
  (db) =>
    db.routing((sql) =>
      sql<{ workspaceId: WorkspaceId; requestId: string }>`
      select workspace_id, request_id from privacy_files_expired()`
    )
)

/**
 * A request's files gone from the bucket, its `files` rows marked deleted, and the request marked as swept; one that
 * stalled is failed, so it can be asked for again. As `system` in the request's workspace.
 */
export const removeFiles = Effect.fn("Privacy.removeFiles")(function*(requestId: string) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  yield* files.removePrefix(requestPrefix(ws.id, requestId))
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update files set deleted_at = coalesce(deleted_at, now())
                 where owner_type = 'gdpr_request' and owner_id = ${requestId}`
      yield* sql`update gdpr_requests set files_removed_at = now(),
                   state = case when state in ('open', 'running') then 'failed' else state end,
                   error = case when state in ('open', 'running') then 'stalled' else error end
                 where id = ${requestId}`
    })
  )
})
