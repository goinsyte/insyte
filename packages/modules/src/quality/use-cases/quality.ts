import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { QualityTickets } from "../domain/Ports.ts"
import {
  IllegalCheckMove,
  NoSupplier,
  QualityChange,
  type QualityCheckRow,
  QualityRestore,
  QualityStats,
  QualityView,
  type RejectInput,
  type RequestInput,
  type SetPhaseInput,
  type StatsInput,
  type StatsRow,
  SupplierLink
} from "../domain/Quality.ts"

/*
 * Product quality for the team (M9.4), inside the role's stores. Reading takes Producten · Bekijken; asking a supplier
 * for a check Producten · Bewerken; judging what came back `quality.approve`; the phase `products.phase`. Each change
 * has one undo token (`quality.restore`). Complaints are the returns whose reason counted for quality when they were
 * made, rejected ones aside, measured against the units sold in the same 90 days.
 */

export const RESTORE = "quality.restore"
const DAY_MS = 86_400_000
const DEFAULT_THRESHOLD_PCT = 5
/** How long the supplier's link stays good after the check's date. */
const LINK_DAYS = 30

type Phase = "test" | "active" | "watch" | "phased_out"

interface CheckRecord {
  readonly id: string
  readonly productId: string
  readonly supplierId: string
  readonly kind: QualityCheckRow["kind"]
  readonly variants: ReadonlyArray<string>
  readonly deliverables: ReadonlyArray<QualityCheckRow["deliverables"][number]>
  readonly dueAt: Date
  readonly status: QualityCheckRow["status"]
  readonly note: string
  readonly requestedAt: Date
  readonly requester: string | null
  readonly submittedAt: Date | null
  readonly submittedBy: string | null
  readonly batch: string | null
  readonly submissionNote: string | null
  readonly video: boolean
  readonly decidedAt: Date | null
  readonly decider: string | null
  readonly decisionNote: string | null
}

/** The name a member id, or the agent, reads as. */
const NAME_OF = (column: string) =>
  `coalesce(
  (select u.name from members m join auth."user" u on u.id = m.user_id where m.id = ${column}),
  case when ${column} = 'agent' then 'Insyte' else ${column} end)`

export const CHECK_SELECT = `q.id, q.product_id, q.supplier_id, q.kind, q.variants, q.deliverables, q.due_at, q.status,
  q.note, q.requested_at, ${NAME_OF("q.requested_by")} as requester, q.submitted_at, q.submitted_by, q.batch,
  q.submission_note, q.video, q.decided_at, ${NAME_OF("q.decided_by")} as decider, q.decision_note`

export const rowOf = (c: CheckRecord, media: ReadonlyArray<{ fileId: string; mime: string }>): QualityCheckRow => ({
  id: c.id,
  productId: c.productId,
  supplierId: c.supplierId,
  kind: c.kind,
  variants: c.variants,
  deliverables: c.deliverables,
  dueAt: c.dueAt.getTime(),
  status: c.status,
  requestedAt: c.requestedAt.getTime(),
  requestedBy: c.requester ?? "",
  note: c.note,
  submission: c.submittedAt === null ? null : {
    at: c.submittedAt.getTime(),
    by: c.submittedBy ?? "",
    photos: media.filter((m) => m.mime.startsWith("image/")).map((m) => `/api/files/${m.fileId}`),
    video: c.video,
    batch: c.batch,
    note: c.submissionNote
  },
  verdict: c.decidedAt === null
    ? null
    : { at: c.decidedAt.getTime(), by: c.decider ?? "", reason: c.decisionNote }
})

/** The product, inside the role's stores. */
const product = Effect.fn("Quality.product")(function*(sql: SqlClient.SqlClient, productId: string) {
  const scope = yield* inScope(sql, "p.store_id")
  const [found] = yield* sql<{ id: string }>`select p.id from products p where p.id = ${productId} and ${scope}`
  if (found === undefined) return yield* new NotFound({ entity: "product", id: productId })
  return found
})

