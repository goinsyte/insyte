import { Backfills } from "@insyte/modules/stores/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * Starting a store's backfill (M6.3): a `ShopifyBackfillWorkflow` instance named by the event that asked for it, so a
 * relay that delivers `store.connected` twice starts one import, not two.
 */
export const BackfillsLive = Layer.succeed(Backfills)(Backfills.of({
  start: Effect.fn("Backfills.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.SHOPIFY_BACKFILL.create({ id: input.key, params: { workspaceId: input.workspaceId, storeId: input.storeId } })
    ).pipe(
      // Already started under this name: that instance is the import.
      Effect.catch(() =>
        Effect.flatMap(Effect.tryPromise(() => env.SHOPIFY_BACKFILL.get(input.key)), () => Effect.void)
      ),
      Effect.orDie
    )
  })
}))
