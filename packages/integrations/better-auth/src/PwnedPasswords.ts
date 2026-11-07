import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * Have I Been Pwned's range API, k-anonymously (M2.3): only the first five hex characters of the password's SHA-1
 * leave the Worker, and the answer is every suffix with that prefix, compared here. `Add-Padding` makes every answer
 * about the same size, so its length says nothing either.
 *
 * Ours rather than better-auth's plugin because that one fails closed: an HIBP outage would stop every sign-up. This
 * one never fails: no answer within 1.5 s, or a broken one, counts as "not breached", logged.
 */

const RANGE = "https://api.pwnedpasswords.com/range/"

const sha1Hex = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
}

export class PwnedPasswords extends Context.Service<PwnedPasswords, {
  readonly isBreached: (password: string) => Effect.Effect<boolean>
}>()("integrations/PwnedPasswords") {
  static readonly layer = Layer.effect(
    PwnedPasswords,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      const isBreached = Effect.fn("PwnedPasswords.isBreached")(function*(password: string) {
        const hash = yield* Effect.promise(() => sha1Hex(password))
        const suffix = hash.slice(5)
        return yield* client.execute(
          HttpClientRequest.get(`${RANGE}${hash.slice(0, 5)}`).pipe(HttpClientRequest.setHeader("add-padding", "true"))
        ).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
          Effect.timeout("1.5 seconds"),
          Effect.map((body) =>
            body.split("\n").some((line) => {
              const [candidate, count] = line.trim().split(":")
              return candidate === suffix && Number(count) > 0
            })
          ),
          Effect.catch((error) =>
            Effect.as(Effect.logWarning(`HIBP unavailable, not checked: ${String(error)}`), false)
          )
        )
      })
      return { isBreached }
    })
  )

  /** Asks no one and finds nothing: local runs and the worker tests stay offline. */
  static readonly layerOffline = Layer.succeed(PwnedPasswords, { isBreached: () => Effect.succeed(false) })
}