const phaseOf = (sql: SqlClient.SqlClient, productId: string) =>
  Effect.map(
    sql<{ phase: Phase }>`select phase from product_phases where product_id = ${productId}`,
    ([row]) => row?.phase ?? null
  )

const writePhase = (sql: SqlClient.SqlClient, productId: string, phase: Phase | null, by: string) =>
  phase === null
    ? sql`delete from product_phases where product_id = ${productId}`
    : sql`insert into product_phases (workspace_id, product_id, phase, changed_by)
          values (app_workspace_id(), ${productId}, ${phase}, ${by})
          on conflict (product_id) do update set phase = excluded.phase, changed_by = excluded.changed_by,
                                                 changed_at = now()`

const audit = (
  sql: SqlClient.SqlClient,
  action: string,
  subjectType: string,
  id: string,
  diff?: Record<string, unknown>
) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) => Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, { action, subjectType, subjectId: id, diff })
  )

const answer = (
  sql: SqlClient.SqlClient,
  checkId: string | null,
  restore: QualityRestore,
  ticket?: { readonly id: string; readonly number: number }
) =>
  Effect.map(
    Undo.issue(sql, { command: RESTORE, compensation: restore }),
    (undo) => new QualityChange({ checkId, undo, ...(ticket === undefined ? {} : { ticket }) })
  )

export const list = Effect.fn("Quality.list")(function*(productId: string) {
  yield* Policy.require("products", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* product(sql, productId)
      const [supplier] = yield* sql<{ id: string; name: string }>`
        select s.id, s.name from product_supply ps join suppliers s on s.id = ps.supplier_id
        where ps.product_id = ${productId} and ps.is_primary`
      const [settings] = yield* sql<{ thresholdPct: string }>`select threshold_pct from quality_settings`
      const [sold] = yield* sql<{ n: number }>`
        select coalesce(sum(ol.quantity), 0)::int as n from order_lines ol join orders o on o.id = ol.order_id
        where ol.product_id = ${productId} and o.placed_at > now() - interval '90 days' and o.status <> 'cancelled'`
      const complaints = yield* sql<{
        id: string
        returnId: string
        at: Date
        text: string
        customer: string
        variant: string | null
      }>`
        select rl.id, r.id as return_id, r.created_at as at,
               coalesce(nullif(r.customer_note, ''), rr.label, r.reason_id) as text, r.customer_name as customer,
               nullif(ol.variant_title, 'Default Title') as variant
        from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
        left join return_reasons rr on rr.workspace_id = r.workspace_id and rr.id = r.reason_id
        where ol.product_id = ${productId} and r.quality and r.status <> 'rejected'
          and r.created_at > now() - interval '90 days'
        order by r.created_at desc, rl.id`
      const checks = yield* sql<CheckRecord>`
        select ${sql.literal(CHECK_SELECT)} from quality_checks q
        where q.product_id = ${productId} order by q.requested_at desc, q.id`
      const media = checks.length === 0 ? [] : yield* sql<{ checkId: string; fileId: string; mime: string }>`
        select m.check_id, m.file_id, f.mime from quality_check_media m join files f on f.id = m.file_id
        where m.check_id in ${sql.in(checks.map((c) => c.id))} order by m.position`
      const sizes = yield* sql<{ title: string }>`
        select title from variants where product_id = ${productId} and title <> 'Default Title'
        order by position, id`
      return new QualityView({
        productId,
        supplier: supplier ?? null,
        phase: (yield* phaseOf(sql, productId)) ?? "active",
        threshold: Number(settings?.thresholdPct ?? DEFAULT_THRESHOLD_PCT) / 100,
        sold90: sold?.n ?? 0,
        complaints: complaints.map((c) => ({ ...c, at: c.at.getTime() })),
        checks: checks.map((c) => rowOf(c, media.filter((m) => m.checkId === c.id))),
        sizes: [...new Set(sizes.map((s) => s.title))]
      })
    })
  )
})

