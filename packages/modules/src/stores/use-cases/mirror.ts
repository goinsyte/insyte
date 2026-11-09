import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import { ensureLegs } from "../../forwarding/use-cases/legs.ts"
import type { MirrorBatch } from "../domain/Mirror.ts"

/*
 * Writing one page of the mirror (M6.3), inside the store's workspace as `system` (`Db.scopedFor`). One statement per
 * table over `jsonb_to_recordset`, so a page of a thousand lines is seven round trips, not a thousand. A row is found
 * again by `(store_id, shopify_id)`: the id minted here is used only when the row is new. Products, customers and
 * orders take the ordering guard (domain.md §4.6): an update older than the row is ignored. A child is joined to its
 * parent's row by the parent's Shopify id; a child whose parent is not there yet is counted, not written.
 */

/** The last of each Shopify id in the page: Postgres refuses to update one row twice in one statement. */
const latest = <R extends { readonly shopify_id: string }>(rows: ReadonlyArray<R>): Array<R & { id: string }> =>
  [...new Map(rows.map((r) => [r.shopify_id, r])).values()].map((r) => ({ ...r, id: "" }))

const withIds = <R extends { readonly shopify_id: string }>(prefix: string, rows: ReadonlyArray<R>) =>
  JSON.stringify(latest(rows).map((r) => ({ ...r, id: mintId(prefix) })))

/** What a page wrote, per table, and the children left for want of a parent. */
export interface Applied {
  readonly products: number
  readonly variants: number
  readonly customers: number
  readonly orders: number
  readonly lines: number
  readonly fulfilments: number
  readonly refunds: number
  readonly orphans: number
}

const count = (rows: ReadonlyArray<unknown>) => rows.length

/**
 * `live` is false for a store's first import: its forwarding legs are made, but nothing is forwarded on its own (a
 * supplier's "forward on payment" is for orders paid from now on, M8.2).
 */
