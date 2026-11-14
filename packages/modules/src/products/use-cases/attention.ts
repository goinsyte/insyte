import type { SqlClient } from "effect/sql"

/*
 * The products panel's Aandacht (M5.3 for M7–M9): the three cuts a product wants watching by, worked out from the
 * records, once, so every reader (the panel's counts, the list's flags) draws the same line.
 *
 * - "Retour boven 10%": more than a tenth of what sold in the last 90 days came back (returns not rejected, made in
 *   those 90 days), where any sold at all.
 * - "Open klachten": a return whose reason counts for quality (`returns.quality`), not rejected, in the last 30 days.
 * - "Controle loopt": a quality check asked for or sent in, not judged yet.
 *
 * `attentionSets` is a `with` clause of three sets of product ids (`att_returns`, `att_complaints`, `att_checks`);
 * `ATTENTION` the condition on `p.id` for each. The sets start from returns and checks, which are few, and read the
 * sold quantity only for the products that had returns (`order_lines_product`), so no read scans 90 days of orders.
 */

export const RETURN_RATE = 0.1
export const RETURN_DAYS = 90
export const COMPLAINT_DAYS = 30

export const attentionSets = (sql: SqlClient.SqlClient) =>
  sql`with att_back as (
         select ol.product_id, sum(rl.quantity)::numeric as n
         from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
         where r.status <> 'rejected' and r.created_at > now() - make_interval(days => ${RETURN_DAYS})
           and ol.product_id is not null
         group by ol.product_id),
       att_returns as (
         select b.product_id from att_back b
         cross join lateral (
           select coalesce(sum(l.quantity), 0)::numeric as n from order_lines l join orders o on o.id = l.order_id
           where l.product_id = b.product_id and o.placed_at > now() - make_interval(days => ${RETURN_DAYS})
             and o.status <> 'cancelled') sold
         where sold.n > 0 and b.n > ${RETURN_RATE} * sold.n),
       att_complaints as (
         select distinct ol.product_id
         from returns r join return_lines rl on rl.return_id = r.id join order_lines ol on ol.id = rl.order_line_id
         where r.quality and r.status <> 'rejected' and r.created_at > now() - make_interval(days => ${COMPLAINT_DAYS})
           and ol.product_id is not null),
       att_checks as (
         select distinct q.product_id from quality_checks q where q.status in ('requested', 'submitted'))`

/** Each cut as a condition on `p.id`, inside a statement that starts with `attentionSets`. */
export const ATTENTION = {
  attention_returns: "p.id in (select product_id from att_returns)",
  attention_complaints: "p.id in (select product_id from att_complaints)",
  attention_checks: "p.id in (select product_id from att_checks)"
} as const
