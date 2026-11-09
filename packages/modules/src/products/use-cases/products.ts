import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { ListInput } from "../../shared/domain/Filter.ts"
import { likePattern, SearchHit } from "../../shared/domain/Search.ts"
import { compileFilter, decodeCursor, encodeCursor, type Whitelist } from "../../shared/tables/FilterSql.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { ProductDetail, ProductPage, ProductRow } from "../domain/Products.ts"

/*
 * `Products.list` and `Products.get` (M6.4): at `products` Bekijken, inside the role's stores. By title, keyset on
 * `(lower(title), id)`; the search matches the title, the handle and a variant's SKU.
 */

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
  readonly externalUpdatedAt: Date
}

export const toRow = (r: Row) =>
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
    updatedAt: r.externalUpdatedAt.getTime()
  })

export const SELECT =
  `p.id, p.store_id, p.shopify_id, p.title, p.handle, p.status, p.vendor, p.product_type, p.tags, p.images,
  p.external_updated_at, p.cost_minor, s.currency,
  (select count(*) from variants v where v.product_id = p.id)::int as variant_count,
  (select v.sku from variants v where v.product_id = p.id and v.sku is not null order by v.position limit 1) as sku,
  (select min(v.price_minor) from variants v where v.product_id = p.id) as price_min,
  (select max(v.price_minor) from variants v where v.product_id = p.id) as price_max,
  (select sum(i.available) from inventory_levels i join variants v on v.id = i.variant_id
     where v.product_id = p.id and i.source = 'shopify')::int as available`

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
      return new ProductPage({
        rows: shown.map(toRow),
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
        available: number | null
      }>`
        select v.id, v.title, v.sku, v.price_minor, v.compare_at_minor, v.position,
               (select sum(i.available) from inventory_levels i where i.variant_id = v.id and i.source = 'shopify')::int
                 as available
        from variants v where v.product_id = ${id} order by v.position`
      return new ProductDetail({
        product: toRow(row),
        images: row.images,
        descriptionHtml: row.descriptionHtml,
        variants: variants.map((v) => ({
          ...v,
          priceMinor: Number(v.priceMinor),
          compareAtMinor: v.compareAtMinor === null ? null : Number(v.compareAtMinor)
        }))
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