/**
 * `Quality.stats`: the products list's Aandacht cuts, the product page's Retouren block and the suppliers' quality
 * columns. Per product, or summed per supplier: what its products (primary) sold and got back, and the checks asked of
 * it: those judged in the last 90 days, and those still running whenever they were asked. Only the role's stores
 * count; a product or supplier with nothing to say has no row.
 */
export const stats = Effect.fn("Quality.stats")(function*(input: typeof StatsInput.Type) {
  yield* Policy.require("products", 1)
  const db = yield* Db
  const bySupplier = input.bySupplier === true
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id")
      const one = sql.and([
        input.productId === undefined ? sql`true` : sql`p.id = ${input.productId}`,
        input.productIds === undefined
          ? sql`true`
          : input.productIds.length === 0
          ? sql`false`
          : sql`p.id in ${sql.in([...input.productIds])}`
      ])
      const [settings] = yield* sql<{ thresholdPct: string }>`select threshold_pct from quality_settings`
      const rows = yield* sql<StatsRow>`
        with mine as (
          select p.id, ps.supplier_id from products p
          left join product_supply ps on ps.product_id = p.id and ps.is_primary
          where ${scope} and ${one}
        ), sold as (
          select ol.product_id, sum(ol.quantity)::int as n from order_lines ol join orders o on o.id = ol.order_id
          where ol.product_id in (select id from mine) and o.placed_at > now() - interval '90 days'
            and o.status <> 'cancelled'
          group by ol.product_id
        ), back as (
          select ol.product_id, sum(rl.quantity)::int as returned, count(*) filter (where r.quality)::int as complaints,
                 count(*) filter (where r.quality and r.created_at > now() - interval '30 days')::int as recent
          from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
          where ol.product_id in (select id from mine) and r.status <> 'rejected'
            and r.created_at > now() - interval '90 days'
          group by ol.product_id
        ), figures as (
          select ${sql.literal(bySupplier ? "m.supplier_id" : "m.id")} as id, coalesce(sum(s.n), 0)::int as sold,
                 coalesce(sum(b.returned), 0)::int as returned, coalesce(sum(b.complaints), 0)::int as complaints,
                 coalesce(sum(b.recent), 0)::int as recent_complaints
          from mine m left join sold s on s.product_id = m.id left join back b on b.product_id = m.id
          group by 1
        ), checks as (
          select ${sql.literal(bySupplier ? "q.supplier_id" : "q.product_id")} as id,
                 count(*) filter (where q.status in ('requested', 'submitted'))::int as running,
                 count(*) filter (where q.status = 'approved' and q.decided_at > now() - interval '90 days')::int
                   as passed,
                 count(*) filter (where q.status in ('approved', 'rejected')
                                    and q.decided_at > now() - interval '90 days')::int as judged
          from quality_checks q where q.product_id in (select id from mine)
          group by 1
        )
        select coalesce(f.id, c.id) as id, coalesce(f.sold, 0) as sold, coalesce(f.returned, 0) as returned,
               coalesce(f.complaints, 0) as complaints, coalesce(f.recent_complaints, 0) as recent_complaints,
               coalesce(c.running, 0) as running, coalesce(c.passed, 0) as passed, coalesce(c.judged, 0) as judged
        from figures f full join checks c on c.id = f.id
        where coalesce(f.id, c.id) is not null
          and (coalesce(f.sold, 0) + coalesce(f.returned, 0) + coalesce(c.running, 0) + coalesce(c.judged, 0)) > 0
        order by 1`
      return new QualityStats({
        threshold: Number(settings?.thresholdPct ?? DEFAULT_THRESHOLD_PCT) / 100,
        rows
      })
    })
  )
})

