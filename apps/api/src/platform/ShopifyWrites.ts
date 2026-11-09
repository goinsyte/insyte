import { ShopifyWrites } from "@insyte/modules/orders/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * Starting an order change's write to Shopify (M7.1): a `ShopifyWriteWorkflow` instance named by the outbox event, so
 * a relay that delivers it twice starts one, not two.
 */
export const ShopifyWritesLive = Layer.succeed(ShopifyWrites)(ShopifyWrites.of({
  start: Effect.fn("ShopifyWrites.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.SHOPIFY_WRITE.create({ id: input.key, params: { workspaceId: input.workspaceId, write: input.write } })
    ).pipe(
      // Already started under this name: that instance is the write.
      Effect.catch(() => Effect.flatMap(Effect.tryPromise(() => env.SHOPIFY_WRITE.get(input.key)), () => Effect.void)),
      Effect.orDie
    )
  })
}))