export const applyBatch = Effect.fn("Sync.applyBatch")(function*(
  storeId: string,
  batch: MirrorBatch,
  options: { readonly live?: boolean } = {}
) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const products = batch.products.length === 0 ? [] : yield* sql`
        insert into products (id, workspace_id, store_id, shopify_id, title, handle, description_html, status, vendor,
                              product_type, tags, images, shopify_created_at, external_updated_at, raw)
        select r.id, app_workspace_id(), ${storeId}, r.shopify_id, r.title, r.handle, r.description_html, r.status,
               r.vendor, r.product_type, r.tags, r.images, r.shopify_created_at, r.external_updated_at, r.raw
        from jsonb_to_recordset(${withIds("prd", batch.products)}::jsonb) as r(
          id text, shopify_id text, title text, handle text, description_html text, status text, vendor text,
          product_type text, tags text[], images text[], shopify_created_at timestamptz,
          external_updated_at timestamptz, raw jsonb)
        on conflict (store_id, shopify_id) do update set
          title = excluded.title, handle = excluded.handle, description_html = excluded.description_html,
          status = excluded.status, vendor = excluded.vendor, product_type = excluded.product_type,
          tags = excluded.tags, images = excluded.images, shopify_created_at = excluded.shopify_created_at,
          external_updated_at = excluded.external_updated_at, raw = excluded.raw
        where excluded.external_updated_at >= products.external_updated_at
        returning 1`

      // Each Shopify vendor is a supplier (M8.1), made once: a removed one stays removed. A vendor equal to the shop's
      // own name is Shopify's default, not a supplier. A product without a supplier gets its vendor's.
      const vendors = [...new Set(batch.products.map((p) => p.vendor?.trim() ?? "").filter((v) => v !== ""))]
      if (vendors.length > 0) {
        yield* sql`
          insert into suppliers (id, workspace_id, name, vendor, created_by)
          select r.id, app_workspace_id(), r.name, lower(r.name), 'system'
          from jsonb_to_recordset(${JSON.stringify(vendors.map((name) => ({ id: mintId("sup"), name })))}::jsonb)
            as r(id text, name text)
          join stores s on s.id = ${storeId}
          where lower(r.name) <> lower(s.name)
            and not exists (select 1 from suppliers x where lower(x.name) = lower(r.name) and x.deleted_at is null)
          on conflict do nothing`
        yield* sql`
          insert into product_supply (workspace_id, product_id, supplier_id, is_primary, lead_days)
          select app_workspace_id(), p.id, sup.id, true, sup.default_lead_days
          from products p
          join lateral (
            select x.id, x.default_lead_days from suppliers x
            where x.deleted_at is null and (x.vendor = lower(btrim(p.vendor)) or lower(x.name) = lower(btrim(p.vendor)))
            order by (x.vendor = lower(btrim(p.vendor))) desc nulls last, x.created_at limit 1
          ) sup on true
          where p.store_id = ${storeId} and p.shopify_id in ${sql.in(batch.products.map((p) => p.shopify_id))}
            and not exists (select 1 from product_supply ps where ps.product_id = p.id)
          on conflict do nothing`
      }

      const variants = batch.variants.length === 0 ? [] : yield* sql`
        insert into variants (id, workspace_id, store_id, product_id, shopify_id, inventory_item_id, sku, title,
                              price_minor, compare_at_minor, position)
        select r.id, app_workspace_id(), ${storeId}, p.id, r.shopify_id, r.inventory_item_id, r.sku, r.title,
               r.price_minor, r.compare_at_minor, r.position
        from jsonb_to_recordset(${withIds("var", batch.variants)}::jsonb) as r(
          id text, shopify_id text, product_shopify_id text, inventory_item_id text, sku text, title text,
          price_minor bigint, compare_at_minor bigint, position integer)
        join products p on p.store_id = ${storeId} and p.shopify_id = r.product_shopify_id
        on conflict (store_id, shopify_id) do update set
          product_id = excluded.product_id, inventory_item_id = excluded.inventory_item_id, sku = excluded.sku,
          title = excluded.title, price_minor = excluded.price_minor, compare_at_minor = excluded.compare_at_minor,
          position = excluded.position
        returning 1`

      // A product's photographs after its featured one, in their order, each once: a re-read lists them again.
      if (batch.images.length > 0) {
        yield* sql`
          update products p
          set images = array(select u from unnest(p.images || r.urls) with ordinality as t(u, n) group by u order by min(n))
          from (select e.v->>'product_shopify_id' as shopify_id, array_agg(e.v->>'url' order by e.n) as urls
                from jsonb_array_elements(${JSON.stringify(batch.images)}::jsonb) with ordinality as e(v, n)
                group by 1) r
          where p.store_id = ${storeId} and p.shopify_id = r.shopify_id`
      }

      const customers = batch.customers.length === 0 ? [] : yield* sql`
        insert into customers (id, workspace_id, store_id, shopify_id, email, name, phone, address, country, tags,
                               orders_count, lifetime_value_minor, currency, marketing_consent, external_updated_at, raw)
        select r.id, app_workspace_id(), ${storeId}, r.shopify_id, r.email, r.name, r.phone, r.address, r.country,
               r.tags, r.orders_count, r.lifetime_value_minor, r.currency, r.marketing_consent, r.external_updated_at,
               r.raw
        from jsonb_to_recordset(${withIds("cus", batch.customers)}::jsonb) as r(
          id text, shopify_id text, email text, name text, phone text, address jsonb, country text, tags text[],
          orders_count integer, lifetime_value_minor bigint, currency text, marketing_consent boolean,
          external_updated_at timestamptz, raw jsonb)
        on conflict (store_id, shopify_id) do update set
          email = excluded.email, name = excluded.name, phone = excluded.phone, address = excluded.address,
          country = excluded.country, tags = excluded.tags, orders_count = excluded.orders_count,
          lifetime_value_minor = excluded.lifetime_value_minor, currency = excluded.currency,
          marketing_consent = excluded.marketing_consent, external_updated_at = excluded.external_updated_at,
          raw = excluded.raw
        where excluded.external_updated_at >= customers.external_updated_at
        returning 1`

      const orders = batch.orders.length === 0 ? [] : yield* sql`
        insert into orders (id, workspace_id, store_id, shopify_id, number, customer_id, customer_shopify_id,
                            customer_name, customer_email, status, payment_status, fulfillment_status, total_minor,
                            subtotal_minor, shipping_minor, tax_minor, discounts_minor, currency, payment_gateway,
                            card_last4, shipping_address, tags, note, channel, referral_code, placed_at, paid_at,
                            shipped_at, cancelled_at, refunded_at, external_updated_at, raw)
        select r.id, app_workspace_id(), ${storeId}, r.shopify_id, r.number, coalesce(c.merged_into, c.id),
               r.customer_shopify_id,
               r.customer_name, r.customer_email, r.status, r.payment_status, r.fulfillment_status, r.total_minor,
               r.subtotal_minor, r.shipping_minor, r.tax_minor, r.discounts_minor, r.currency, r.payment_gateway,
               r.card_last4, r.shipping_address, r.tags, r.note, r.channel, r.referral_code, r.placed_at, r.paid_at,
               r.shipped_at, r.cancelled_at, r.refunded_at, r.external_updated_at, r.raw
        from jsonb_to_recordset(${withIds("ord", batch.orders)}::jsonb) as r(
          id text, shopify_id text, number text, customer_shopify_id text, customer_name text, customer_email text,
          status text, payment_status text, fulfillment_status text, total_minor bigint, subtotal_minor bigint,
          shipping_minor bigint, tax_minor bigint, discounts_minor bigint, currency text, payment_gateway text,
          card_last4 text, shipping_address jsonb, tags text[], note text, channel text, referral_code text,
          placed_at timestamptz, paid_at timestamptz, shipped_at timestamptz, cancelled_at timestamptz,
          refunded_at timestamptz, external_updated_at timestamptz, raw jsonb)
        left join customers c on c.store_id = ${storeId} and c.shopify_id = r.customer_shopify_id
        on conflict (store_id, shopify_id) do update set
          number = excluded.number, customer_id = excluded.customer_id,
          customer_shopify_id = excluded.customer_shopify_id, customer_name = excluded.customer_name,
          customer_email = excluded.customer_email,
          status = case when orders.status = 'at_supplier' and excluded.status = 'paid' then 'at_supplier'
                        else excluded.status end,
          payment_status = excluded.payment_status, fulfillment_status = excluded.fulfillment_status,
          total_minor = excluded.total_minor, subtotal_minor = excluded.subtotal_minor,
          shipping_minor = excluded.shipping_minor, tax_minor = excluded.tax_minor,
          discounts_minor = excluded.discounts_minor, currency = excluded.currency,
          payment_gateway = excluded.payment_gateway, card_last4 = excluded.card_last4,
          shipping_address = excluded.shipping_address, tags = excluded.tags, note = excluded.note,
          channel = excluded.channel, referral_code = excluded.referral_code, placed_at = excluded.placed_at,
          paid_at = excluded.paid_at, shipped_at = excluded.shipped_at, cancelled_at = excluded.cancelled_at,
          refunded_at = excluded.refunded_at, external_updated_at = excluded.external_updated_at, raw = excluded.raw
        where excluded.external_updated_at >= orders.external_updated_at
        returning 1`

      const lines = batch.lines.length === 0 ? [] : yield* sql`
        insert into order_lines (id, workspace_id, store_id, order_id, shopify_id, product_id, variant_id,
                                 variant_shopify_id, sku, title, variant_title, quantity, unit_price_minor)
        select r.id, app_workspace_id(), ${storeId}, o.id, r.shopify_id, p.id, v.id, r.variant_shopify_id, r.sku,
               r.title, r.variant_title, r.quantity, r.unit_price_minor
        from jsonb_to_recordset(${withIds("oln", batch.lines)}::jsonb) as r(
          id text, shopify_id text, order_shopify_id text, product_shopify_id text, variant_shopify_id text,
          sku text, title text, variant_title text, quantity integer, unit_price_minor bigint)
        join orders o on o.store_id = ${storeId} and o.shopify_id = r.order_shopify_id
        left join products p on p.store_id = ${storeId} and p.shopify_id = r.product_shopify_id
        left join variants v on v.store_id = ${storeId} and v.shopify_id = r.variant_shopify_id
        on conflict (store_id, shopify_id) do update set
          order_id = excluded.order_id, product_id = excluded.product_id, variant_id = excluded.variant_id,
          variant_shopify_id = excluded.variant_shopify_id, sku = excluded.sku, title = excluded.title,
          variant_title = excluded.variant_title, quantity = excluded.quantity,
          unit_price_minor = excluded.unit_price_minor
        returning 1`

      const fulfilments = batch.fulfilments.length === 0 ? [] : yield* sql`
        insert into fulfilments (id, workspace_id, store_id, order_id, shopify_id, status, carrier, tracking_number,
                                 tracking_url, shipped_at, delivered_at, tracking_status)
        select r.id, app_workspace_id(), ${storeId}, o.id, r.shopify_id, r.status, r.carrier, r.tracking_number,
               r.tracking_url, r.shipped_at, r.delivered_at, r.tracking_status
        from jsonb_to_recordset(${withIds("ful", batch.fulfilments)}::jsonb) as r(
          id text, shopify_id text, order_shopify_id text, status text, carrier text, tracking_number text,
          tracking_url text, shipped_at timestamptz, delivered_at timestamptz, tracking_status text)
        join orders o on o.store_id = ${storeId} and o.shopify_id = r.order_shopify_id
        on conflict (store_id, shopify_id) do update set
          status = excluded.status, carrier = excluded.carrier, tracking_number = excluded.tracking_number,
          tracking_url = excluded.tracking_url, shipped_at = excluded.shipped_at,
          delivered_at = excluded.delivered_at, tracking_status = excluded.tracking_status
        returning 1`

      const refunds = batch.refunds.length === 0 ? [] : yield* sql`
        insert into refunds (id, workspace_id, store_id, order_id, shopify_id, amount_minor, currency, note, created_at)
        select r.id, app_workspace_id(), ${storeId}, o.id, r.shopify_id, r.amount_minor, r.currency, r.note,
               r.created_at
        from jsonb_to_recordset(${withIds("rfd", batch.refunds)}::jsonb) as r(
          id text, shopify_id text, order_shopify_id text, amount_minor bigint, currency text, note text,
          created_at timestamptz)
        join orders o on o.store_id = ${storeId} and o.shopify_id = r.order_shopify_id
        on conflict (store_id, shopify_id) do update set
          amount_minor = excluded.amount_minor, currency = excluded.currency, note = excluded.note
        returning 1`

      // Forwarding (M8.2): the legs of every order this page touched, by its order or by its lines and parcels.
      yield* ensureLegs(sql, storeId, [
        ...batch.orders.map((o) => o.shopify_id),
        ...batch.lines.map((l) => l.order_shopify_id),
        ...batch.fulfilments.map((f) => f.order_shopify_id)
      ], options.live ?? true)

      const children = latest(batch.variants).length + latest(batch.lines).length + latest(batch.fulfilments).length +
        latest(batch.refunds).length
      const written: Applied = {
        products: count(products),
        variants: count(variants),
        customers: count(customers),
        orders: count(orders),
        lines: count(lines),
        fulfilments: count(fulfilments),
        refunds: count(refunds),
        orphans: children - count(variants) - count(lines) - count(fulfilments) - count(refunds)
      }
      return written
    })
  )
})