/** "Controle aanvragen" / "Monster bestellen": the product's supplier is asked, by a date, for what is ticked. */
export const request = Effect.fn("Quality.request")(function*(input: typeof RequestInput.Type) {
  yield* Policy.require("products", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* product(sql, input.productId)
      const now = Date.now()
      if (input.dueAt < now || input.dueAt > now + 60 * DAY_MS) {
        return yield* new Invalid({ fields: { dueAt: "range" } })
      }
      const [supplier] = yield* sql<{ id: string; name: string }>`
        select s.id, s.name from product_supply ps join suppliers s on s.id = ps.supplier_id
        where ps.product_id = ${input.productId} and ps.is_primary`
      if (supplier === undefined) return yield* new NoSupplier()
      const id = mintId("qc")
      yield* sql`
        insert into quality_checks (id, workspace_id, product_id, supplier_id, kind, variants, deliverables, due_at,
                                    note, requested_by)
        values (${id}, ${principal.workspaceId}, ${input.productId}, ${supplier.id}, ${input.kind},
                ${[...new Set(input.variants.map((v) => v.trim()).filter((v) => v !== ""))]}::text[],
                ${[...new Set(input.deliverables)]}::text[], ${new Date(input.dueAt)}, ${input.note?.trim() ?? ""},
                ${principal.id})`
      yield* audit(sql, "quality_check.requested", "quality_check", id, {
        productId: input.productId,
        supplierId: supplier.id,
        kind: input.kind
      })
      return yield* answer(sql, id, { kind: "requested", id })
    })
  )
})

const locked = Effect.fn("Quality.lock")(function*(sql: SqlClient.SqlClient, id: string) {
  const scope = yield* inScope(sql, "p.store_id")
  const [check] = yield* sql<{ id: string; productId: string; status: QualityCheckRow["status"] }>`
    select q.id, q.product_id, q.status from quality_checks q join products p on p.id = q.product_id
    where q.id = ${id} and ${scope} for update of q`
  if (check === undefined) return yield* new NotFound({ entity: "quality_check", id })
  return check
})

/** "Goedkeuren": what came back is good. */
export const approve = Effect.fn("Quality.approve")(function*(id: string) {
  yield* Policy.requireAction("quality.approve")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const check = yield* locked(sql, id)
      if (check.status !== "submitted") return yield* new IllegalCheckMove({ id, from: check.status, move: "approve" })
      yield* sql`update quality_checks set status = 'approved', decided_at = now(), decided_by = ${principal.id},
                                         decision_note = null where id = ${id}`
      yield* audit(sql, "quality_check.approved", "quality_check", id)
      return yield* answer(sql, id, { kind: "judged", id, phase: null })
    })
  )
})

/**
 * "Afkeuren": with a reason the supplier acts on, the product under watch if asked, and a ticket with the supplier on
 * the board if asked (Klantenservice · Bewerken), in the product's store. One Undo takes all of it back.
 */
export const reject = Effect.fn("Quality.reject")(function*(input: typeof RejectInput.Type) {
  yield* Policy.requireAction("quality.approve")
  if (input.watch) yield* Policy.requireAction("products.phase")
  if (input.ticket === true) yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const check = yield* locked(sql, input.id)
      if (check.status !== "submitted") {
        return yield* new IllegalCheckMove({ id: input.id, from: check.status, move: "reject" })
      }
      yield* sql`update quality_checks set status = 'rejected', decided_at = now(), decided_by = ${principal.id},
                                         decision_note = ${input.note.trim()} where id = ${input.id}`
      yield* audit(sql, "quality_check.rejected", "quality_check", input.id, { watch: input.watch })
      const before = yield* phaseOf(sql, check.productId)
      const watching = input.watch && before !== "watch"
      if (watching) {
        yield* writePhase(sql, check.productId, "watch", principal.id)
        yield* audit(sql, "product.phase_changed", "product", check.productId, {
          from: before ?? "active",
          to: "watch"
        })
      }
      const ticket = input.ticket === true ? yield* ticketFor(sql, input.id, input.note.trim()) : undefined
      return yield* answer(sql, input.id, {
        kind: "judged",
        id: input.id,
        phase: watching ? { productId: check.productId, phase: before } : null,
        ...(ticket === undefined ? {} : { ticketId: ticket.id })
      }, ticket)
    })
  )
})

