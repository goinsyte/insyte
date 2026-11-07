import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { Turnstile } from "../src/Turnstile.ts"

/* The service against a fake Cloudflare: an `HttpClient` that answers from a function and records what it was sent. */
const cloudflare = (answer: () => Response | Promise<Response>, sent: Array<URLSearchParams> = []) =>
  Turnstile.layer.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.promise(async () => {
          sent.push(new URLSearchParams(new TextDecoder().decode((request.body as { body: Uint8Array }).body)))
          return HttpClientResponse.fromWeb(request, await answer())
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ TURNSTILE_SECRET_KEY: "s3cret" })))
  )

const verify = (token: string, layer: ReturnType<typeof cloudflare>) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(Turnstile), (t) => t.verify(token, "203.0.113.9")).pipe(
      Effect.provide(layer)
    )
  )

describe("Turnstile", () => {
  it("sends the secret, the token and the visitor's IP, and passes on Cloudflare's success", async () => {
    const sent: Array<URLSearchParams> = []
    const result = await verify("tok", cloudflare(() => Response.json({ success: true }), sent))
    expect(result).toEqual(Exit.succeed({ success: true, errors: [] }))
    expect(sent[0]?.get("secret")).toBe("s3cret")
    expect(sent[0]?.get("response")).toBe("tok")
    expect(sent[0]?.get("remoteip")).toBe("203.0.113.9")
  })

  it("passes on Cloudflare's refusal, with its reasons", async () => {
    const result = await verify(
      "tok",
      cloudflare(() => Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] }))
    )
    expect(result).toEqual(Exit.succeed({ success: false, errors: ["timeout-or-duplicate"] }))
  })

  it("refuses a missing token without asking Cloudflare", async () => {
    const sent: Array<URLSearchParams> = []
    expect(await verify("", cloudflare(() => Response.json({ success: true }), sent))).toEqual(
      Exit.succeed({ success: false, errors: ["missing-input-response"] })
    )
    expect(sent).toEqual([])
  })

  it("is unavailable when Cloudflare errors or answers something else", async () => {
    for (const answer of [() => new Response("", { status: 500 }), () => new Response("not json")]) {
      const result = await verify("tok", cloudflare(answer))
      expect(Exit.isFailure(result) && JSON.stringify(result.cause)).toContain("TurnstileUnavailable")
    }
  })
})
