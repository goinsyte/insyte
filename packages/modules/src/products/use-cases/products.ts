import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { ListInput } from "../../shared/domain/Filter.ts"
import { likePattern, SearchHit } from "../../shared/domain/Search.ts"
import { compileFilter, decodeCursor, encodeCursor, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  LOW_STOCK,
  type LowStockInput,
  LowStockPage,
  LowStockRow,
  ProductDetail,
  ProductPage,
  ProductRow,
  type StockLevel
} from "../domain/Products.ts"

/*
 * `Products.list` and `Products.get` (M6.4): at `products` Bekijken, inside the role's stores. By title, keyset on
 * `(lower(title), id)`; the search matches the title, the handle and a variant's SKU.
 *
 * Stock is Shopify's count (the import's, then `inventory_levels/update`), over the variants Shopify tracks and that
 * have a count: each location at nothing or more (a negative count is an oversell, not stock), summed. A product's
 * level is read against the low-stock threshold by its emptiest such variant, and it is out when they are all at
 * nothing; a product with no counted variant has no level. A supplier's own report (M16) is its own, not counted here.
 * The average delivery time is over the product's last delivered orders, from order to the last parcel's arrival.
 * `Products.lowStock` (M7 9.3) is what runs low, with the pace it sells at.
 */

/** How many of a product's last delivered orders its average delivery time is over. */
const DELIVERIES = 20
/** How many of its last mirrored order lines those are looked for in. */
const RECENT_LINES = 60
/** An order still open after this many days is not counted as open by the low-stock list. */
const OPEN_DAYS = 90

/** Each counted variant's units: tracked, with at least one Shopify count, each count at nothing or more. */
const VARIANT_UNITS = `select sum(greatest(i.available, 0)) as units from variants v
     join inventory_levels i on i.variant_id = v.id and i.source = 'shopify'
     where v.product_id = p.id and v.tracked is not false group by v.id`

export const PRODUCT_FIELDS: Whitelist = {
  status: { column: "p.status", type: "option" },
  store_id: { column: "p.store_id", type: "option" },
  vendor: { column: "p.vendor", type: "option" },
  product_type: { column: "p.product_type", type: "option" },
  title: { column: "p.title", type: "text" },
  tags: { column: "p.tags", type: "tags" }
}

export interface Row {
  readonly id: string
  readonly storeId: string
  readonly shopifyId: string
  readonly title: string
  readonly handle: string
  readonly status: ProductRow["status"]
  readonly vendor: string | null
  readonly productType: string | null
  readonly tags: ReadonlyArray<string>
  readonly images: ReadonlyArray<string>
  readonly variantCount: number
  readonly sku: string | null
  readonly priceMin: string | null
  readonly priceMax: string | null
  readonly costMinor: string | null
  readonly currency: string | null
  readonly available: number | null
  readonly lowest: number | null
  readonly supplierId: string | null
  readonly supplierName: string | null
  readonly leadDays: number | null
  readonly externalUpdatedAt: Date
}

/** Out when every counted variant is at nothing, low by its emptiest one, else in stock; nothing without a count. */
export const levelOf = (available: number | null, lowest: number | null, threshold: number): StockLevel | null =>
  available === null || lowest === null
    ? null
    : available <= 0
    ? "out"
    : lowest <= threshold
    ? "low"
    : "available"

export const toRow = (r: Row, delivery?: ReadonlyMap<string, number>) =>
  new ProductRow({
    id: r.id,
    storeId: r.storeId,
    shopifyId: r.shopifyId,
    title: r.title,
    handle: r.handle,
    status: r.status,
    vendor: r.vendor,
    productType: r.productType,
    tags: r.tags,
    image: r.images[0] ?? null,
    variantCount: r.variantCount,
    sku: r.sku,
    priceMinMinor: r.priceMin === null ? null : Number(r.priceMin),
    priceMaxMinor: r.priceMax === null ? null : Number(r.priceMax),
    costMinor: r.costMinor === null ? null : Number(r.costMinor),
    currency: r.currency ?? "EUR",
    available: r.available,
    stock: levelOf(r.available, r.lowest, LOW_STOCK),
    avgDeliveryDays: delivery?.get(r.id) ?? null,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    leadDays: r.leadDays,
    updatedAt: r.externalUpdatedAt.getTime()
  })

