import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { gidOf } from "../../stores/domain/Mirror.ts"
import { mirrorOne } from "../../stores/use-cases/webhooks.ts"
import {
  type EditInput,
  htmlOf,
  priceAt,
  ProductChange,
  ProductsRestore,
  type RepriceInput,
  RepriceResult,
  type StatusInput
} from "../domain/Commands.ts"
import { type Row, SELECT, toRow } from "./products.ts"

/*
 * The product commands (M7.3; api.md §2.5), at `products` Bewerken (archiving at Beheren), inside the role's stores.
 * Each changes the mirror at once, records the change, and tells Shopify once the undo window has passed, with one
 * undo token per command (`Shared.undo` restores what was). The cost price is Insyte's own: a change to it alone
 * reaches no one outside Insyte. "Synchroniseren vanuit Shopify" reads the product again.
 */

const RESTORE = "products.restore"
type Field = "title" | "description" | "status" | "price"

interface Locked {
  readonly id: string
  readonly storeId: string
  readonly shopifyId: string
  readonly title: string
  readonly descriptionHtml: string
  readonly status: "active" | "draft" | "archived"
  readonly costMinor: string | null
  readonly prices: ReadonlyArray<{ id: string; priceMinor: number }>
}

/** The products with their variants' prices, locked, inside the role's stores; any one missing is `NotFound`. */
const lock = Effect.fn("Products.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* inScope(sql, "p.store_id")
  const rows = yield* sql<Locked>`
    select p.id, p.store_id, p.shopify_id, p.title, p.description_html, p.status, p.cost_minor,
           coalesce((select json_agg(json_build_object('id', v.id, 'priceMinor', v.price_minor) order by v.position)
                     from variants v where v.product_id = p.id), '[]') as prices
    from products p where p.id in ${sql.in([...new Set(ids)])} and ${scope} order by p.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "product", id: missing })
  return rows
})

const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  Effect.map(
    sql<Row>`select ${sql.literal(SELECT)} from products p join stores s on s.id = p.store_id
             where p.id in ${sql.in([...ids])} order by p.title, p.id`,
    (rows) => rows.map(toRow)
  )

const audit = (sql: SqlClient.SqlClient, action: string, productId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "product",
        subjectId: productId,
        diff
      })
  )

/** One price for every variant: a product priced apart per variant is priced in Shopify. */
const samePrice = (p: Locked) => new Set(p.prices.map((v) => Number(v.priceMinor))).size <= 1

/**
 * The undo token, and the outbox event for Shopify where a Shopify field changed (none for the cost price alone).
 * Answers the outbox id to kick after commit.
 */
const later = Effect.fn("Products.later")(function*(
  sql: SqlClient.SqlClient,
  productIds: ReadonlyArray<string>,
  fields: ReadonlySet<Field>,
  restore: ProductsRestore
) {
  const p = yield* CurrentPrincipal
  const outboxId = fields.size === 0 ? null : yield* Outbox.write(sql, p.workspaceId, {
    type: "product.updated",
    workspaceId: p.workspaceId,
    userId: p.userId ?? p.id,
    productIds: [...productIds],
    fields: [...fields]
  }, { afterSeconds: UNDO_SECONDS })
  const undo = yield* Undo.issue(sql, {
    command: RESTORE,
    compensation: restore,
    outboxIds: outboxId === null ? [] : [outboxId]
  })
  return { outboxId, undo }
})

/** The product page's draft: what changed, saved together. */
export const edit = Effect.fn("Products.edit")(function*(input: typeof EditInput.Type) {
  yield* Policy.require("products", input.status === "archived" ? 3 : 2)
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* lock(sql, [input.id])
      const p = before!
      const fields = new Set<Field>()
      const restore: ProductsRestore["products"][number] = { id: p.id }
      const diff: Record<string, unknown> = {}
      const description = input.description === undefined ? undefined : htmlOf(input.description)

      if (input.title !== undefined && input.title.trim() !== p.title) {
        yield* sql`update products set title = ${input.title.trim()} where id = ${p.id}`
        Object.assign(restore, { title: p.title })
        diff["title"] = [p.title, input.title.trim()]
        fields.add("title")
      }
      if (description !== undefined && description !== p.descriptionHtml) {
        yield* sql`update products set description_html = ${description} where id = ${p.id}`
        Object.assign(restore, { descriptionHtml: p.descriptionHtml })
        fields.add("description")
      }
      if (input.status !== undefined && input.status !== p.status) {
        yield* sql`update products set status = ${input.status} where id = ${p.id}`
        Object.assign(restore, { status: p.status })
        diff["status"] = [p.status, input.status]
        fields.add("status")
      }
      if (input.priceMinor !== undefined && p.prices.some((v) => Number(v.priceMinor) !== input.priceMinor)) {
        if (!samePrice(p)) return yield* new Conflict({ entity: "product", reason: "variant_prices" })
        yield* sql`update variants set price_minor = ${input.priceMinor} where product_id = ${p.id}`
        Object.assign(restore, { variantPrices: p.prices.map((v) => ({ id: v.id, priceMinor: Number(v.priceMinor) })) })
        diff["priceMinor"] = [Number(p.prices[0]?.priceMinor ?? 0), input.priceMinor]
        fields.add("price")
      }
      const cost = p.costMinor === null ? null : Number(p.costMinor)
      const costChanged = input.costMinor !== undefined && input.costMinor !== cost
      if (costChanged) {
        yield* sql`update products set cost_minor = ${input.costMinor ?? null} where id = ${p.id}`
        Object.assign(restore, { costMinor: cost })
        diff["costMinor"] = [cost, input.costMinor]
      }
      if (fields.size === 0 && !costChanged) {
        return { change: new ProductChange({ products: [], undo: null }), outboxId: null }
      }
      yield* audit(sql, "product.edited", p.id, diff)
      const { outboxId, undo } = yield* later(sql, [p.id], fields, { products: [restore] })
      return { change: new ProductChange({ products: yield* rowsOf(sql, [p.id]), undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** Active, concept or archived, for many at once (archiving at Beheren). */
export const setStatus = Effect.fn("Products.setStatus")(function*(input: typeof StatusInput.Type) {
  yield* Policy.require("products", input.status === "archived" ? 3 : 2)
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const changed = (yield* lock(sql, input.ids)).filter((p) => p.status !== input.status)
      if (changed.length === 0) return { change: new ProductChange({ products: [], undo: null }), outboxId: null }
      for (const p of changed) {
        yield* sql`update products set status = ${input.status} where id = ${p.id}`
        yield* audit(sql, "product.status_changed", p.id, { status: [p.status, input.status] })
      }
      const ids = changed.map((p) => p.id)
      const { outboxId, undo } = yield* later(sql, ids, new Set<Field>(["status"]), {
        products: changed.map((p) => ({ id: p.id, status: p.status }))
      })
      return { change: new ProductChange({ products: yield* rowsOf(sql, ids), undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * "Marges herberekenen": each price at the target margin over its cost, rounded to the whole unit. Without `apply` it
 * answers the preview; with it, the prices change together, with one undo. A product without a cost price, or priced
 * apart per variant, keeps its price and says why.
 */
export const reprice = Effect.fn("Products.reprice")(function*(input: typeof RepriceInput.Type) {
  yield* Policy.require("products", 2)
  const relay = yield* Relay
  const db = yield* Db
  const { result, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const rows = locked.map((p) => {
        const price = p.prices[0] === undefined ? null : Number(p.prices[0].priceMinor)
        if (p.costMinor === null) return { id: p.id, priceMinor: price, nextMinor: null, skipped: "no_cost" as const }
        if (!samePrice(p)) return { id: p.id, priceMinor: price, nextMinor: null, skipped: "variants" as const }
        return {
          id: p.id,
          priceMinor: price,
          nextMinor: priceAt(Number(p.costMinor), input.targetMargin),
          skipped: null
        }
      })
      const changing = rows.filter((r) => r.nextMinor !== null && r.nextMinor !== r.priceMinor)
      if (!input.apply || changing.length === 0) {
        return { result: new RepriceResult({ rows, undo: null }), outboxId: null }
      }
      for (const r of changing) {
        yield* sql`update variants set price_minor = ${r.nextMinor} where product_id = ${r.id}`
        yield* audit(sql, "product.repriced", r.id, {
          priceMinor: [r.priceMinor, r.nextMinor],
          targetMargin: input.targetMargin
        })
      }
      const ids = new Set(changing.map((r) => r.id))
      const { outboxId, undo } = yield* later(sql, [...ids], new Set<Field>(["price"]), {
        products: locked.filter((p) => ids.has(p.id)).map((p) => ({
          id: p.id,
          variantPrices: p.prices.map((v) => ({ id: v.id, priceMinor: Number(v.priceMinor) }))
        }))
      })
      return { result: new RepriceResult({ rows, undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return result
})

/** "Synchroniseren vanuit Shopify": the product read again as Shopify holds it. */
export const sync = Effect.fn("Products.sync")(function*(id: string) {
  yield* Policy.require("products", 2)
  const db = yield* Db
  const [target] = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "p.store_id")
      return yield* sql<{ id: string; connectionId: string; shop: string; currency: string | null; shopifyId: string }>`
        select s.id, s.connection_id, s.shop_domain as shop, s.currency, p.shopify_id
        from products p join stores s on s.id = p.store_id where p.id = ${id} and ${scope}`
    })
  )
  if (target === undefined) return yield* new NotFound({ entity: "product", id })
  const principal = yield* CurrentPrincipal
  yield* mirrorOne(target, "Product", gidOf("Product", target.shopifyId)).pipe(
    Effect.provideService(CurrentWorkspace, { id: principal.workspaceId }),
    Effect.catchTags({
      TokenRefused: () => Effect.fail(new Conflict({ entity: "store", reason: "disconnected" })),
      ShopifyRefused: () => Effect.fail(new Conflict({ entity: "store", reason: "shopify_unreachable" })),
      ShopifyThrottled: () => Effect.fail(new Conflict({ entity: "store", reason: "shopify_busy" }))
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(ProductsRestore)

/** `Shared.undo` of a product command: each product's fields as they were, before Shopify heard of the change. */
export const restore = Effect.fn("Products.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const { products } = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("products", products.some((p) => p.status === "archived") ? 3 : 2)
  yield* lock(sql, products.map((p) => p.id)).pipe(
    Effect.catchTag("NotFound", () => Effect.fail(new Conflict({ entity: "product", reason: "gone" })))
  )
  for (const p of products) {
    if (p.title !== undefined) yield* sql`update products set title = ${p.title} where id = ${p.id}`
    if (p.descriptionHtml !== undefined) {
      yield* sql`update products set description_html = ${p.descriptionHtml} where id = ${p.id}`
    }
    if (p.status !== undefined) yield* sql`update products set status = ${p.status} where id = ${p.id}`
    if (p.costMinor !== undefined) yield* sql`update products set cost_minor = ${p.costMinor} where id = ${p.id}`
    for (const v of p.variantPrices ?? []) {
      yield* sql`update variants set price_minor = ${v.priceMinor} where id = ${v.id} and product_id = ${p.id}`
    }
    yield* audit(sql, "product.restored", p.id)
  }
})
