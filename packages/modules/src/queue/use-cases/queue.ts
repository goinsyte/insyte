import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { AREA_IDS, canRole } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Proposals from "../../proposals/Proposals.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type ListInput,
  QueueChange,
  QueueItemClosed,
  type QueueKind,
  QueueList,
  QueueRestore,
  type QueueRow,
  type Signal
} from "../domain/Queue.ts"

/*
 * The queue on Start (M10.1). Not a rule per event: the refresh works out, from the records as they are, which
 * conditions hold (an order delayed, a return in review, a quality check sent in, a variant sold out, a store without
 * its link) and keeps one unresolved row per condition by its `dedupe_key`: a new condition opens a row, a held one is
 * brought up to date (title, signal, value, due), an ended one resolves. Seen stays seen while the condition holds;
 * when it ends and comes back, it is a new row. Every member may open Start; the rows narrow to the areas and stores the
 * role may open, and the counts with them.
 */

export const RESTORE = "queue.restore"
const HOUR_MS = 3_600_000
const DECIDED_DAYS = 1
/** The kinds a plate is drawn for (M10.2). */
const PLATED: ReadonlySet<string> = new Set(["return_review", "quality_review"])

interface Desired {
  readonly kind: QueueKind
  readonly area: string
  readonly subjectType: string
  readonly subjectId: string
  readonly storeId: string | null
  readonly dedupeKey: string
  readonly signal: Signal
  readonly title: string
  readonly valueMinor: number | null
  readonly currency: string | null
  readonly dueAt: Date | null
}

/** How soon it needs the operator: within hours (or past) is red, within the day amber, later green. */
export const signalOf = (dueAt: Date | null, otherwise: Signal, now = Date.now()): Signal => {
  if (dueAt === null) return otherwise
  const left = dueAt.getTime() - now
  return left <= 4 * HOUR_MS ? "red" : left <= 24 * HOUR_MS ? "amber" : "green"
}

