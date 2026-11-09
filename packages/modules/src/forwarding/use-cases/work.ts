import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Option, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"

/*
 * Supplier work (M8.3; domain.md §12.2) and what a supplier's own API tells Insyte (`POST /hooks/supplier/:id`, signed
 * with the secret Insyte generated for it, `Insyte-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`, within five
 * minutes). A leg that reached its supplier has a work row; the supplier accepts it, reports a problem (a stock or
 * address problem puts the leg in error, in the supplier's words; a new date moves the deadline), or ships it (only its
 * lines go to Shopify, with the tracking). It can also report its stock per SKU.
 */

/** The supplier's work for these legs, made when they reach it: the deadline is the order's time plus the longest
 * lead time of the leg's lines (the supplier's default where it has none for a product), at its 17:00. */
export const ensureWork = (sql: SqlClient.SqlClient, legIds: ReadonlyArray<string>) =>
  legIds.length === 0 ? Effect.void : Effect.asVoid(sql`
    insert into supplier_work (workspace_id, order_id, supplier_id, handoff_by)
    select f.workspace_id, f.order_id, f.supplier_id,
           ((date_trunc('day', o.placed_at at time zone s.timezone)
             + make_interval(days => coalesce(
                 (select max(ps.lead_days) from order_lines l
                  join product_supply ps on ps.product_id = l.product_id and ps.supplier_id = f.supplier_id
                  where l.id = any(f.line_ids)),
                 s.default_lead_days))
             + interval '17 hours') at time zone s.timezone)
    from forwarding_items f join orders o on o.id = f.order_id join suppliers s on s.id = f.supplier_id
    where f.id in ${sql.in([...legIds])} and f.supplier_id is not null
    on conflict (order_id, supplier_id) do nothing`)

/** What a supplier's API sends. */
export const SupplierEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("order.accepted"), leg_id: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("order.problem"),
    leg_id: Schema.String,
    kind: Schema.Literals(["stock", "delay", "address", "damaged", "other"]),
    note: Schema.optional(Schema.String.check(Schema.isMaxLength(1000))),
    /** A new hand-off date, `YYYY-MM-DD`. */
    new_date: Schema.optional(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)))
  }),
  Schema.Struct({
    type: Schema.Literal("order.shipped"),
    leg_id: Schema.String,
    carrier: Schema.optional(Schema.String.check(Schema.isMaxLength(100))),
    tracking_number: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    tracking_url: Schema.optional(Schema.String.check(Schema.isMaxLength(2000)))
  }),
  Schema.Struct({
    type: Schema.Literal("stock.updated"),
    items: Schema.Array(Schema.Struct({ sku: Schema.String, available: Schema.Int })).check(Schema.isMaxLength(5000))
  })
])
export type SupplierEvent = typeof SupplierEvent.Type

/** An answer to the supplier's request: its status and a small JSON body. */
export interface Answer {
  readonly status: 200 | 400 | 401 | 404 | 409 | 422
  readonly body: Record<string, unknown>
}

const answer = (status: Answer["status"], body: Record<string, unknown>): Answer => ({ status, body })

