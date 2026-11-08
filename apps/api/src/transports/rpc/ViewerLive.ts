import { Viewer } from "@insyte/api/rpc/Viewer"
import type { Connect } from "@insyte/database/Connect"
import { CurrentViewer } from "@insyte/domain/Session"
import type { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { Effect, Layer, Option } from "effect"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/** The session cookie, carried in the RPC's headers, → `CurrentViewer`: the person, or nobody. */
export const ViewerLive = Layer.effect(
  Viewer,
  Effect.gen(function*() {
    const services = yield* Effect.context<BetterAuth | Connect>()
    return Viewer.of((effect, { headers }) =>
      Effect.flatMap(
        withRequestDb(userFrom(new Headers(headers as Record<string, string>))).pipe(Effect.provide(services)),
        (user) => Effect.provideService(effect, CurrentViewer, { user: Option.getOrNull(user) })
      )
    )
  })
)
