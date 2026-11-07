import { Authenticated } from "@insyte/api/rpc/Authenticated"
import type { Connect } from "@insyte/database/Connect"
import { Unauthenticated } from "@insyte/domain/Errors"
import { CurrentUser } from "@insyte/domain/Session"
import type { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { Effect, Layer, Option } from "effect"
import type { AuthSettings } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/** The session cookie, carried in the RPC's headers, → `CurrentUser`, or `Unauthenticated` (16 §4). */
export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function*() {
    // What the check reads, taken when the layer is built: a middleware's effect may require nothing but its scope.
    const services = yield* Effect.context<AuthSettings | Connect | Mailer>()
    return Authenticated.of((effect, { headers }) =>
      Effect.flatMap(
        // The check opens its own request connection; the handler's `WithDb`, where it has one, opens another.
        withRequestDb(userFrom(new Headers(headers as Record<string, string>))).pipe(Effect.provide(services)),
        Option.match({
          onNone: () => Effect.fail(new Unauthenticated()),
          onSome: (user) => Effect.provideService(effect, CurrentUser, user)
        })
      )
    )
  })
)
