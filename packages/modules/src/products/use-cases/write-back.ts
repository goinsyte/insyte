import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { SqlError } from "effect/sql"
import { type CreateRefusal, refusalOf } from "../../shared/domain/ShopifyCreates.ts"
import type { CreateSent, ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId, gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope, type ShopifyRefused } from "../../stores/domain/Ports.ts"
import { StoreMirror } from "../../stores/Mirror.ts"
import {
  PRODUCT_DELETE,
  PRODUCT_FIND,
  PRODUCT_SET,
  PRODUCT_UPDATE,
  productSetInput,
  STATUS,
  VARIANTS_UPDATE
} from "../domain/WriteBack.ts"

/*
 * Shopify hears what changed on a product in Insyte (M7.3), one product per step of the `ShopifyWrite` Workflow, once
 * the undo window has passed. The values are read as they are now, so two edits inside the window go as one. Shopify
 * refusing reads the product again from Shopify and records the refusal; throttled or unreachable, the step retries.
 */

interface Target {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
  readonly shopifyId: string
  readonly title: string
  readonly descriptionHtml: string
  readonly productStatus: string
  readonly variants: ReadonlyArray<{ shopifyId: string; priceMinor: number }>
}

/** Sends one product's change to Shopify; answers what became of it. */
export const productWriteBack = Effect.fn("Products.writeBack")(function*(
  write: Extract<ShopifyWrite, { type: "product.updated" }>,
  productId: string
) {
  const db = yield* Db
  const [target] = yield* db.scopedFor((sql) =>
    sql<Target>`
      select s.id as store_id, s.connection_id, s.shop_domain as shop, s.currency, s.status, p.shopify_id, p.title,
             p.description_html, p.status as product_status,
             coalesce((select json_agg(json_build_object('shopifyId', v.shopify_id, 'priceMinor', v.price_minor))
                       from variants v where v.product_id = p.id), '[]') as variants
      from products p join stores s on s.id = p.store_id where p.id = ${productId}`
  )
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: productId,
    outcome: o,
    reason
  })
  if (target === undefined) return outcome("skipped", "gone")
  if (target.status !== "connected" && target.status !== "connecting") return outcome("skipped", "disconnected")
  // Made in Insyte and not yet in Shopify: its create sends the values as they are then.
  if (target.shopifyId.startsWith("insyte-")) return outcome("skipped", "not_created")
  const gid = gidOf("Product", target.shopifyId)
  const fields = new Set(write.fields)
  const currency = target.currency ?? "EUR"

  const send = Effect.gen(function*() {
    if (fields.has("title") || fields.has("description") || fields.has("status")) {
      const product = {
        id: gid,
        ...(fields.has("title") ? { title: target.title } : {}),
        ...(fields.has("description") ? { descriptionHtml: target.descriptionHtml } : {}),
        ...(fields.has("status") ? { status: STATUS[target.productStatus] } : {})
      }
      const { errors } = yield* mutate(target, PRODUCT_UPDATE, { product }, "productUpdate")
      if (errors.length > 0) return errors
    }
    if (fields.has("price") && target.variants.length > 0) {
      const variants = target.variants.map((v) => ({
        id: `gid://shopify/ProductVariant/${v.shopifyId}`,
        price: fromMinor(Number(v.priceMinor), currency)
      }))
      return (yield* mutate(target, VARIANTS_UPDATE, { productId: gid, variants }, "productVariantsBulkUpdate")).errors
    }
    return []
  })

  const answer = yield* send.pipe(
    Effect.map((errors) => errors.length === 0 ? null : errors.map((e) => e.message).join("; ")),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed("disconnected" as const),
      ShopifyRefused: (error) =>
        isAnswer(error)
          ? Effect.succeed(error.reason)
          : Effect.flatMap(
            error.status === 401
              ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(target.connectionId))
              : Effect.void,
            () => Effect.fail(error)
          )
    })
  )
  if (answer === null) return outcome("sent")
  if (answer === "disconnected") return outcome("skipped", "disconnected")

  const store = { id: target.storeId, connectionId: target.connectionId, shop: target.shop, currency: target.currency }
  yield* (yield* StoreMirror).mirrorOne(store, "Product", gid)
  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
      action: "product.shopify_refused",
      subjectType: "product",
      subjectId: productId,
      diff: { fields: [...fields], reason: answer.slice(0, 300) }
    })
  )
  return outcome("refused", answer)
})

