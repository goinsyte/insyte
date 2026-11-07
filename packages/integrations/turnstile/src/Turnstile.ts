import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * Cloudflare Turnstile, checked on the server (M2.2): the token the widget gave the browser goes to `siteverify` with
 * the widget's secret, and only a `success` answer counts.
 *
 * `verify` answers Cloudflare's verdict, or fails with `TurnstileUnavailable` when no verdict could be had (Cloudflare
 * did not answer, or answered something else). The caller decides what an unavailable check means; the edge guards
 * fail closed: a check that cannot be made is a check not passed, and the visitor can simply try again.
 *
 * Previews and local runs use Cloudflare's published test keys (`1x…AA` always passes), so a browser test can get a
 * token without solving anything; staging and production have their own widget (`infra/app.ts`).
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface Verification {
  readonly success: boolean
  /** Cloudflare's reasons when it refuses (`invalid-input-response`, `timeout-or-duplicate`, …), for the log. */
  readonly errors: ReadonlyArray<string>
}

export class TurnstileUnavailable extends Schema.TaggedError<TurnstileUnavailable>()("TurnstileUnavailable", {
  reason: Schema.String
}) {}

const Answer = Schema.Struct({
  success: Schema.Boolean,
  "error-codes": Schema.optional(Schema.Array(Schema.String))
})

export class Turnstile extends Context.Service<Turnstile, {
  readonly verify: (token: string, remoteIp: string | undefined) => Effect.Effect<Verification, TurnstileUnavailable>
}>()("integrations/Turnstile") {
  /** With the stage's widget secret, `TURNSTILE_SECRET_KEY`. */
  static readonly layer = Layer.effect(
    Turnstile,
    Effect.gen(function*() {
      const secret = yield* Config.Redacted("TURNSTILE_SECRET_KEY")
      const client = yield* HttpClient.HttpClient
      const verify = Effect.fn("Turnstile.verify")(function*(token: string, remoteIp: string | undefined) {
        if (token.length === 0 || token.length > 2048) {
          return { success: false, errors: ["missing-input-response"] } satisfies Verification
        }
        const request = HttpClientRequest.post(SITEVERIFY).pipe(
          HttpClientRequest.bodyUrlParams({
            secret: Redacted.value(secret),
            response: token,
            ...(remoteIp === undefined ? {} : { remoteip: remoteIp })
          })
        )
        const answer = yield* client.execute(request).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Answer)),
          Effect.timeout("3 seconds"),
          Effect.mapError((error) => new TurnstileUnavailable({ reason: String(error) }))
        )
        return { success: answer.success, errors: answer["error-codes"] ?? [] } satisfies Verification
      })
      return { verify }
    })
  )
}
