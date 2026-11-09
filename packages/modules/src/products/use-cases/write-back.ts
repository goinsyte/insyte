import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { fromMinor, gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate } from "../../stores/domain/Ports.ts"
import { mirrorOne } from "../../stores/use-cases/webhooks.ts"
import { isAnswer, mutate } from "../../stores/use-cases/write.ts"
import { PRODUCT_UPDATE, STATUS, VARIANTS_UPDATE } from "../domain/WriteBack.ts"

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
  yield* mirrorOne(store, "Product", gid)
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
