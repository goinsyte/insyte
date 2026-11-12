import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { likePattern } from "../../shared/domain/Search.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  ChargebackDetail,
  type ChargebackEvent,
  ChargebackList,
  ChargebackRow,
  ChargebackStats,
  type ChargebackTab,
  type EvidenceItem,
  type ListInput
} from "../domain/Chargebacks.ts"
import { PROVIDER_NAME } from "../domain/Rules.ts"

/*
 * `Chargebacks.list`, `.get`, `.stats` and `.nextCaseNumber` (M13 step 3), at Chargebacks · Bekijken (the next number
 * at Bewerken, as only the dialog asks for it). A case about an order is in that order's store, so a role fenced to
 * stores reads only its own; one opened by hand without an order is the whole team's.
 */

const SELECT = `c.id, c.case_number, c.provider, c.provider_dispute_id, c.status, c.reason, c.reason_code,
  c.amount_minor, c.currency, c.customer_id, coalesce(cu.name, c.customer_name) as customer_name, c.order_id,
  o.number as order_number, c.store_id, c.deadline_at, c.opened_at, c.submitted_at, c.outcome_at, c.note,
  c.updated_at,
  (select count(*)::int from evidence_items e where e.chargeback_id = c.id and e.removed_at is null) as evidence_count`

const FROM = `chargebacks c left join orders o on o.id = c.order_id left join customers cu on cu.id = c.customer_id`

interface Row {
  readonly id: string
  readonly caseNumber: string
  readonly provider: ChargebackRow["provider"]
  readonly providerDisputeId: string | null
  readonly status: ChargebackRow["status"]
  readonly reason: ChargebackRow["reason"]
  readonly reasonCode: string
  readonly amountMinor: string
  readonly currency: string
  readonly customerId: string | null
  readonly customerName: string
  readonly orderId: string | null
  readonly orderNumber: string | null
  readonly storeId: string | null
  readonly deadlineAt: Date
  readonly openedAt: Date
  readonly submittedAt: Date | null
  readonly outcomeAt: Date | null
  readonly note: string
  readonly updatedAt: Date
  readonly evidenceCount: number
}

const ms = (d: Date | null) => d?.getTime() ?? null

const toRow = (r: Row) =>
  new ChargebackRow({
    id: r.id,
    caseNumber: r.caseNumber,
    provider: r.provider,
    fromProvider: r.providerDisputeId !== null,
    status: r.status,
    reason: r.reason,
    reasonCode: r.reasonCode,
    amountMinor: Number(r.amountMinor),
    currency: r.currency.trim(),
    customerId: r.customerId,
    customerName: r.customerName,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    storeId: r.storeId,
    deadlineAt: r.deadlineAt.getTime(),
    openedAt: r.openedAt.getTime(),
    submittedAt: ms(r.submittedAt),
    outcomeAt: ms(r.outcomeAt),
    note: r.note,
    evidenceCount: r.evidenceCount,
    updatedAt: r.updatedAt.getTime()
  })

/** The role's stores, as a condition on `c`: a case without a store is everyone's. */
export const caseScope = Effect.fn("Chargebacks.scope")(function*(sql: SqlClient.SqlClient) {
  const scope = yield* inScope(sql, "c.store_id")
  return sql`(c.store_id is null or ${scope})`
})

const tabCondition = (sql: SqlClient.SqlClient, tab: ChargebackTab) =>
  tab === "action_required" ? sql`c.status in ('open', 'awaiting_evidence')` : sql`c.status = ${tab}`

/** The cases, nearest deadline first. */
export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0
    ? Effect.succeed([] as Array<ChargebackRow>)
    : Effect.map(
      sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
               where c.id in ${sql.in([...ids])} order by c.deadline_at, c.id`,
      (rows) => rows.map(toRow)
    )

const statsOf = Effect.fn("Chargebacks.statsOf")(function*(sql: SqlClient.SqlClient) {
  const scope = yield* caseScope(sql)
  const [w] = yield* sql<{ currency: string }>`select currency from workspaces where id = app_workspace_id()`
  const currency = (w?.currency ?? "EUR").trim()
  const [row] = yield* sql<{ open: number; won: number; decided: number; recovered: string }>`
    select count(*) filter (where c.status in ('open', 'awaiting_evidence'))::int as open,
           count(*) filter (where c.status = 'won')::int as won,
           count(*) filter (where c.status in ('won', 'lost'))::int as decided,
           coalesce(sum(c.amount_minor) filter (where c.status = 'won' and c.currency = ${currency}), 0)::bigint
             as recovered
    from chargebacks c where ${scope}`
  const won = row?.won ?? 0
  const decided = row?.decided ?? 0
  return new ChargebackStats({
    open: row?.open ?? 0,
    won,
    decided,
    wonPct: decided === 0 ? 0 : Math.round((won / decided) * 100),
    recoveredMinor: Number(row?.recovered ?? 0),
    currency
  })
})

export const countsOf = Effect.fn("Chargebacks.countsOf")(function*(sql: SqlClient.SqlClient) {
  const scope = yield* caseScope(sql)
  const [row] = yield* sql<{ all: number; actionRequired: number; submitted: number; won: number; lost: number }>`
    select count(*)::int as "all",
           count(*) filter (where c.status in ('open', 'awaiting_evidence'))::int as action_required,
           count(*) filter (where c.status = 'submitted')::int as submitted,
           count(*) filter (where c.status = 'won')::int as won,
           count(*) filter (where c.status = 'lost')::int as lost
    from chargebacks c where ${scope}`
  return {
    all: row?.all ?? 0,
    actionRequired: row?.actionRequired ?? 0,
    submitted: row?.submitted ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0
  }
})

export const list = Effect.fn("Chargebacks.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("chargebacks", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* caseScope(sql)
      const q = input.q?.trim() ?? ""
      const pattern = likePattern(q)
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
        where ${scope}
          and ${input.tab === undefined ? sql`true` : tabCondition(sql, input.tab)}
          and ${input.provider === undefined ? sql`true` : sql`c.provider = ${input.provider}`}
          and ${
        q === ""
          ? sql`true`
          : sql`(c.case_number ilike ${pattern} or coalesce(cu.name, c.customer_name) ilike ${pattern})`
      }
        order by c.deadline_at, c.id
        limit ${input.limit ?? 500}`
      return new ChargebackList({ rows: rows.map(toRow), counts: yield* countsOf(sql), stats: yield* statsOf(sql) })
    })
  )
})

