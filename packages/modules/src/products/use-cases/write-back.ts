import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { type CreateRefusal, refusalOf } from "../../shared/domain/ShopifyCreates.ts"
import type { ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId, gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope, type ShopifyRefused } from "../../stores/domain/Ports.ts"
import { StoreMirror } from "../../stores/Mirror.ts"
import { PRODUCT_CREATE, PRODUCT_UPDATE, STATUS, VARIANTS_UPDATE } from "../domain/WriteBack.ts"

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

/**
 * A product made in Insyte, made in Shopify (M7.3) once the undo window has passed: `productCreate` with its title,
 * description and status, then its one variant's price and SKU. The rows take Shopify's ids, and a `products/create`
 * echo mirrored first gives way to them. Shopify refusing the product removes it from Insyte, since it never existed
 * there, and whoever made it hears why; refusing only the price reads the product again, as an edit does.
 */
export const productCreateWriteBack = Effect.fn("Products.createWriteBack")(function*(
  write: Extract<ShopifyWrite, { type: "product.created" }>,
  productId: string
) {
  const db = yield* Db
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: productId,
    outcome: o,
    reason
  })
  const [t] = yield* db.scopedFor((sql) =>
    sql<Made>`
      select s.id as store_id, s.connection_id, s.shop_domain as shop, s.currency, s.status, p.shopify_id, p.title,
             p.description_html, p.status as product_status, v.id as variant_id, v.sku, v.price_minor
      from products p join stores s on s.id = p.store_id
      left join lateral (select id, sku, price_minor from variants where product_id = p.id order by position limit 1) v
        on true
      where p.id = ${productId}`
  )
  if (t === undefined) return outcome("skipped", "gone")
  if (t.status !== "connected" && t.status !== "connecting") return outcome("skipped", "disconnected")
  // Already made (a step tried again after Shopify answered): nothing more to send.
  if (!t.shopifyId.startsWith("insyte-")) return outcome("sent")
  const currency = t.currency ?? "EUR"

  const product = { title: t.title, descriptionHtml: t.descriptionHtml, status: STATUS[t.productStatus] }
  type Created = { readonly id: string | null; readonly variant: { id: string; inventoryItem?: { id: string } } | null }
  const made = yield* Effect.gen(function*() {
    const answered = yield* mutate(t, PRODUCT_CREATE, { product }, "productCreate")
    const errors = answered.errors as Errors
    if (errors.length > 0) {
      return { refused: { reason: refusalOf(errors), text: errors.map((e) => e.message).join("; ") } }
    }
    const node = (answered.data as {
      productCreate?: {
        product?: { id: string; variants?: { nodes?: ReadonlyArray<{ id: string; inventoryItem?: { id: string } }> } }
      }
    })?.productCreate?.product
    return { created: { id: node?.id ?? null, variant: node?.variants?.nodes?.[0] ?? null } satisfies Created }
  }).pipe(Effect.catchTags({
    TokenRefused: () => Effect.succeed("disconnected" as const),
    ShopifyRefused: (error) => Effect.map(refusal(t)(error), (refused) => ({ refused }))
  }))
  if (made === "disconnected") return outcome("skipped", "disconnected")
  const workspace = yield* CurrentWorkspace

  if ("refused" in made) {
    const refused = made.refused
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const gone = yield* sql`delete from products where id = ${productId} and shopify_id like 'insyte-%'
                                returning id`
        if (gone.length > 0) {
          yield* Outbox.write(sql, workspace.id, {
            type: "shopify.create_refused",
            workspaceId: workspace.id,
            userId: write.userId,
            subject: "product",
            subjectId: productId,
            label: t.title,
            reason: refused.reason
          })
        }
        yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
          action: "product.shopify_refused",
          subjectType: "product",
          subjectId: productId,
          diff: { change: "create", reason: refused.reason, shopify: refused.text.slice(0, 300) }
        })
      })
    )
    return outcome("refused", refused.reason)
  }
  const { id: createdId, variant } = made.created
  if (createdId === null) return outcome("sent")
  const shopifyId = gidId(createdId)
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      // Shopify's `products/create` may have mirrored it first: the rows Insyte wrote are the ones that stay.
      yield* sql`delete from products where store_id = ${t.storeId} and shopify_id = ${shopifyId}
                 and id <> ${productId}`
      yield* sql`update products set shopify_id = ${shopifyId} where id = ${productId}`
      if (variant !== null && t.variantId !== null) {
        yield* sql`delete from variants where store_id = ${t.storeId} and shopify_id = ${gidId(variant.id)}
                   and id <> ${t.variantId}`
        yield* sql`update variants set shopify_id = ${gidId(variant.id)},
                     inventory_item_id = ${variant.inventoryItem === undefined ? null : gidId(variant.inventoryItem.id)}
                   where id = ${t.variantId}`
      }
    })
  )
  if (variant === null || t.priceMinor === null) return outcome("sent")

  const variants = [{
    id: variant.id,
    price: fromMinor(Number(t.priceMinor), currency),
    ...(t.sku === null ? {} : { inventoryItem: { sku: t.sku } })
  }]
  const priced = yield* Effect.map(
    mutate(t, VARIANTS_UPDATE, { productId: createdId, variants }, "productVariantsBulkUpdate"),
    ({ errors }): Refused | null =>
      errors.length === 0
        ? null
        : { reason: refusalOf(errors as Errors), text: errors.map((e) => e.message).join("; ") }
  ).pipe(Effect.catchTags({ TokenRefused: () => Effect.succeed("disconnected" as const), ShopifyRefused: refusal(t) }))
  if (priced === null || priced === "disconnected") return outcome("sent")
  const store = { id: t.storeId, connectionId: t.connectionId, shop: t.shop, currency: t.currency }
  yield* (yield* StoreMirror).mirrorOne(store, "Product", createdId)
  yield* db.scopedFor((sql) =>
    Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
      action: "product.shopify_refused",
      subjectType: "product",
      subjectId: productId,
      diff: { change: "create_price", reason: priced.reason, shopify: priced.text.slice(0, 300) }
    })
  )
  return outcome("refused", priced.reason)
})