/** The conditions that hold now, in the workspace the transaction is scoped to. */
const desired = Effect.fn("Queue.desired")(function*(sql: SqlClient.SqlClient) {
  const out: Array<Desired> = []
  const delayed = yield* sql<
    { id: string; number: string; storeId: string; totalMinor: string; currency: string; customerName: string }
  >`
    select id, number, store_id, total_minor, currency, customer_name from orders
    where delayed_at is not null and status in ('paid', 'at_supplier', 'shipped')`
  for (const o of delayed) {
    out.push({
      kind: "order_delayed",
      area: "orders",
      subjectType: "order",
      subjectId: o.id,
      storeId: o.storeId,
      dedupeKey: `order_delayed:${o.id}`,
      signal: "red",
      title: `Bestelling ${o.number} is vertraagd${o.customerName ? ` · ${o.customerName}` : ""}`,
      valueMinor: Number(o.totalMinor),
      currency: o.currency,
      dueAt: null
    })
  }
  const reviews = yield* sql<{
    id: string
    number: string
    type: "return" | "claim"
    storeId: string
    customerName: string
    currency: string
    amountMinor: string
    reviewDeadline: Date
  }>`
    select r.id, r.number, r.type, r.store_id, r.customer_name, r.currency, r.review_deadline,
           (select coalesce(sum(rl.quantity * ol.unit_price_minor), 0) from return_lines rl
              join order_lines ol on ol.id = rl.order_line_id where rl.return_id = r.id)::bigint as amount_minor
    from returns r where r.status = 'review'`
  for (const r of reviews) {
    out.push({
      kind: "return_review",
      area: "returns",
      subjectType: "return",
      subjectId: r.id,
      storeId: r.storeId,
      dedupeKey: `return_review:${r.id}`,
      signal: signalOf(r.reviewDeadline, "amber"),
      title: `${r.type === "claim" ? "Claim" : "Retour"} ${r.number} wacht op beoordeling${
        r.customerName ? ` · ${r.customerName}` : ""
      }`,
      valueMinor: Number(r.amountMinor),
      currency: r.currency,
      dueAt: r.reviewDeadline
    })
  }
  const checks = yield* sql<{ id: string; storeId: string; product: string; supplier: string }>`
    select q.id, p.store_id, p.title as product, s.name as supplier
    from quality_checks q join products p on p.id = q.product_id join suppliers s on s.id = q.supplier_id
    where q.status = 'submitted'`
  for (const c of checks) {
    out.push({
      kind: "quality_review",
      area: "products",
      subjectType: "quality_check",
      subjectId: c.id,
      storeId: c.storeId,
      dedupeKey: `quality_review:${c.id}`,
      signal: "amber",
      title: `Kwaliteitscontrole ${c.product} ingestuurd door ${c.supplier}`,
      valueMinor: null,
      currency: null,
      dueAt: null
    })
  }
  const soldOut = yield* sql<
    { variantId: string; productId: string; storeId: string; product: string; variant: string }
  >`
    select s.variant_id, s.product_id, s.store_id, p.title as product, v.title as variant
    from stockouts s join products p on p.id = s.product_id join variants v on v.id = s.variant_id
    where s.to_at is null and p.status = 'active'`
  for (const s of soldOut) {
    out.push({
      kind: "stock_out",
      area: "products",
      subjectType: "product",
      subjectId: s.productId,
      storeId: s.storeId,
      dedupeKey: `stock_out:${s.variantId}`,
      signal: "amber",
      title: `${s.product}${s.variant === "Default Title" ? "" : ` · ${s.variant}`} is uitverkocht`,
      valueMinor: null,
      currency: null,
      dueAt: null
    })
  }
  const stores = yield* sql<{ id: string; name: string }>`
    select id, name from stores where status in ('disconnected', 'action_required')`
  for (const s of stores) {
    out.push({
      kind: "store_disconnected",
      area: "settings",
      subjectType: "store",
      subjectId: s.id,
      storeId: s.id,
      dedupeKey: `store_disconnected:${s.id}`,
      signal: "red",
      title: `Winkel ${s.name} is niet meer gekoppeld`,
      valueMinor: null,
      currency: null,
      dueAt: null
    })
  }
  return out
})

/**
 * Brings the workspace's queue in line with its records (the transaction's workspace). Answers whether anything
 * changed, so the caller tells the open tabs only then.
 */
export const refresh = Effect.fn("Queue.refresh")(function*(sql: SqlClient.SqlClient) {
  const want = yield* desired(sql)
  const live = yield* sql<
    { id: string; dedupeKey: string; signal: Signal; title: string; valueMinor: string | null; dueAt: Date | null }
  >`
    select id, dedupe_key, signal, title, value_minor, due_at from queue_items where resolved_at is null`
  const byKey = new Map(live.map((l) => [l.dedupeKey, l]))
  const wanted = new Set(want.map((w) => w.dedupeKey))
  let changed = false
  for (const w of want) {
    const held = byKey.get(w.dedupeKey)
    if (held === undefined) {
      yield* sql`
        insert into queue_items (id, workspace_id, kind, area, subject_type, subject_id, store_id, dedupe_key, signal,
                                 title, value_minor, currency, due_at)
        values (${mintId("qi")}, app_workspace_id(), ${w.kind}, ${w.area}, ${w.subjectType}, ${w.subjectId},
                ${w.storeId}, ${w.dedupeKey}, ${w.signal}, ${w.title}, ${w.valueMinor}, ${w.currency}, ${w.dueAt})
        on conflict do nothing`
      changed = true
      continue
    }
    const same = held.signal === w.signal && held.title === w.title &&
      (held.valueMinor === null ? null : Number(held.valueMinor)) === w.valueMinor &&
      (held.dueAt?.getTime() ?? null) === (w.dueAt?.getTime() ?? null)
    if (same) continue
    yield* sql`update queue_items set signal = ${w.signal}, title = ${w.title}, value_minor = ${w.valueMinor},
                                      currency = ${w.currency}, due_at = ${w.dueAt}, updated_at = now()
               where id = ${held.id}`
    changed = true
  }
  const ended = live.filter((l) => !wanted.has(l.dedupeKey)).map((l) => l.id)
  if (ended.length > 0) {
    yield* sql`update queue_items set state = 'resolved', resolved_at = now(), updated_at = now()
               where id in ${sql.in(ended)}`
    changed = true
  }
  // The plates (M10.2): drawn for the live rows the proposer knows, superseded where their row or rule ended. Only a
  // return or a quality check carries one, and rows resolve only here: a workspace with neither, where nothing ended,
  // has no plate to draw or set aside, and the sweep skips the queries for it.
  if (ended.length === 0 && !want.some((w) => PLATED.has(w.kind))) return changed
  const drawable = yield* sql<{ id: string; kind: string; subjectId: string }>`
    select id, kind, subject_id from queue_items where resolved_at is null`
  if (
    yield* Proposals.drawIn(sql, drawable.map((d) => ({ queueItemId: d.id, kind: d.kind, subjectId: d.subjectId })))
  ) {
    changed = true
  }
  const linked = yield* sql`
    update queue_items q set proposal_id = o.id, updated_at = now()
    from queue_items x left join proposals o on o.queue_item_id = x.id and o.state = 'open'
    where x.id = q.id and q.resolved_at is null and q.proposal_id is distinct from o.id
    returning q.id`
  if (linked.length > 0) changed = true
  return changed
})

