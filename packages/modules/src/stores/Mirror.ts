import { Context, Effect, Layer } from "effect"
import { MirrorFollowers } from "./domain/Ports.ts"
import * as Webhooks from "./use-cases/webhooks.ts"

type MirrorOne = ReturnType<typeof Webhooks.mirrorOne>

/**
 * One record read again from Shopify and written through the mirror (M7): what a slice's write-back does after Shopify
 * took the change, and a product's "Synchroniseren". The stores slice owns the mirror; other slices reach it here.
 *
 * @effect-expect-leaking Db CurrentWorkspace ShopifyGraphql ConnectionGate
 */
export class StoreMirror extends Context.Service<StoreMirror, {
  readonly mirrorOne: (
    ...args: Parameters<typeof Webhooks.mirrorOne>
  ) => Effect.Effect<void, Effect.Error<MirrorOne>, Exclude<Effect.Services<MirrorOne>, MirrorFollowers>>
}>()("stores/StoreMirror") {
  static readonly layer = Layer.effect(
    StoreMirror,
    Effect.gen(function*() {
      const followers = yield* MirrorFollowers
      return {
        mirrorOne: (...args) => Webhooks.mirrorOne(...args).pipe(Effect.provideService(MirrorFollowers, followers))
      }
    })
  )
}
