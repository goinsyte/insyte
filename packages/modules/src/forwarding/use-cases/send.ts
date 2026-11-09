import { Db } from "@insyte/database/Db"
import { Effect, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { Mailer } from "../../shared/domain/Mailer.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import { SupplierApi, SupplierApiError, type SupplierOrder } from "../domain/Forwarding.ts"
import { ensureWork } from "./work.ts"

/*
 * A forward's delivery (M8.2), once its undo window has passed: each leg still `sending` goes to its supplier, by its
 * custom API (signed JSON) or by mail ("Leveranciersportaal" is mail until the portal opens, M16). Each leg is its own
 * transaction, so a retry never sends one twice. A refusal is final (`send_failed` with the supplier's words); an
 * endpoint that cannot be reached fails the step, so the workflow tries again, and `abandon` records it when it gives up.
 */

interface Leg {
  readonly id: string
  readonly via: "portal" | "email" | "api" | null
  readonly supplierName: string
  readonly to: string | null
  readonly confirmHours: number
  readonly webhookUrl: string | null
  readonly secretSealed: string | null
  readonly apiOn: boolean
  readonly shop: string
  readonly number: string
  readonly placedAt: Date
  readonly note: string | null
  readonly address: Record<string, string | null> | null
  readonly lines: ReadonlyArray<{ sku: string | null; title: string; variantTitle: string | null; quantity: number }>
}

/** What the supplier gets: their lines, where to ship them, the note. Never the customer's email or phone. */
export const supplierOrderOf = (
  leg: Pick<Leg, "id" | "number" | "placedAt" | "note" | "address" | "lines">
): SupplierOrder => ({
  type: "order.forwarded",
  leg_id: leg.id,
  order: { number: leg.number, placed_at: leg.placedAt.toISOString(), note: leg.note },
  ship_to: {
    name: leg.address?.["name"] ?? null,
    line1: leg.address?.["line1"] ?? null,
    line2: leg.address?.["line2"] ?? null,
    city: leg.address?.["city"] ?? null,
    postcode: leg.address?.["postcode"] ?? null,
    region: leg.address?.["region"] ?? null,
    country: leg.address?.["country"] ?? null
  },
  lines: leg.lines.map((l) => ({ sku: l.sku, title: l.title, variant_title: l.variantTitle, quantity: l.quantity }))
})

const lockLeg = (sql: SqlClient.SqlClient, id: string) =>
  sql<Leg>`
    select f.id, f.via, s.name as supplier_name, coalesce(s.forward_email, s.contact_email) as to,
           s.confirm_within_hours as confirm_hours, i.webhook_url, i.secret_sealed,
           coalesce(i.kind = 'custom' and i.enabled, false) as api_on, st.name as shop, o.number,
           o.placed_at, o.supplier_note as note, o.shipping_address as address,
           coalesce((select json_agg(json_build_object('sku', l.sku, 'title', l.title, 'variantTitle', l.variant_title,
                                                       'quantity', l.quantity) order by l.id)
                     from order_lines l where l.id = any(f.line_ids)), '[]') as lines
    from forwarding_items f
    join suppliers s on s.id = f.supplier_id
    join orders o on o.id = f.order_id
    join stores st on st.id = f.store_id
    left join supplier_integrations i on i.supplier_id = s.id
    where f.id = ${id} and f.state = 'sending'
    for update of f`

/** Sent: the supplier has it, and its work begins (M8.3). */
const sentOk = (sql: SqlClient.SqlClient, leg: Leg) =>
  Effect.andThen(
    sql`update forwarding_items set state = 'awaiting', since = now(), attempts = attempts + 1,
          confirm_by = now() + make_interval(hours => ${leg.confirmHours})
        where id = ${leg.id}`,
    ensureWork(sql, [leg.id])
  )

const failed = (sql: SqlClient.SqlClient, id: string, note: string) =>
  sql`update forwarding_items set state = 'error', since = now(), attempts = attempts + 1, error_kind = 'send_failed',
        error_note = ${note}
      where id = ${id} and state = 'sending'`

type Outcome = "sent" | "failed" | "skipped"

const deliver = (leg: Leg) =>
  Effect.gen(function*() {
    const order = supplierOrderOf(leg)
    if (leg.via === "api") {
      if (!leg.apiOn || leg.webhookUrl === null || leg.secretSealed === null) {
        return yield* new SupplierApiError({ reason: "Geen API gekoppeld voor deze leverancier", retryable: false })
      }
      const secret = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.open(leg.secretSealed!)).pipe(Effect.orDie)
      yield* Effect.flatMap(
        Effect.service(SupplierApi),
        (api) => api.post(leg.webhookUrl!, Redacted.value(secret), order)
      )
      return
    }
    if (leg.to === null) {
      return yield* new SupplierApiError({ reason: "Geen e-mailadres voor bestellingen", retryable: false })
    }
    yield* Effect.flatMap(Effect.service(Mailer), (mailer) =>
      mailer.send({
        kind: "supplier.order",
        to: leg.to!,
        reference: leg.id,
        supplierOrder: { supplier: leg.supplierName, shop: leg.shop, order }
      })).pipe(
        Effect.mapError((e) => new SupplierApiError({ reason: e.reason, retryable: true }))
      )
  })

/** Sends each leg still waiting. Fails, for the workflow to retry, when an endpoint could not be reached. */
export const send = Effect.fn("Forwarding.send")(function*(legIds: ReadonlyArray<string>) {
  const db = yield* Db
  const outcomes: Array<{ id: string; outcome: Outcome }> = []
  let retry: SupplierApiError | undefined
  for (const id of legIds) {
    const outcome = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [leg] = yield* lockLeg(sql, id)
        if (leg === undefined) return "skipped" as const
        return yield* deliver(leg).pipe(
          Effect.andThen(sentOk(sql, leg)),
          Effect.as("sent" as const),
          Effect.catchTag("SupplierApiError", (e) => {
            if (e.retryable) {
              retry = e
              return Effect.succeed("skipped" as const)
            }
            return Effect.as(failed(sql, id, e.reason), "failed" as const)
          })
        )
      })
    )
    outcomes.push({ id, outcome })
  }
  if (retry !== undefined) return yield* retry
  return outcomes
})

/** The workflow gave up on an endpoint: what is still waiting failed to send. */
export const abandon = Effect.fn("Forwarding.abandon")(function*(legIds: ReadonlyArray<string>) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update forwarding_items set state = 'error', since = now(), error_kind = 'send_failed',
          error_note = 'De leverancier was niet bereikbaar'
        where id in ${sql.in([...legIds])} and state = 'sending'`
  )
})