const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** Whether `header` signs `body` with `secret`, made within five minutes of `now`. */
export const signed = async (secret: string, header: string, body: Uint8Array, now = Date.now()) => {
  const parts = header.split(",").map((p) => p.trim().split("="))
  const t = Number(parts.find(([k]) => k === "t")?.[1])
  const given = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "")
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || given.length === 0) return false
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const signedPart = new Uint8Array([...encoder.encode(`${t}.`), ...body])
  const expected = hex(await crypto.subtle.sign("HMAC", key, signedPart))
  // The same time for every comparison: no early exit on the first difference.
  return given.some((v) => {
    if (v.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

interface Leg {
  readonly id: string
  readonly orderId: string
  readonly state: string
  readonly lineIds: ReadonlyArray<string>
  readonly timezone: string
}

const lockLeg = (sql: SqlClient.SqlClient, supplierId: string, legId: string) =>
  Effect.map(
    sql<Leg>`
      select f.id, f.order_id, f.state, f.line_ids, s.timezone
      from forwarding_items f join suppliers s on s.id = f.supplier_id
      where f.id = ${legId} and f.supplier_id = ${supplierId} and f.state <> 'cancelled'
      for update of f`,
    (rows) => Option.fromNullishOr(rows[0])
  )

const audit = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  supplierId: string,
  action: string,
  orderId: string,
  diff: Record<string, unknown>
) =>
  Audit.write(sql, workspaceId, { kind: "system", id: `supplier:${supplierId}` }, {
    action,
    subjectType: "order",
    subjectId: orderId,
    diff
  })

/** The supplier has it: the leg confirmed, its work accepted, and the order at its suppliers once every leg is. */
const accept = (sql: SqlClient.SqlClient, supplierId: string, leg: Leg) =>
  Effect.all([
    sql`update forwarding_items set state = 'confirmed', since = now(), confirmed_at = now(),
          confirmed_by = ${`supplier:${supplierId}`}
        where id = ${leg.id} and state in ('sending', 'awaiting', 'error')`,
    sql`update supplier_work set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, 'supplier'),
          status = case when status = 'to_accept' then 'to_ship' else status end, updated_at = now()
        where order_id = ${leg.orderId} and supplier_id = ${supplierId}`,
    sql`update orders o set status = 'at_supplier'
        where o.id = ${leg.orderId} and o.status = 'paid'
          and not exists (select 1 from forwarding_items f where f.order_id = o.id
                          and f.state not in ('confirmed', 'cancelled'))`
  ], { discard: true })

/** Applies one event, in the supplier's workspace. Answers what to tell the supplier. */
const apply = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  supplierId: string,
  event: SupplierEvent
) =>
  Effect.gen(function*() {
    if (event.type === "stock.updated") {
      const rows = yield* sql<{ variantId: string }>`
        insert into inventory_levels (workspace_id, variant_id, location_id, available, source, reported_by, reported_at)
        select ${workspaceId}, v.id, 'supplier', r.available, 'supplier', ${`supplier:${supplierId}`}, now()
        from jsonb_to_recordset(${JSON.stringify(event.items)}::jsonb) as r(sku text, available integer)
        join variants v on v.sku = r.sku
        join product_supply ps on ps.product_id = v.product_id and ps.supplier_id = ${supplierId} and ps.is_primary
        on conflict (variant_id, location_id, source) do update set available = excluded.available,
          reported_by = excluded.reported_by, reported_at = excluded.reported_at
        returning variant_id`
      return { answer: answer(200, { ok: true, updated: rows.length }), outboxId: null }
    }
    const found = yield* lockLeg(sql, supplierId, event.leg_id)
    if (Option.isNone(found)) return { answer: answer(404, { error: "unknown_leg" }), outboxId: null }
    const leg = found.value
    yield* ensureWork(sql, [leg.id])
    switch (event.type) {
      case "order.accepted": {
        yield* accept(sql, supplierId, leg)
        yield* audit(sql, workspaceId, supplierId, "order.supplier_accepted", leg.orderId, { leg: leg.id })
        return { answer: answer(200, { ok: true }), outboxId: null }
      }
      case "order.problem": {
        const note = event.note?.trim() || null
        yield* sql`update supplier_work set status = 'problem', problem_kind = ${event.kind}, problem_note = ${note},
                     problem_new_date = ${event.new_date ?? null}::date, problem_reported_at = now(),
                     problem_resolved_at = null,
                     handoff_by = case when ${event.new_date ?? null}::date is null then handoff_by
                       else ((${event.new_date ?? null}::date + interval '17 hours') at time zone ${leg.timezone}) end,
                     updated_at = now()
                   where order_id = ${leg.orderId} and supplier_id = ${supplierId} and status <> 'shipped'`
        // A stock or address problem means the leg cannot go as it is: it waits for the operator, in the supplier's words.
        if (event.kind === "stock" || event.kind === "address") {
          yield* sql`update forwarding_items set state = 'error', since = now(), error_kind = ${event.kind},
                       error_note = ${note}
                     where id = ${leg.id}`
        }
        yield* audit(sql, workspaceId, supplierId, "order.supplier_problem", leg.orderId, {
          leg: leg.id,
          kind: event.kind
        })
        return { answer: answer(200, { ok: true }), outboxId: null }
      }
      case "order.shipped": {
        yield* accept(sql, supplierId, leg)
        yield* sql`update supplier_work set status = 'shipped', shipped_at = now(), problem_resolved_at =
                     case when status = 'problem' then now() else problem_resolved_at end, updated_at = now()
                   where order_id = ${leg.orderId} and supplier_id = ${supplierId}`
        const lines = yield* sql<{ shopifyId: string }>`
          select shopify_id from order_lines where id = any(${[...leg.lineIds]}::text[])`
        const outboxId = yield* Outbox.write(sql, workspaceId, {
          type: "order.updated",
          workspaceId,
          userId: `supplier:${supplierId}`,
          orderIds: [leg.orderId],
          change: "fulfil",
          add: [],
          remove: [],
          lines: lines.map((l) => l.shopifyId),
          tracking: {
            company: event.carrier?.trim() || null,
            number: event.tracking_number.trim(),
            url: event.tracking_url?.trim() || null
          }
        })
        yield* audit(sql, workspaceId, supplierId, "order.supplier_shipped", leg.orderId, {
          leg: leg.id,
          tracking: event.tracking_number
        })
        return { answer: answer(200, { ok: true }), outboxId }
      }
    }
  })

const decodeEvent = Schema.decodeUnknownOption(SupplierEvent)

/**
 * A request from a supplier's own API: its workspace by the supplier's id, the signature against its secret, then the
 * event. An unknown supplier or one without a connected API is 404; a bad or stale signature 401; a body Insyte does
 * not read 422.
 */
export const receive = Effect.fn("Suppliers.receive")(function*(input: {
  readonly supplierId: string
  readonly signature: string
  readonly body: Uint8Array
}) {
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from route_supplier(${input.supplierId})`
  )
  if (route === undefined) return answer(404, { error: "unknown_supplier" })
  const inWorkspace = Effect.gen(function*() {
    const [api] = yield* db.scopedFor((sql) =>
      sql<{ sealed: string }>`
        select secret_sealed as sealed from supplier_integrations
        where supplier_id = ${input.supplierId} and kind = 'custom' and enabled and secret_sealed is not null`
    )
    if (api === undefined) return answer(404, { error: "no_api" })
    const secret = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.open(api.sealed)).pipe(Effect.orDie)
    if (!(yield* Effect.promise(() => signed(Redacted.value(secret), input.signature, input.body)))) {
      return answer(401, { error: "bad_signature" })
    }
    const parsed = (() => {
      try {
        return JSON.parse(new TextDecoder().decode(input.body)) as unknown
      } catch {
        return undefined
      }
    })()
    const event = decodeEvent(parsed)
    if (Option.isNone(event)) return answer(422, { error: "unreadable_event" })
    const { answer: said, outboxId } = yield* db.scopedFor((sql) =>
      apply(sql, route.workspaceId, input.supplierId, event.value)
    )
    if (outboxId !== null) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
    return said
  })
  return yield* inWorkspace.pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId }))
})