interface Row {
  readonly id: string
  readonly kind: QueueKind
  readonly subjectType: string
  readonly subjectId: string
  readonly storeName: string | null
  readonly signal: Signal
  readonly title: string
  readonly valueMinor: string | null
  readonly currency: string | null
  readonly dueAt: Date | null
  readonly state: QueueRow["state"]
  readonly proposalId: string | null
  readonly decidedAt: Date | null
}

const SELECT = `q.id, q.kind, q.subject_type, q.subject_id, s.name as store_name, q.signal, q.title, q.value_minor,
  q.currency, q.due_at, q.state, q.proposal_id, q.decided_at`

const rowOf = (r: Row, plates: ReadonlyMap<string, QueueRow["proposal"] & {}> = new Map()): QueueRow => ({
  ...r,
  valueMinor: r.valueMinor === null ? null : Number(r.valueMinor),
  dueAt: r.dueAt?.getTime() ?? null,
  decidedAt: r.decidedAt?.getTime() ?? null,
  proposal: r.state === "open" ? plates.get(r.id) ?? null : null
})

/** An open plate drawn for the row: the "Getekend" tab. */
const DRAWN = `exists (select 1 from proposals p where p.queue_item_id = q.id and p.state = 'open')`

/** What the role may open: the areas it holds at Bekijken, and its stores (a row for every store is everyone's). */
const visible = Effect.fn("Queue.visible")(function*(sql: SqlClient.SqlClient) {
  const { role } = yield* CurrentPrincipal
  const plain = { ...role, stores: role.stores === "all" ? ("all" as const) : [...role.stores] }
  const areas = AREA_IDS.filter((a) => canRole(plain, a, 1))
  const stores = role.stores === "all" ? sql`true` : sql`(q.store_id is null or q.store_id = any(${[...role.stores]}))`
  return sql.and([sql`q.area = any(${areas})`, stores])
})

/** Rank: the signal, then how soon, then the value. */
const RANK = `case q.signal when 'red' then 0 when 'amber' then 1 when 'green' then 2 else 3 end,
  q.due_at asc nulls last, q.value_minor desc nulls last, q.created_at`

