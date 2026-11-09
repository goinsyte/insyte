import { SupplierApi } from "@insyte/modules/forwarding/domain/Forwarding"
import { Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { signature, SupplierApiLive } from "../src/SupplierApi.ts"

/*
 * A supplier's own API against a fake transport: the body goes as JSON with a signature the supplier can check, and the
 * answer reads as taken, refused (final) or worth retrying.
 */

interface Seen {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

const api = (status: number, seen: Array<Seen> = [], text = "") =>
  SupplierApiLive.pipe(Layer.provide(Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          const raw = request.body as { body?: Uint8Array }
          seen.push({
            url: url.href,
            headers: request.headers as Record<string, string>,
            body: raw.body === undefined ? "" : new TextDecoder().decode(raw.body)
          })
          return HttpClientResponse.fromWeb(request, new Response(text, { status }))
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )))

const post = (layer: ReturnType<typeof api>) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(SupplierApi), (s) =>
      s.post("https://supplier.example/orders", "s3cret", { type: "ping" }))
      .pipe(Effect.provide(layer))
  )

describe("SupplierApiLive", () => {
  it("posts the body as JSON, signed so the supplier can check it", async () => {
    const seen: Array<Seen> = []
    const exit = await post(api(200, seen))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen[0]).toMatchObject({ url: "https://supplier.example/orders", body: "{\"type\":\"ping\"}" })
    const header = seen[0]!.headers["insyte-signature"]!
    const t = Number(/t=(\d+)/.exec(header)![1])
    expect(header).toBe(await signature("s3cret", "{\"type\":\"ping\"}", t))
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(5)
  })

  it("reads a 4xx as the supplier's refusal, final, with their words", async () => {
    const exit = await post(api(422, [], "unknown sku"))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("422: unknown sku")
    expect(JSON.stringify(exit)).toContain("\"retryable\":false")
  })

  it("reads a 503 as worth trying again", async () => {
    const exit = await post(api(503))
    expect(JSON.stringify(exit)).toContain("\"retryable\":true")
  })
})