interface Made {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
  readonly shopifyId: string
  readonly title: string
  readonly handle: string
  readonly descriptionHtml: string
  readonly productStatus: string
  readonly variantId: string | null
  readonly sku: string | null
  readonly priceMinor: string | null
}

type Errors = ReadonlyArray<{ readonly field?: ReadonlyArray<string> | null; readonly message: string }>
type Refused = { readonly reason: CreateRefusal; readonly text: string }

/** Shopify's 4xx about the product as a refusal; a scope the store lacks as its own; anything else is tried again. */
const refusal = (t: { readonly connectionId: string }) => (error: ShopifyRefused) => {
  const scope = missingScope(error)
  if (scope !== undefined) return Effect.succeed<Refused>({ reason: "scope", text: scope })
  return isAnswer(error)
    ? Effect.succeed<Refused>({ reason: refusalOf([{ message: error.reason }]), text: error.reason })
    : Effect.flatMap(
      error.status === 401
        ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(t.connectionId))
        : Effect.void,
      () => Effect.fail(error)
    )
}

/** What Shopify made for a new product, in which store: the adopt step's input. */
export interface ProductMade {
  readonly storeId: string
  readonly product: string
  readonly variant: string | null
  readonly inventoryItem: string | null
}

type Node = { readonly id: string; readonly variants?: { readonly nodes?: ReadonlyArray<VariantNode> } } | null
type VariantNode = { readonly id: string; readonly inventoryItem?: { readonly id: string } | null }

const madeOf = (storeId: string, node: NonNullable<Node>): ProductMade => {
  const variant = node.variants?.nodes?.[0]
  return {
    storeId,
    product: node.id,
    variant: variant?.id ?? null,
    inventoryItem: variant?.inventoryItem?.id ?? null
  }
}

const outcomeOf = (id: string) => (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
  id,
  outcome: o,
  reason
})

/**
 * A product made in Insyte, made in Shopify (M7.3) once the undo window has passed, the first step of two: the one a
 * try before made, found by the handle Insyte gave it, else `productSet` with its title, description, status and its
 * one variant's price and SKU, in one call. Shopify refusing the product removes it from Insyte, since it never
 * existed there, and whoever made it hears why.
 */
export const productCreateSend = Effect.fn("Products.createSend")(function*(
  write: Extract<ShopifyWrite, { type: "product.created" }>,
  productId: string
) {
  const db = yield* Db
  const outcome = outcomeOf(productId)
  const [t] = yield* db.scopedFor((sql) =>
    sql<Made>`
      select s.id as store_id, s.connection_id, s.shop_domain as shop, s.currency, s.status, p.shopify_id, p.title,
             p.handle, p.description_html, p.status as product_status, v.id as variant_id, v.sku, v.price_minor
      from products p join stores s on s.id = p.store_id
      left join lateral (select id, sku, price_minor from variants where product_id = p.id order by position limit 1) v
        on true
      where p.id = ${productId}`
  )
  if (t === undefined) return { outcome: outcome("skipped", "gone") } satisfies CreateSent<ProductMade>
  if (t.status !== "connected" && t.status !== "connecting") {
    return { outcome: outcome("skipped", "disconnected") } satisfies CreateSent<ProductMade>
  }
  // Already Shopify's (its adopt step ran): its price and SKU went with it.
  if (!t.shopifyId.startsWith("insyte-")) return { outcome: outcome("sent") } satisfies CreateSent<ProductMade>

  const input = productSetInput({
    title: t.title,
    handle: t.handle,
    descriptionHtml: t.descriptionHtml,
    status: t.productStatus,
    price: fromMinor(Number(t.priceMinor ?? 0), t.currency ?? "EUR"),
    sku: t.sku
  })
  const sent = yield* Effect.gen(function*() {
    const found = yield* mutate(t, PRODUCT_FIND, { handle: t.handle }, "productByIdentifier")
    const earlier = (found.data as { productByIdentifier?: Node } | null)?.productByIdentifier
    if (earlier !== null && earlier !== undefined) return { made: madeOf(t.storeId, earlier) }
    const answered = yield* mutate(t, PRODUCT_SET, { input, synchronous: true }, "productSet")
    const errors = answered.errors as Errors
    if (errors.length > 0) {
      return { refused: { reason: refusalOf(errors), text: errors.map((e) => e.message).join("; ") } }
    }
    const node = (answered.data as { productSet?: { product?: Node } } | null)?.productSet?.product
    return node === null || node === undefined
      ? { refused: { reason: "other", text: "no product" } as Refused }
      : { made: madeOf(t.storeId, node) }
  }).pipe(Effect.catchTags({
    TokenRefused: () => Effect.succeed("disconnected" as const),
    ShopifyRefused: (error) => Effect.map(refusal(t)(error), (refused) => ({ refused }))
  }))
  if (sent === "disconnected") return { outcome: outcome("skipped", "disconnected") } satisfies CreateSent<ProductMade>
  if ("made" in sent) return { made: sent.made } satisfies CreateSent<ProductMade>

  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const gone = yield* sql`delete from products where id = ${productId} and shopify_id like 'insyte-%'
                              returning id`
      if (gone.length === 0) return
      yield* Outbox.write(sql, workspace.id, {
        type: "shopify.create_refused",
        workspaceId: workspace.id,
        userId: write.userId,
        subject: "product",
        subjectId: productId,
        label: t.title,
        reason: sent.refused.reason
      })
      yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "product.shopify_refused",
        subjectType: "product",
        subjectId: productId,
        diff: { change: "create", reason: sent.refused.reason, shopify: sent.refused.text.slice(0, 300) }
      })
    })
  )
  return { outcome: outcome("refused", sent.refused.reason) } satisfies CreateSent<ProductMade>
})