export const list = Effect.fn("Queue.list")(function*(input: typeof ListInput.Type) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* visible(sql)
      const recent =
        sql`(q.state = 'open' or (q.state = 'seen' and q.decided_at > now() - make_interval(days => ${DECIDED_DAYS})))`
      const tab = input.tab ?? "needs_you"
      const where = tab === "needs_you"
        ? sql`q.state = 'open' and q.signal in ('red', 'amber')`
        : tab === "drawn"
        ? sql`q.state = 'open' and ${sql.literal(DRAWN)}`
        : recent
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from queue_items q left join stores s on s.id = q.store_id
        where q.resolved_at is null and ${scope} and ${where}
        order by q.state = 'open' desc, ${sql.literal(RANK)} limit ${input.limit ?? 200}`
      const [counts] = yield* sql<{ needsYou: number; drawn: number; all: number }>`
        select count(*) filter (where q.state = 'open' and q.signal in ('red', 'amber'))::int as needs_you,
               count(*) filter (where q.state = 'open' and ${sql.literal(DRAWN)})::int as drawn,
               count(*) filter (where ${recent})::int as all
        from queue_items q where q.resolved_at is null and ${scope}`
      const plates = yield* Proposals.openFor(sql, rows.filter((r) => r.state === "open").map((r) => r.id))
      return new QueueList({
        rows: rows.map((r) => rowOf(r, plates)),
        counts: counts ?? { needsYou: 0, drawn: 0, all: 0 }
      })
    })
  )
})

const one = Effect.fn("Queue.one")(function*(sql: SqlClient.SqlClient, id: string, lock: boolean) {
  const scope = yield* visible(sql)
  const [row] = yield* sql<Row & { decidedBy: string | null }>`
    select ${sql.literal(SELECT)}, q.decided_by from queue_items q left join stores s on s.id = q.store_id
    where q.id = ${id} and q.resolved_at is null and ${scope} ${lock ? sql`for update of q` : sql``}`
  if (row === undefined) return yield* new NotFound({ entity: "queue_item", id })
  return row
})

const move = (to: "seen" | "open", action: string) =>
  Effect.fn(`Queue.${to === "seen" ? "markSeen" : "reopen"}`)(function*(id: string) {
    const principal = yield* CurrentPrincipal
    const db = yield* Db
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const before = yield* one(sql, id, true)
        if (before.state === to) return yield* new QueueItemClosed({ id })
        yield* sql`update queue_items set state = ${to}, decided_by = ${to === "seen" ? principal.id : null},
                                          decided_at = ${to === "seen" ? new Date() : null}, updated_at = now()
                   where id = ${id}`
        // "Negeren" on a plate is the row seen with its plate set aside; opening the row again brings the plate back.
        if (to === "seen") yield* Proposals.discardIn(sql, id)
        else yield* Proposals.reopenIn(sql, id)
        yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
          action,
          subjectType: "queue_item",
          subjectId: id
        })
        const undo = yield* Undo.issue(sql, {
          command: RESTORE,
          compensation: {
            id,
            state: before.state,
            decidedBy: before.decidedBy,
            decidedAt: before.decidedAt?.getTime() ?? null
          } satisfies typeof QueueRestore.Type
        })
        const after = yield* one(sql, id, false)
        return new QueueChange({ row: rowOf(after, yield* Proposals.openFor(sql, [id])), undo })
      })
    )
  })

/** "Markeren als gezien": the operator saw it; it leaves "Wacht op jou" and stays seen while its condition lasts. */
export const markSeen = move("seen", "queue_item.seen")

/** Back to open, for a row seen by mistake. */
export const reopen = move("open", "queue_item.reopened")

const decodeRestore = Schema.decodeUnknownEffect(QueueRestore)

/** `Shared.undo` for `queue.restore`: the row's state as it was, while it is unresolved. */
export const restore = Effect.fn("Queue.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const r = yield* decodeRestore(compensation).pipe(Effect.orDie)
  const back = yield* sql`
    update queue_items set state = ${r.state}, decided_by = ${r.decidedBy},
           decided_at = ${r.decidedAt === null ? null : new Date(r.decidedAt)}, updated_at = now()
    where id = ${r.id} and resolved_at is null returning id`
  if (back.length === 0) return yield* new Conflict({ entity: "queue_item", reason: "gone" })
  if (r.state === "open") yield* Proposals.reopenIn(sql, r.id)
})