export const SELECT =
  `p.id, p.store_id, p.shopify_id, p.title, p.handle, p.status, p.vendor, p.product_type, p.tags, p.images,
  p.external_updated_at, p.cost_minor, s.currency,
  (select count(*) from variants v where v.product_id = p.id)::int as variant_count,
  (select v.sku from variants v where v.product_id = p.id and v.sku is not null order by v.position limit 1) as sku,
  (select min(v.price_minor) from variants v where v.product_id = p.id) as price_min,
  (select max(v.price_minor) from variants v where v.product_id = p.id) as price_max,
  (select sum(u.units) from (${VARIANT_UNITS}) u)::int as available,
  (select min(u.units) from (${VARIANT_UNITS}) u)::int as lowest,
  (select ps.lead_days from product_supply ps where ps.product_id = p.id and ps.is_primary) as lead_days,
  (select ps.supplier_id from product_supply ps where ps.product_id = p.id and ps.is_primary) as supplier_id,
  (select x.name from product_supply ps join suppliers x on x.id = ps.supplier_id
     where ps.product_id = p.id and ps.is_primary) as supplier_name`

/**
 * Days from order to doorstep per product, over each one's last delivered orders among its last mirrored lines (every
 * live parcel arrived, by AfterShip's word where it tracks the parcel, else Shopify's), rounded to a tenth.
 */
export const deliveryDays = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed(new Map<string, number>()) : sql<{ productId: string; days: number }>`
    with mine as (
      select distinct x.product_id, l.order_id from unnest(${[...ids]}::text[]) as x(product_id)
      cross join lateral (
        select l.order_id from order_lines l where l.product_id = x.product_id
        order by l.order_id desc limit ${RECENT_LINES}
      ) l
    ),
    arrived as (
      select m.product_id, o.placed_at, max(coalesce(d.delivered_at, f.delivered_at)) as at
      from mine m join orders o on o.id = m.order_id
      join fulfilments f on f.order_id = o.id and f.status not in ('cancelled', 'error', 'failure')
      left join deliveries d on d.fulfilment_id = f.id
      where not o.is_draft and o.status <> 'cancelled'
      group by m.product_id, o.id, o.placed_at
      having bool_and(coalesce(d.delivered_at, f.delivered_at) is not null)
    ),
    recent as (
      select product_id, at, placed_at,
             row_number() over (partition by product_id order by placed_at desc) as n
      from arrived
    )
    select product_id, round(avg(extract(epoch from at - placed_at) / 86400)::numeric, 1)::float8 as days
    from recent where n <= ${DELIVERIES} and at >= placed_at group by product_id`.pipe(
    Effect.map((rows) => new Map(rows.map((r) => [r.productId, Number(r.days)])))
  )

const searchOf = (sql: SqlClient.SqlClient, q: string | undefined) => {
  const text = q?.trim() ?? ""
  if (text === "") return sql`true`
  const pattern = `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  return sql`(p.title ilike ${pattern} or p.handle ilike ${pattern}
              or exists (select 1 from variants v where v.product_id = p.id and v.sku ilike ${pattern}))`
}

export const list = Effect.fn("Products.list")(function*(input: ListInput) {
  yield* Policy.require("products", 1)
  const db = yield* Db
  const limit = input.limit ?? 50
  const after = yield* decodeCursor(input.cursor)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id", input.storeId)
      const filter = yield* compileFilter(sql, input.filter, PRODUCT_FIELDS)
      const search = searchOf(sql, input.q)
      const page = after === undefined
        ? sql`true`
        : sql`(lower(p.title), p.id) > (${String(after[0])}, ${String(after[1])})`
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from products p join stores s on s.id = p.store_id
        where ${scope} and ${filter} and ${search} and ${page}
        order by lower(p.title), p.id limit ${limit + 1}`
      const [total] = yield* sql<{ n: number }>`
        select count(*)::int as n from products p where ${scope} and ${filter} and ${search}`
      const facets = yield* sql<{ status: string; n: number }>`
        select p.status, count(*)::int as n from products p where ${scope} and ${search} group by p.status`
      const shown = rows.slice(0, limit)
      const last = shown.at(-1)
      const delivery = yield* deliveryDays(sql, shown.map((r) => r.id))
      return new ProductPage({
        rows: shown.map((r) => toRow(r, delivery)),
        nextCursor: rows.length > limit && last !== undefined
          ? encodeCursor([last.title.toLowerCase(), last.id])
          : null,
        counts: { total: total?.n ?? 0, status: Object.fromEntries(facets.map((f) => [f.status, f.n])) }
      })
    })
  )
})