const isTaken = (error: unknown) => SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"

/**
 * The second step: the rows take Shopify's ids. Shopify's `products/create` echo may have mirrored the product as a row
 * of its own first; it gives way, and the row Insyte wrote, with its cost price and supplier, stays. An echo landing
 * while the ids are taken refuses the update by the store's unique index, and the step takes them again. Gone from
 * Insyte meanwhile (an undo from the agent log), the product is deleted in Shopify as well.
 */
export const productCreateAdopt = Effect.fn("Products.createAdopt")(function*(
  _write: Extract<ShopifyWrite, { type: "product.created" }>,
  productId: string,
  made: ProductMade
) {
  const db = yield* Db
  const outcome = outcomeOf(productId)
  const shopifyId = gidId(made.product)
  const variantShopifyId = made.variant === null ? null : gidId(made.variant)
  const take = (echoFirst: boolean) =>
    db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ shopifyId: string; variantId: string | null }>`
          select p.shopify_id,
                 (select id from variants where product_id = p.id order by position limit 1) as variant_id
          from products p where p.id = ${productId} for update of p`
        if (row === undefined) return false
        if (row.shopifyId === shopifyId) return true
        if (echoFirst) {
          yield* sql`delete from products where store_id = ${made.storeId} and shopify_id = ${shopifyId}
                     and id <> ${productId}`
          if (variantShopifyId !== null) {
            yield* sql`delete from variants where store_id = ${made.storeId} and shopify_id = ${variantShopifyId}
                       and product_id <> ${productId}`
          }
        }
        yield* sql`update products set shopify_id = ${shopifyId} where id = ${productId}`
        if (variantShopifyId !== null && row.variantId !== null) {
          yield* sql`update variants set shopify_id = ${variantShopifyId},
                       inventory_item_id = ${made.inventoryItem === null ? null : gidId(made.inventoryItem)}
                     where id = ${row.variantId}`
        }
        return true
      })
    )
  // Taken without looking first; the store's echo in the way, it gives way and the ids are taken again.
  let kept = yield* take(false).pipe(Effect.catchIf(isTaken, () => Effect.succeed(null)))
  for (let attempt = 0; kept === null && attempt < 3; attempt++) {
    kept = yield* take(true).pipe(Effect.catchIf(isTaken, () => Effect.succeed(null)))
  }
  // Still in the way after that: the refusal itself, and the step tries again.
  if (kept === null) kept = yield* take(true)
  if (kept) return outcome("sent")

  const [store] = yield* db.scopedFor((sql) =>
    sql<{ id: string; connectionId: string; shop: string; status: string }>`
      select id, connection_id, shop_domain as shop, status from stores where id = ${made.storeId}`
  )
  if (store === undefined) return outcome("skipped", "gone")
  if (store.status !== "connected" && store.status !== "connecting") return outcome("skipped", "disconnected")
  yield* mutate(store, PRODUCT_DELETE, { input: { id: made.product } }, "productDelete").pipe(
    Effect.catchTags({
      TokenRefused: () => Effect.void,
      ShopifyRefused: (error) => Effect.asVoid(refusal(store)(error))
    })
  )
  return outcome("skipped", "removed")
})
