import { AuthHooks } from "@insyte/integrations-better-auth/BetterAuth"
import { Effect, Layer } from "effect"
import { recordAuthEvent } from "./AuthEvents.ts"
import { admitted } from "./BetaGate.ts"
import { BetaSettings } from "./Bindings.ts"

/**
 * The app's half of better-auth (`AuthHooks`): the beta gate over `beta_allowlist`, and the security log over
 * `auth_events`, each on the request's connection. A lookup that fails refuses (the gate stays shut rather than open);
 * an event that cannot be stored is logged, never a failed sign-in.
 */
export const AuthHooksLive = Layer.effect(
  AuthHooks,
  Effect.gen(function*() {
    const settings = yield* BetaSettings
    return AuthHooks.of({
      admits: (email) =>
        admitted(email).pipe(Effect.provideService(BetaSettings, settings), Effect.orElseSucceed(() => false)),
      record: (event) =>
        recordAuthEvent(event).pipe(
          Effect.catch((error) => Effect.logWarning(`auth event ${event.kind} not recorded: ${String(error)}`))
        )
    })
  })
)
