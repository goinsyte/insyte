import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { commissionOf, monthOf, programOf } from "./program.ts"

/*
 * Conversions (M16 step 4; domain.md §14.1). An order Shopify tells of (`order.placed`, from `orders/create`) that
 * carries an affiliate's code or came through one of its links is a conversion, with an accrual in the ledger at the
 * affiliate's rate of that moment. Until the return window has passed (the programme's days after delivery) it
 * follows the order: a refund takes its share of the commission back, a cancel all of it, always as a new reversal
 * line. Once past the window it is approved and final: what happens to the order after that is not the affiliate's.
 *
 * A code attributes only once its Shopify discount is Insyte's own (\`discount_state\` made, PLAN item 22): a code the
 * store already had in Shopify is never an affiliate's. A link attributes only while it is not archived, and only an
 * active affiliate of a programme that is on earns. An order that looks like the affiliate's own (the same address,
 * read as one person's, or the same Shopify customer) is \`flagged\` without commission, for the brand to look at.
 *
 * As the relay or the cron, the system in the workspace. Nothing here reads a shopper's name or address; the order's
 * e-mail and customer only to tell an affiliate's own order.
 */

interface Candidate {
  readonly id: string
  readonly storeId: string
  readonly number: string
  readonly subtotalMinor: number
  readonly currency: string
  readonly placedAt: Date
  readonly referralCode: string | null
  readonly affiliateRef: string | null
  readonly customer: string | null
  readonly title: string | null
}

interface Match {
  readonly affiliateId: string
  readonly rate: string
  readonly linkId: string | null
  readonly code: string | null
  /** The order is the affiliate's own, as far as Insyte can tell. */
  readonly self: boolean
}

/**
 * The orders' conversions, written once each (the order is unique): by the code first, as the buyer typed it, else by
 * the link the cart carried, if that link was clicked within the programme's attribution days before the order.
 */
