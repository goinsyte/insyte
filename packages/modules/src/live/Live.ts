import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { KeyHasher } from "../developer/domain/Ports.ts"
import { ConnectionGate, ShopifyGraphql } from "../stores/domain/Ports.ts"
import type { LiveSnapshot, LiveTab, PixelInstallFailed, StorePixels } from "./domain/Live.ts"
import { LiveRooms } from "./domain/Ports.ts"
import * as Ingest from "./use-cases/ingest.ts"
import * as Live from "./use-cases/live.ts"
import * as Pixels from "./use-cases/pixels.ts"

type R = Db | CurrentPrincipal

/**
 * The live slice (M14 step 3): who is on the store now, from the workspace's live room, beside today's sales from the
 * orders; the pixels that feed the room, installed from Instellingen → Winkels; and the pixel's ingest. The room,
 * Shopify, the gate and the key hasher are ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class LiveService extends Context.Service<LiveService, {
  readonly snapshot: Effect.Effect<LiveSnapshot, Forbidden, R>
  readonly subscribe: (input: LiveTab) => Effect.Effect<{ readonly leaseSeconds: number }, Forbidden, R>
  readonly unsubscribe: (input: LiveTab) => Effect.Effect<void, Forbidden, R>
  readonly pixels: Effect.Effect<StorePixels, Forbidden, R>
  readonly installPixel: (
    input: { readonly storeId: string }
  ) => Effect.Effect<StorePixels, Forbidden | NotFound | PixelInstallFailed, R>
  /** The public ingest: no principal, the store routes it. */
  readonly ingest: (input: Parameters<typeof Ingest.ingest>[0]) => Effect.Effect<Ingest.IngestAnswer, never, Db>
}>()("modules/LiveService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    LiveService,
    Effect.gen(function*() {
      const rooms = yield* LiveRooms
      const hasher = yield* KeyHasher
      const gate = yield* ConnectionGate
      const graphql = yield* ShopifyGraphql
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(LiveRooms, rooms),
          Effect.provideService(KeyHasher, hasher),
          Effect.provideService(ConnectionGate, gate),
          Effect.provideService(ShopifyGraphql, graphql),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        snapshot: run(Live.snapshot()),
        subscribe: (input) => run(Live.subscribe(input)),
        unsubscribe: (input) => run(Live.unsubscribe(input)),
        pixels: run(Pixels.list()),
        installPixel: (input) => run(Pixels.install(input)),
        ingest: (input) => run(Ingest.ingest(input))
      }
    })
  )
}
