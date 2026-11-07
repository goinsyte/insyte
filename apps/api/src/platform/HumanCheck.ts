import { verifyTurnstile } from "@insyte/integrations-turnstile/Turnstile"
import { Config, Context, Effect, Layer, Option, Redacted } from "effect"

/*
 * Turnstile for the edge guards (M2.2). Where the stage has no secret (local runs and the worker tests) nothing is
 * required, as the breached-password check is skipped there: those runs stay offline. Previews carry Cloudflare's
 * always-passing test secret and staging and production their widget's (`infra/app.ts`), so every deployed stage
 * checks for real.
 */

export class HumanCheck extends Context.Service<HumanCheck, {
  readonly required: boolean
  readonly verify: (token: string | null, remoteIp: string | null) => Effect.Effect<boolean>
}>()("api-worker/HumanCheck") {
  static readonly layer = Layer.effect(
    HumanCheck,
    Effect.gen(function*() {
      const secret = yield* Config.Redacted("TURNSTILE_SECRET_KEY").pipe(Config.option)
      if (Option.isNone(secret)) return { required: false, verify: () => Effect.succeed(true) }
      return {
        required: true,
        verify: (token, remoteIp) =>
          token === null
            ? Effect.succeed(false)
            : Effect.promise(() =>
              verifyTurnstile({ secret: Redacted.value(secret.value), token, remoteIp: remoteIp ?? undefined })
            ).pipe(
              Effect.tap((result) =>
                result.success ? Effect.void : Effect.logInfo(`turnstile refused: ${result.errors.join(", ")}`)
              ),
              Effect.map((result) => result.success),
              Effect.withSpan("HumanCheck.verify")
            )
      }
    })
  )
}
