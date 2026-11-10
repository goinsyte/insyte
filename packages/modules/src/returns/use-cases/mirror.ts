import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { REVIEW_HOURS, windowCheck, windowDaysFor } from "../domain/Rules.ts"
import { reasonFor, returnPayload, type ShopifyReturnPayload } from "../domain/Shopify.ts"
import { DELIVERED_AT } from "./returns.ts"
import { load } from "./settings.ts"

/*
 * Returns opened in Shopify (M9.3): Shopify's `returns/request`, `returns/approve`, `returns/decline` and
 * `returns/close`, handed over by the stores slice's webhook consumer. A request becomes a return in Te beoordelen
 * (`source 'shopify'`, once per Shopify return), with the team told as for a portal request; Shopify's own mail went to
 * the shopper already, so Insyte sends none for it. Approving, declining and closing in Shopify move the return the same
 * way, where it has not moved on in Insyte; one Insyte decided itself arrives back here and changes nothing.
 */

const actor = { kind: "system", id: "shopify" } as const

/** A line in the return's history, as the team did it in Shopify. */
const history = (
  sql: SqlClient.SqlClient,
  returnId: string,
  kind: "requested" | "approved" | "rejected" | "resolved",
  text: string
) =>
  sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
      values (${mintId("rev")}, app_workspace_id(), ${returnId}, ${kind === "requested" ? "shopper" : "team"},
              ${kind === "requested" ? null : "Shopify"}, ${kind}, ${text})`

/** A request in Shopify: the return, its lines on the order's lines, the reason as Insyte names it. */
const request = Effect.fn("Returns.shopify.request")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  storeId: string,
  p: ShopifyReturnPayload
) {
  const [known] = yield* sql`select id from returns where store_id = ${storeId} and shopify_return_id = ${p.id}`
  if (known !== undefined || p.orderId === null || p.lines.length === 0) return null
  const [order] = yield* sql<{
    id: string
    customerId: string | null
    customerName: string
    customerEmail: string | null
    country: string | null
    currency: string
    placedAt: Date
    deliveredAt: Date | null
  }>`
    select o.id, o.customer_id, o.customer_name, o.customer_email, o.shipping_address ->> 'country' as country,
           o.currency, o.placed_at, ${sql.literal(DELIVERED_AT)} as delivered_at
    from orders o where o.store_id = ${storeId} and o.shopify_id = ${p.orderId} for update of o`
  // An order the mirror has not read yet: the request comes again with Shopify's retries, or the reconcile reads it.
  if (order === undefined) return null
  const lines = yield* sql<{ id: string; shopifyId: string; quantity: number }>`
    select id, shopify_id, quantity from order_lines
    where order_id = ${order.id} and shopify_id in ${sql.in(p.lines.map((l) => l.lineItemId))}`
  if (lines.length === 0) return null
  const s = yield* load(sql)
  const wanted = reasonFor(p.lines[0]!.reason)
  const reason = s.reasons.find((r) => r.id === wanted) ?? s.reasons.find((r) => r.id === "not_as_expected") ??
    s.reasons[0]!
  const kind = reason.type === "claim" ? "claim" : "return"
  const window = windowCheck(order.deliveredAt, windowDaysFor(kind, reason, s, order.placedAt), Date.now())
  const [counter] = yield* sql<{ n: string }>`
    update workspace_counters set next = next + 1 where kind = 'return' returning next - 1 as n`
  const number = `R-${1000 + Number(counter!.n)}`
  const id = mintId("ret")
  yield* sql`
    insert into returns (id, workspace_id, store_id, number, type, order_id, customer_id, customer_name,
                         customer_email, country, source, status, reason_id, customer_note, requested_resolution,
                         currency, gift_card_bonus_pct, exchange_fee_minor, review_deadline, quality, delivered_at,
                         window_until, outside_window, shopify_return_id, created_by)
    values (${id}, ${workspaceId}, ${storeId}, ${number}, ${kind}, ${order.id}, ${order.customerId},
            ${order.customerName}, ${order.customerEmail}, ${order.country}, 'shopify', 'review', ${reason.id},
            ${p.lines.map((l) => l.note).find((n) => n !== null) ?? ""}, 'refund', ${order.currency},
            ${s.giftCardBonusPct}, ${s.exchangeFeeMinor}, now() + make_interval(hours => ${REVIEW_HOURS}),
            ${reason.countsForQuality}, ${order.deliveredAt}, ${new Date(window.closesOn)}, ${!window.inside},
            ${p.id}, 'shopify')`
  for (const line of lines) {
    const asked = p.lines.find((l) => l.lineItemId === line.shopifyId)?.quantity ?? 1
    yield* sql`insert into return_lines (id, workspace_id, return_id, order_line_id, quantity)
               values (${mintId("rln")}, ${workspaceId}, ${id}, ${line.id}, ${Math.min(asked, line.quantity)})`
  }
  yield* history(sql, id, "requested", `${kind === "claim" ? "Claim" : "Retour"} aangevraagd in Shopify`)
  yield* Audit.write(sql, workspaceId, actor, {
    action: "return.requested",
    subjectType: "return",
    subjectId: id,
    diff: { number, orderId: order.id, kind, reason: reason.id, shopifyReturnId: p.id }
  })
  // The team hears of it as of a portal request.
  return yield* Outbox.write(sql, workspaceId, {
    type: "return.requested",
    workspaceId,
    userId: "system",
    returnIds: [id]
  })
})

/** Approved, declined or closed in Shopify: the return moves too, where it has not moved on in Insyte. */
const decided = Effect.fn("Returns.shopify.decided")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  storeId: string,
  topic: "returns/approve" | "returns/decline" | "returns/close",
  p: ShopifyReturnPayload
) {
  const [r] = yield* sql<{ id: string; status: string }>`
    select id, status from returns where store_id = ${storeId} and shopify_return_id = ${p.id} for update`
  if (r === undefined) return
  if (topic === "returns/approve") {
    if (r.status !== "review") return
    yield* sql`update returns set status = 'awaiting_parcel' where id = ${r.id}`
    yield* history(sql, r.id, "approved", "Goedgekeurd in Shopify")
  } else if (topic === "returns/decline") {
    if (r.status !== "review" && r.status !== "awaiting_parcel") return
    const reason = p.declineNote ?? "Afgewezen in Shopify"
    yield* sql`update returns set status = 'rejected', rejected_reason = ${reason} where id = ${r.id}`
    yield* history(sql, r.id, "rejected", `Afgewezen in Shopify: ${reason}`)
  } else {
    // Closed: Shopify handled it (a refund, mirrored with the order); Insyte reads it as settled with one.
    if (r.status === "resolved" || r.status === "rejected") return
    yield* sql`update returns r set status = 'resolved', resolution = coalesce(r.resolution, 'refund'),
                 resolution_minor = coalesce(r.resolution_minor, (
                   select coalesce(sum(rl.quantity * ol.unit_price_minor), 0) from return_lines rl
                   join order_lines ol on ol.id = rl.order_line_id where rl.return_id = r.id)),
                 resolved_at = now(), resolved_by = 'Shopify'
               where r.id = ${r.id}`
    yield* history(sql, r.id, "resolved", "Afgesloten in Shopify")
  }
  yield* Audit.write(sql, workspaceId, actor, {
    action: `return.shopify_${topic.slice("returns/".length)}`,
    subjectType: "return",
    subjectId: r.id,
    diff: { shopifyReturnId: p.id, from: r.status }
  })
})

/** One `returns/*` delivery for a store, in its workspace. */
export const shopifyReturn = Effect.fn("Returns.shopifyReturn")(function*(
  storeId: string,
  topic: string,
  body: Record<string, unknown>
) {
  const p = returnPayload(body)
  if (p === undefined) return
  const db = yield* Db
  const workspace = yield* CurrentWorkspace
  const told = yield* db.scopedFor((sql) =>
    topic === "returns/request"
      ? request(sql, workspace.id, storeId, p)
      : topic === "returns/approve" || topic === "returns/decline" || topic === "returns/close"
      ? Effect.as(decided(sql, workspace.id, storeId, topic, p), null)
      : Effect.succeed(null)
  )
  if (told !== null) yield* (yield* Relay).kick([told])
})
