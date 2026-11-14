import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import type { Attention, ProductListInput } from "../domain/Products.ts"

/*
 * The products panel's Aandacht (M5.3 for M7–M9): the three cuts a product wants watching by, worked out from the
 * records, once, so every reader (the panel's counts, the list's filter and its flags) draws the same line.
 *
 * - "Retour boven 10%": more than a tenth of what sold in the last 90 days came back (returns not rejected, made in
 *   those 90 days), where any sold at all.
 * - "Open klachten": a return whose reason counts for quality (`returns.quality`), not rejected, in the last 30 days.
 * - "Controle loopt": a quality check asked for or sent in, not judged yet.
 *
 * `attentionSets` is a `with` clause of three sets of product ids (`att_returns`, `att_complaints` with how many,
 * `att_checks`), the returns inside the principal's stores (a check is fenced by its product, where it is read);
 * `ATTENTION` the condition on `p.id` for each. The sets start from
 * returns and checks, which are few; what sold is read from the window's orders only (`orders_list`), for the products
 * that had returns, so no read walks a product's whole history.
 */

export const RETURN_RATE = 0.1
export const RETURN_DAYS = 90
export const COMPLAINT_DAYS = 30

/** The cuts, as `Products.list` takes them (`/products?status=attention_*` on the panel). */
type Cut = NonNullable<ProductListInput["attention"]>

export const attentionSets = Effect.fn("Products.attentionSets")(function*(sql: SqlClient.SqlClient) {
  const returns = yield* inScope(sql, "r.store_id")
  return sql`with att_back as (
         select ol.product_id, sum(rl.quantity)::numeric as n
         from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
         where r.status <> 'rejected' and r.created_at > now() - make_interval(days => ${RETURN_DAYS})
           and ol.product_id is not null and ${returns}
         group by ol.product_id),
       att_sold as (
         select l.product_id, sum(l.quantity)::numeric as n
         from orders o join order_lines l on l.order_id = o.id
         where o.placed_at > now() - make_interval(days => ${RETURN_DAYS}) and o.status <> 'cancelled'
           and l.product_id in (select product_id from att_back)
         group by l.product_id),
       att_returns as (
         select b.product_id from att_back b join att_sold s on s.product_id = b.product_id
         where s.n > 0 and b.n > ${RETURN_RATE} * s.n),
       att_complaints as (
         select ol.product_id, count(distinct r.id)::int as n
         from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
         where r.quality and r.status <> 'rejected' and r.created_at > now() - make_interval(days => ${COMPLAINT_DAYS})
           and ol.product_id is not null and ${returns}
         group by ol.product_id),
       att_checks as (
         select distinct q.product_id from quality_checks q where q.status in ('requested', 'submitted'))`
})

/** Each cut as a condition on `p.id`, inside a statement that starts with `attentionSets`. */
export const ATTENTION: Record<Cut, string> = {
  returns: "p.id in (select product_id from att_returns)",
  complaints: "p.id in (select product_id from att_complaints)",
  checks: "p.id in (select product_id from att_checks)"
}

/** What the cuts say of each of these products, as the list's flags show it. */
export const attentionOf = Effect.fn("Products.attentionOf")(
  function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
    if (ids.length === 0) return new Map<string, typeof Attention.Type>()
    const rows = yield* sql<{ id: string } & typeof Attention.Type>`
      ${yield* attentionSets(sql)}
      select p.id, ${sql.literal(ATTENTION.returns)} as return_high,
             coalesce((select c.n from att_complaints c where c.product_id = p.id), 0) as complaints,
             ${sql.literal(ATTENTION.checks)} as check_running
      from unnest(${[...ids]}::text[]) as p(id)`
    return new Map(
      rows.map((r) => [r.id, { returnHigh: r.returnHigh, complaints: r.complaints, checkRunning: r.checkRunning }])
    )
  }
)