/** The rejection's ticket with the supplier, as the design words it: high, labelled Kwaliteit and Leverancier. */
const ticketFor = Effect.fn("Quality.ticketFor")(function*(sql: SqlClient.SqlClient, id: string, reason: string) {
  const [c] = yield* sql<{ title: string; storeId: string; supplier: string }>`
    select p.title, p.store_id, s.name as supplier from quality_checks q join products p on p.id = q.product_id
    join suppliers s on s.id = q.supplier_id where q.id = ${id}`
  return yield* (yield* QualityTickets).make(sql, {
    title: `${c!.title}: controle afgekeurd bij ${c!.supplier}`.slice(0, 200),
    description: reason,
    storeId: c!.storeId
  })
})

/** The product's phase: Test, Actief, Onder toezicht, Uitgefaseerd. */
export const setPhase = Effect.fn("Quality.setPhase")(function*(input: typeof SetPhaseInput.Type) {
  yield* Policy.requireAction("products.phase")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* product(sql, input.productId)
      const before = yield* phaseOf(sql, input.productId)
      yield* writePhase(sql, input.productId, input.phase, principal.id)
      yield* audit(sql, "product.phase_changed", "product", input.productId, {
        from: before ?? "active",
        to: input.phase
      })
      return yield* answer(sql, null, { kind: "phase", productId: input.productId, phase: before })
    })
  )
})

/**
 * The link the supplier answers the check through (M9.4, until the partner portal): the check's id and a sealed token
 * naming it, good until thirty days after its date. The team copies it; the mail sends it once mail is set up.
 */
export const link = Effect.fn("Quality.link")(function*(id: string) {
  yield* Policy.require("products", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const [check] = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id")
      return yield* sql<{ id: string; dueAt: Date }>`
        select q.id, q.due_at from quality_checks q join products p on p.id = q.product_id
        where q.id = ${id} and ${scope}`
    })
  )
  if (check === undefined) return yield* new NotFound({ entity: "quality_check", id })
  const expires = Math.max(check.dueAt.getTime(), Date.now()) + LINK_DAYS * DAY_MS
  const { sealed } = yield* Effect.flatMap(
    Effect.service(Sealer),
    (s) => s.seal(JSON.stringify({ w: principal.workspaceId, c: id, x: expires }))
  )
  return new SupplierLink({ path: `/kwaliteit/${id}?k=${encodeURIComponent(sealed)}` })
})

const decodeRestore = Schema.decodeUnknownEffect(QualityRestore)

/** `Shared.undo` for `quality.restore`: the check or the phase as it was. */
export const restore = Effect.fn("Quality.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const principal = yield* CurrentPrincipal
  const r = yield* decodeRestore(compensation).pipe(Effect.orDie)
  if (r.kind === "requested") {
    const gone = yield* sql`delete from quality_checks where id = ${r.id} and status = 'requested' returning id`
    if (gone.length === 0) return yield* new Conflict({ entity: "quality_check", reason: "answered" })
    yield* audit(sql, "quality_check.cancelled", "quality_check", r.id)
    return
  }
  if (r.kind === "judged") {
    const back = yield* sql`
      update quality_checks set status = 'submitted', decided_at = null, decided_by = null, decision_note = null
      where id = ${r.id} and status in ('approved', 'rejected') returning id`
    if (back.length === 0) return yield* new Conflict({ entity: "quality_check", reason: "answered" })
    yield* audit(sql, "quality_check.reopened", "quality_check", r.id)
    if (r.phase !== null) yield* writePhase(sql, r.phase.productId, r.phase.phase, principal.id)
    if (r.ticketId !== undefined) yield* (yield* QualityTickets).remove(sql, r.ticketId)
    return
  }
  yield* writePhase(sql, r.productId, r.phase, principal.id)
  yield* audit(sql, "product.phase_changed", "product", r.productId, { to: r.phase ?? "active" })
})
