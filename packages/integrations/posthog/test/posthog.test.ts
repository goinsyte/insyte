import { ProductAnalytics } from "@insyte/modules/shared/domain/ProductAnalytics"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { PostHogAnalytics } from "../src/PostHog.ts"

const posthog = (answer: () => Promise<Response>, seen: Array<{ url: string; body: unknown }> = []) =>
  PostHogAnalytics.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.tryPromise({
          try: async () => {
            seen.push({
              url: url.href,
              body: JSON.parse(new TextDecoder().decode((request.body as { body: Uint8Array }).body))
            })
            return HttpClientResponse.fromWeb(request, await answer())
          },
          catch: (cause) =>
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ POSTHOG_API_KEY: "phc_test" })))
  )

const capture = (layer: ReturnType<typeof posthog>) =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(ProductAnalytics), (a) =>
      a.capture({
        outboxId: "obx_1",
        event: "workspace_created",
        distinctId: "usr_1",
        groups: { workspace: "ws_1" },
        properties: { plan: "trial" }
      })).pipe(Effect.provide(layer))
  )

describe("PostHogAnalytics", () => {
  it("captures to the EU cloud with the person's id and the workspace as a group", async () => {
    const seen: Array<{ url: string; body: unknown }> = []
    await capture(posthog(() => Promise.resolve(new Response("{}")), seen))
    expect(seen[0]?.url).toBe("https://eu.i.posthog.com/i/v0/e/")
    expect(seen[0]?.body).toEqual({
      api_key: "phc_test",
      event: "workspace_created",
      distinct_id: "usr_1",
      properties: { plan: "trial", $groups: { workspace: "ws_1" } }
    })
  })

  it("never fails: a refusal or an outage is logged and answers success", async () => {
    await expect(capture(posthog(() => Promise.resolve(new Response("", { status: 500 }))))).resolves.toBeUndefined()
    await expect(capture(posthog(() => Promise.reject(new Error("offline"))))).resolves.toBeUndefined()
  })
})