export const attribute = Effect.fn("Affiliates.attribute")(function*(
  sql: SqlClient.SqlClient,
  orderIds: ReadonlyArray<string>
) {
  if (orderIds.length === 0) return []
  const [program] = yield* sql<{ attributionDays: number; enabled: boolean }>`
    select attribution_days, enabled from affiliate_programs where workspace_id = app_workspace_id()`
  if (program === undefined || !program.enabled) return []
  const orders = yield* sql<Candidate>`
    select o.id, o.store_id, o.number, o.subtotal_minor, o.currency, o.placed_at, upper(o.referral_code) as referral_code,
           o.affiliate_ref, o.customer_shopify_id as customer,
           (select l.title from order_lines l where l.order_id = o.id order by l.id limit 1) as title
    from orders o
    where o.id in ${sql.in([...orderIds])} and o.is_draft = false and o.cancelled_at is null
      and (o.referral_code is not null or o.affiliate_ref is not null)
      and not exists (select 1 from affiliate_conversions c where c.order_id = o.id)`
  const made: Array<string> = []
  for (const order of orders) {
    // The order's address against the affiliate's (as one person's), or its Shopify customer against one that an
    // order of the affiliate's own address was placed by, or a customer of that address.
    const self = sql`(affiliate_email_key((select o.customer_email from orders o where o.id = ${order.id}))
                        = affiliate_email_key(a.email)
                      or (${order.customer}::text is not null and exists (
                            select 1 from orders o2 where o2.customer_shopify_id = ${order.customer}
                              and o2.id <> ${order.id} and affiliate_email_key(o2.customer_email) = affiliate_email_key(a.email)
                            union all
                            select 1 from customers k where k.shopify_id = ${order.customer}
                              and affiliate_email_key(k.email) = affiliate_email_key(a.email))))`
    const byCode = order.referralCode === null ? [] : yield* sql<Match>`
      select a.id as affiliate_id, a.rate, null::text as link_id, c.code, ${self} as self
      from affiliate_codes c join affiliates a on a.id = c.affiliate_id
      where c.workspace_id = app_workspace_id() and c.code = ${order.referralCode} and a.status = 'active'
        and a.discount_state = 'made'
        and (c.valid_until is null or c.valid_until > ${order.placedAt})`
    const byLink = byCode.length > 0 || order.affiliateRef === null ? [] : yield* sql<Match>`
      select a.id as affiliate_id, a.rate, l.id as link_id, null::text as code, ${self} as self
      from affiliate_links l join affiliates a on a.id = l.affiliate_id
      where l.workspace_id = app_workspace_id() and l.short_slug = ${order.affiliateRef} and a.status = 'active'
        and l.archived_at is null
        and exists (select 1 from affiliate_clicks k where k.workspace_id = app_workspace_id() and k.link_id = l.id
                      and k.at between ${order.placedAt}::timestamptz - make_interval(days => ${program.attributionDays})
                                   and ${order.placedAt}::timestamptz + interval '1 hour')`
    const match = byCode[0] ?? byLink[0]
    if (match === undefined) continue
    const rate = Number(match.rate)
    // An order that looks like the affiliate's own earns nothing until the brand says it is not.
    const commission = match.self ? 0 : commissionOf(Number(order.subtotalMinor), rate)
    const id = mintId("acv")
    const month = monthOf(order.placedAt)
    const inserted = yield* sql<{ id: string }>`
      insert into affiliate_conversions (id, workspace_id, affiliate_id, link_id, order_id, store_id, order_number,
                                         product_title, attributed_by, code, base_minor, commission_minor, rate,
                                         currency, placed_at, month, status, flag_reason)
      values (${id}, app_workspace_id(), ${match.affiliateId}, ${match.linkId}, ${order.id}, ${order.storeId},
              ${order.number}, ${order.title ?? ""}, ${match.linkId === null ? "code" : "link"}, ${match.code},
              ${order.subtotalMinor}, ${commission}, ${rate}, ${order.currency}, ${order.placedAt}, ${month},
              ${match.self ? "flagged" : "pending"}, ${match.self ? "self" : null})
      on conflict (order_id) do nothing
      returning id`
    if (inserted.length === 0 || match.self) continue
    yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind, amount_minor,
                                                     currency, month)
               values (${mintId("ale")}, app_workspace_id(), ${match.affiliateId}, ${id}, 'accrual', ${commission},
                       ${order.currency}, ${month})`
    made.push(id)
  }
  return made
})

interface Open {
  readonly id: string
  readonly affiliateId: string
  readonly status: "pending" | "approved"
  readonly currency: string
  readonly month: string
  readonly accrued: number
  readonly net: number
  readonly totalMinor: number
  readonly cancelled: boolean
  readonly deliveredAt: Date | null
  readonly windowEndsAt: Date | null
  readonly refunded: number
}

/**
 * The conversions still in their window follow their orders (all pending ones, or those of `orderIds`): delivery
 * starts the window; a refund inside it takes its share back, a cancel all of it, as a reversal line for the
 * difference; one past its window is approved. Idempotent: run again, it writes nothing new.
 */
export const settle = Effect.fn("Affiliates.settle")(function*(
  sql: SqlClient.SqlClient,
  options: { readonly orderIds?: ReadonlyArray<string>; readonly at?: Date } = {}
) {
  const program = yield* programOf(sql)
  if (program === undefined) return []
  const at = options.at ?? new Date()
  const only = options.orderIds === undefined ? sql`true` : sql`c.order_id in ${sql.in([...options.orderIds, ""])}`
  const open = yield* sql<Open>`
    select c.id, c.affiliate_id, c.status, c.currency, c.month,
           (select coalesce(sum(e.amount_minor) filter (where e.kind = 'accrual'), 0) from affiliate_ledger_entries e
            where e.conversion_id = c.id)::bigint as accrued,
           (select coalesce(sum(e.amount_minor), 0) from affiliate_ledger_entries e
            where e.conversion_id = c.id and e.kind in ('accrual', 'reversal'))::bigint as net,
           coalesce(o.total_minor, 0) as total_minor, d.delivered_at, w.window_ends_at,
           (o.cancelled_at is not null and (w.window_ends_at is null or o.cancelled_at <= w.window_ends_at)) as cancelled,
           coalesce((select sum(r.amount_minor) from refunds r where r.order_id = o.id and r.status = 'succeeded'
                       and (w.window_ends_at is null or r.created_at <= w.window_ends_at)), 0)::bigint as refunded
    -- An order gone (shop/redact) changes nothing more: its window, if it had one, still runs out.
    from affiliate_conversions c left join orders o on o.id = c.order_id
    cross join lateral (select coalesce(c.delivered_at,
                                        (select max(f.delivered_at) from fulfilments f where f.order_id = o.id),
                                        o.shipped_at) as delivered_at) d
    cross join lateral (select coalesce(c.window_ends_at,
                                        d.delivered_at + make_interval(days => ${program.returnDays})) as window_ends_at) w
    where c.workspace_id = app_workspace_id() and c.status = 'pending' and ${only}
    for update of c`
  const changed: Array<string> = []
  for (const c of open) {
    const { deliveredAt, windowEndsAt } = c
    const accrued = Number(c.accrued)
    const total = Number(c.totalMinor)
    const fraction = c.cancelled || total <= 0 ? (c.cancelled ? 0 : 1) : Math.max(0, 1 - Number(c.refunded) / total)
    const target = Math.round(accrued * fraction)
    const net = Number(c.net)
    if (target < net) {
      yield* sql`insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, conversion_id, kind,
                                                       amount_minor, currency, month)
                 values (${mintId("ale")}, app_workspace_id(), ${c.affiliateId}, ${c.id}, 'reversal', ${target - net},
                         ${c.currency}, ${c.month})`
    }
    const now = Math.min(target, net)
    const status = now === 0 ? "reversed" : windowEndsAt !== null && windowEndsAt <= at ? "approved" : "pending"
    yield* sql`update affiliate_conversions set
                 commission_minor = ${now}, delivered_at = ${deliveredAt}, window_ends_at = ${windowEndsAt},
                 status = ${status},
                 approved_at = case when ${status} = 'approved' then ${at} else approved_at end,
                 reversed_at = case when ${status} = 'reversed' then ${at} else reversed_at end,
                 reversal_reason = case when ${status} = 'reversed'
                                        then case when ${c.cancelled} then 'cancel' else 'refund' end
                                        else reversal_reason end
               where id = ${c.id}`
    if (status !== "pending" || target < net) changed.push(c.id)
  }
  return changed
})