export const get = Effect.fn("Products.get")(function*(id: string) {
  yield* Policy.require("products", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id")
      const [row] = yield* sql<Row & { descriptionHtml: string }>`
        select ${sql.literal(SELECT)}, p.description_html from products p join stores s on s.id = p.store_id
        where p.id = ${id} and ${scope}`
      if (row === undefined) return yield* new NotFound({ entity: "product", id })
      const variants = yield* sql<{
        id: string
        title: string
        sku: string | null
        priceMinor: string
        compareAtMinor: string | null
        position: number
        tracked: boolean | null
        available: number | null
      }>`
        select v.id, v.title, v.sku, v.price_minor, v.compare_at_minor, v.position, v.tracked,
               (case when v.tracked is false then null else
                 (select sum(greatest(i.available, 0)) from inventory_levels i
                    where i.variant_id = v.id and i.source = 'shopify') end)::int as available
        from variants v where v.product_id = ${id} order by v.position`
      const levels = yield* sql<
        { variantId: string; locationId: string; source: "shopify" | "supplier"; available: number; reportedAt: Date }
      >`
        select i.variant_id, i.location_id, i.source, i.available, i.reported_at
        from inventory_levels i join variants v on v.id = i.variant_id
        where v.product_id = ${id}
        order by (i.source = 'shopify') desc, i.available desc, i.location_id`
      // From the store's orders of the last 30 days (`orders_list`), not every line the product ever had.
      const [sold] = yield* sql<{ n: number }>`
        select coalesce(sum(l.quantity), 0)::int as n from orders o join order_lines l on l.order_id = o.id
        where o.store_id = ${row.storeId} and o.placed_at > now() - interval '30 days'
          and not o.is_draft and o.status <> 'cancelled' and l.product_id = ${id}`
      const delivery = yield* deliveryDays(sql, [id])
      return new ProductDetail({
        product: toRow(row, delivery),
        images: row.images,
        descriptionHtml: row.descriptionHtml,
        variants: variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          position: v.position,
          tracked: v.tracked !== false,
          available: v.available,
          priceMinor: Number(v.priceMinor),
          compareAtMinor: v.compareAtMinor === null ? null : Number(v.compareAtMinor),
          levels: levels.filter((l) => l.variantId === v.id).map((l) => ({
            locationId: l.locationId,
            source: l.source,
            available: l.available,
            reportedAt: l.reportedAt.getTime()
          }))
        })),
        soldLast30: sold?.n ?? 0,
        lowStockAt: LOW_STOCK
      })
    })
  )
})

/**
 * What runs low (M7 9.3): the principal's active products (in one store, if named) whose emptiest counted variant is
 * at or under the threshold, the workspace's default unless the caller names one, with what they sold in the last 30
 * days, the orders of the last 90 days they are in that are still open, and how long they last at that pace. Draft
 * and archived products, untracked variants and variants without a count are left out. Sold out first, then the
 * soonest to run out, then the fewest left; the page is cut in SQL.
 */
