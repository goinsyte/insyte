import { WithDb } from "@insyte/api/rpc/WithDb"
import { Connect } from "@insyte/database/Connect"
import { Effect, Layer } from "effect"
import { withRequestDb } from "../../platform/RequestDb.ts"

/** `Db` to every RPC handler, over this request's connection (16 §4). */
export const WithDbLive = Layer.effect(
  WithDb,
  Effect.map(
    Effect.service(Connect),
    (connect) => WithDb.of((effect) => withRequestDb(effect).pipe(Effect.provideService(Connect, connect)))
  )
)