/** The area panel's counts alone, for the frame (ADR-0028). */
export const counts = Effect.fn("Chargebacks.panelCounts")(function*() {
  yield* Policy.require("chargebacks", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => countsOf(sql))
})

export const stats = Effect.fn("Chargebacks.stats")(function*() {
  yield* Policy.require("chargebacks", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => statsOf(sql))
})

interface EvidenceRow {
  readonly id: string
  readonly kind: EvidenceItem["kind"]
  readonly source: EvidenceItem["source"]
  readonly name: string
  readonly sizeBytes: string
  readonly fileId: string | null
  readonly mime: string | null
  readonly createdAt: Date
}

export const evidenceOf = (sql: SqlClient.SqlClient, chargebackId: string) =>
  Effect.map(
    sql<EvidenceRow>`
      select e.id, e.kind, e.source, e.name, e.size_bytes, e.file_id, f.mime, e.created_at
      from evidence_items e left join files f on f.id = e.file_id and f.deleted_at is null
      where e.chargeback_id = ${chargebackId} and e.removed_at is null
      order by e.position, e.created_at, e.id`,
    (rows) =>
      rows.map((r): EvidenceItem => ({
        id: r.id,
        kind: r.kind,
        source: r.source,
        name: r.name,
        sizeBytes: Number(r.sizeBytes),
        fileId: r.fileId,
        mime: r.mime,
        addedAt: r.createdAt.getTime()
      }))
  )

interface EventRow {
  readonly id: string
  readonly at: Date
  readonly kind: ChargebackEvent["kind"]
  readonly actorKind: string
  readonly actorId: string | null
  readonly actorName: string | null
  readonly data: string
}

/** The timeline, oldest first, with who did each thing by the name the case shows. */
export const timelineOf = (sql: SqlClient.SqlClient, chargebackId: string, provider: ChargebackRow["provider"]) =>
  Effect.map(
    sql<EventRow>`
      select ev.id, ev.at, ev.kind, ev.actor_kind, ev.actor_id, coalesce(u.name, ak.label) as actor_name,
             ev.data::text as data
      from chargeback_events ev
      left join members m on ev.actor_kind = 'member' and m.id = ev.actor_id
      left join auth."user" u on u.id = m.user_id
      left join api_keys ak on ev.actor_kind in ('api_key', 'agent') and ak.id = ev.actor_id
      where ev.chargeback_id = ${chargebackId}
      order by ev.at, ev.id limit 500`,
    (rows) =>
      rows.map((r): ChargebackEvent => ({
        id: r.id,
        at: r.at.getTime(),
        kind: r.kind,
        actor: {
          kind: r.actorKind,
          id: r.actorId,
          name: r.actorKind === "provider" ? PROVIDER_NAME[provider] : r.actorName ?? "Insyte"
        },
        // Read as text: the SQL client camelCases the keys of a json value.
        data: JSON.parse(r.data) as Record<string, unknown>
      }))
  )

export const get = Effect.fn("Chargebacks.get")(function*(id: string) {
  yield* Policy.require("chargebacks", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* caseScope(sql)
      const [row] = yield* sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
                                    where c.id = ${id} and ${scope}`
      if (row === undefined) return yield* new NotFound({ entity: "chargeback", id })
      return new ChargebackDetail({
        chargeback: toRow(row),
        evidence: yield* evidenceOf(sql, id),
        timeline: yield* timelineOf(sql, id, row.provider),
        stats: yield* statsOf(sql)
      })
    })
  )
})

/** The number the next case opened by hand gets, without taking it: `DSP-n`, past any the team typed that way. */
const peekNumber = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ n: string }>`
      select greatest(
        coalesce((select next from workspace_counters where kind = 'chargeback'), 1),
        coalesce((select max(substring(case_number from '^DSP-(\\d{1,12})$')::bigint) + 1 from chargebacks
                  where case_number ~ '^DSP-\\d{1,12}$'), 1)
      ) as n`,
    ([row]) => Number(row?.n ?? 1)
  )

export const nextCaseNumber = Effect.fn("Chargebacks.nextCaseNumber")(function*() {
  yield* Policy.require("chargebacks", 2)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.map(peekNumber(sql), (n) => ({ caseNumber: `DSP-${n}` })))
})