export const lowStock = Effect.fn("Products.lowStock")(function*(input: LowStockInput) {
  yield* Policy.require("products", 1)
  const db = yield* Db
  const threshold = input.threshold ?? LOW_STOCK
  const limit = input.limit ?? 50
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id", input.storeId)
      const rows = yield* sql<{
        productId: string
        storeId: string
        title: string
        images: ReadonlyArray<string>
        status: LowStockRow["status"]
        available: number
        variants: ReadonlyArray<{ id: string; title: string; sku: string | null; available: number }>
        soldLast30: number
        openOrders: number
        daysLeft: number | null
        supplierId: string | null
        supplierName: string | null
        leadDays: number | null
      }>`
        with stock as (
          select v.product_id, v.id, v.title, v.sku, v.position, sum(greatest(i.available, 0))::int as available
          from products p join variants v on v.product_id = p.id
          join inventory_levels i on i.variant_id = v.id and i.source = 'shopify'
          where ${scope} and p.status = 'active' and v.tracked is not false
          group by v.product_id, v.id, v.title, v.sku, v.position
        ),
        low as (
          select product_id, sum(available)::int as available,
                 jsonb_agg(jsonb_build_object('id', id, 'title', title, 'sku', sku, 'available', available)
                           order by available, position) filter (where available <= ${threshold}) as variants
          from stock group by product_id
          having min(available) <= ${threshold}
        ),
        pace as (
          select l.product_id,
                 coalesce(sum(l.quantity) filter (where o.placed_at > now() - interval '30 days'
                                                    and o.status <> 'cancelled'), 0)::int as sold,
                 (count(distinct l.order_id) filter (where o.status not in ('delivered', 'cancelled', 'refunded')))::int
                   as open
          from orders o join order_lines l on l.order_id = o.id
          where o.placed_at > now() - make_interval(days => ${OPEN_DAYS}) and not o.is_draft
            and l.product_id in (select product_id from low)
          group by l.product_id
        ),
        judged as (
          select low.*, coalesce(pace.sold, 0) as sold, coalesce(pace.open, 0) as open,
                 case when coalesce(pace.sold, 0) = 0 then null else low.available / (pace.sold / 30.0) end as days_left
          from low left join pace on pace.product_id = low.product_id
        )
        select p.id as product_id, p.store_id, p.title, p.images, p.status, j.available, j.variants,
               j.sold as sold_last30, j.open as open_orders, j.days_left::float8 as days_left,
               ps.supplier_id, su.name as supplier_name, ps.lead_days
        from judged j join products p on p.id = j.product_id
        left join product_supply ps on ps.product_id = p.id and ps.is_primary
        left join suppliers su on su.id = ps.supplier_id
        order by (j.available <= 0) desc, j.days_left asc nulls last, j.available, lower(p.title), p.id
        limit ${limit}`
      return new LowStockPage({
        threshold,
        rows: rows.map((r) =>
          new LowStockRow({
            productId: r.productId,
            storeId: r.storeId,
            title: r.title,
            image: r.images[0] ?? null,
            status: r.status,
            level: r.available <= 0 ? "out" : "low",
            available: r.available,
            variants: r.variants,
            soldLast30: r.soldLast30,
            openOrders: r.openOrders,
            daysLeft: r.daysLeft === null ? null : Number(r.daysLeft),
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            leadDays: r.leadDays
          })
        )
      })
    })
  )
})

/** Up to `limit` matches for `Search.records`; nothing for a role without the area. */
export const search = Effect.fn("Products.search")(function*(q: string, limit: number) {
  const allowed = yield* Policy.require("products", 1).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )
  if (!allowed || q.trim() === "") return [] as Array<SearchHit>
  const db = yield* Db
  const pattern = likePattern(q)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id")
      const rows = yield* sql<{ id: string; title: string; subtitle: string | null }>`
        select p.id, p.title, p.vendor as subtitle from products p
        where ${scope} and (p.title ilike ${pattern}
          or exists (select 1 from variants v where v.product_id = p.id and v.sku ilike ${pattern}))
        order by lower(p.title) limit ${limit}`
      return rows.map((r) =>
        new SearchHit({ kind: "product", id: r.id, title: r.title, subtitle: r.subtitle, href: `/products/${r.id}` })
      )
    })
  )
})
