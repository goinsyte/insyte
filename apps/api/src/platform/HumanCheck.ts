import { Turnstile } from "@insyte/integrations-turnstile/Turnstile"
import { Config, Context, Effect, Layer, Option } from "effect"

/*
 * Turnstile for the edge guards (M2.2), over the `Turnstile` integration. Where the stage has no secret (local runs and
 * the worker tests) nothing is required, as the breached-password check is skipped there: those runs stay offline.
 * Previews carry Cloudflare's always-passing test secret and staging and production their widget's (`infra/app.ts`),
 * so every deployed stage checks for real. A check Cloudflare cannot answer is a check not passed.
 */

export class HumanCheck extends Context.Service<HumanCheck, {
  readonly required: boolean
  readonly verify: (token: string | null, remoteIp: string | null) => Effect.Effect<boolean>
}>()("api-worker/HumanCheck") {
  static readonly layer = Layer.unwrap(
    Effect.gen(function*() {
      const secret = yield* Config.Redacted("TURNSTILE_SECRET_KEY").pipe(Config.option)
      if (Option.isNone(secret)) {
        return Layer.succeed(HumanCheck, { required: false, verify: () => Effect.succeed(true) })
      }
      return Layer.effect(
        HumanCheck,
        Effect.gen(function*() {
          const turnstile = yield* Turnstile
          const verify = Effect.fn("HumanCheck.verify")(function*(token: string | null, remoteIp: string | null) {
            if (token === null) return false
            const verdict = yield* turnstile.verify(token, remoteIp ?? undefined).pipe(
              Effect.catchTag(
                "TurnstileUnavailable",
                (error) =>
                  Effect.as(Effect.logWarning(`turnstile unavailable: ${error.reason}`), { success: false, errors: [] })
              )
            )
            if (!verdict.success && verdict.errors.length > 0) {
              yield* Effect.logInfo(`turnstile refused: ${verdict.errors.join(", ")}`)
            }
            return verdict.success
          })
          return { required: true, verify }
        })
      ).pipe(Layer.provide(Turnstile.layer))
    })
  )
}
