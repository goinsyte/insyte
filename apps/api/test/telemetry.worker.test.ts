import { runInDurableObject } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { ConfigProvider, Effect, Exit, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http"
import { OtlpSerialization } from "effect/observability"
import { beforeEach, expect, it } from "vitest"
import { AppInfo } from "../src/platform/Bindings.ts"
import { SyncScheduler } from "../src/platform/InfraLayer.ts"
import { makeTelemetry } from "../src/platform/Observability.ts"

/*
 * Spans leave per invocation (`Observability.ts`). Each invocation here runs inside a Durable Object call, which is a
 * request of its own to workerd: a fiber that waited in one and is woken in another throws "Cannot call this
 * AsyncLocalStorage bound function outside of the request in which it was created", as the jobs Worker's exporter
 * did on every preview. The OTLP endpoint is a fake `fetch`: it answers, hangs, or rate-limits.
 */

let answer: "ok" | "hang" | "429" = "ok"
const posted: Array<ReadonlyArray<string>> = []

const intake = ((_input: RequestInfo | URL, init?: RequestInit) => {
  if (answer === "hang") {
    return new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
    )
  }
  if (answer === "429") return Promise.resolve(new Response("", { status: 429, headers: { "retry-after": "60" } }))
  const body = JSON.parse(String(init?.body)) as {
    resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>
  }
  posted.push(body.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans.map((span) => span.name))))
  return Promise.resolve(new Response("{}", { status: 200 }))
}) as typeof globalThis.fetch

/** As a deployed stage configures it (`infra/app.ts`): OTLP on, the exporter's own timer an hour away. */
const telemetry = makeTelemetry(
  Layer.mergeAll(
    Layer.succeed(AppInfo, { version: "test", environment: "local" }),
    FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, intake))),
    OtlpSerialization.layerJson
  ).pipe(Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromEnvRecord({
    OTEL_TRACES_EXPORTER: "otlp",
    OTEL_SERVICE_NAME: "insyte-test",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://otlp.test/v1/traces",
    OTEL_BSP_SCHEDULE_DELAY: "3600000"
  }))))
)

/** A runtime built once per isolate, as `BackgroundRuntime` and `syncRuntime` are. */
const runtime = ManagedRuntime.make(SyncScheduler)

/** A unit of work that suspends inside its span, as every query and fetch does. */
const work = (name: string) => Effect.sleep(5).pipe(Effect.as(name), Effect.withSpan(name))

/** `run` inside its own request: a call to a Durable Object of its own. */
const inRequest = <A>(name: string, run: () => Promise<A>) =>
  runInDurableObject(env.RATE_LIMITER.getByName(`telemetry-${name}`), run)

beforeEach(() => {
  answer = "ok"
  posted.length = 0
})

it("exports each invocation's spans in that invocation, the second as well as the first", async () => {
  const first = await inRequest("first", () => telemetry.runExit(runtime, work("first")))
  const second = await inRequest("second", () => telemetry.runExit(runtime, work("second")))
  expect([Exit.isSuccess(first), Exit.isSuccess(second)]).toEqual([true, true])
  // One post each: the first invocation's span did not wait for the second, nor the second's for a third.
  expect(posted).toEqual([["first"], ["second"]])
})

it("exports a request's spans through the handler's context, request after request", async () => {
  const web = HttpRouter.toWebHandler(
    HttpRouter.add("GET", "/work", Effect.map(work("route"), () => HttpServerResponse.text("ok"))).pipe(
      Layer.provideMerge(SyncScheduler)
    ),
    { disableLogger: true }
  )
  for (const name of ["a", "b"]) {
    await inRequest(`http-${name}`, async () => {
      const spans = telemetry.open()
      const response = await web.handler(new Request("http://api.test/work"), spans.context)
      expect(await response.text()).toBe("ok")
      await spans.flush()
    })
  }
  expect(posted).toHaveLength(2)
  for (const names of posted) expect(names).toContain("route")
  await web.dispose()
})

it("gives up a flush to a hanging intake after three seconds", async () => {
  answer = "hang"
  const took = await inRequest("hang", async () => {
    const start = Date.now()
    const exit = await telemetry.runExit(runtime, work("hang"))
    expect(Exit.isSuccess(exit)).toBe(true)
    return Date.now() - start
  })
  expect(took).toBeLessThan(4_000)
})

it("gives up a flush to a rate-limiting intake after three seconds, whatever its Retry-After says", async () => {
  answer = "429"
  const took = await inRequest("429", async () => {
    const spans = telemetry.open()
    await runtime.runPromise(spans.provide(work("limited")))
    const start = Date.now()
    await spans.flush()
    return Date.now() - start
  })
  expect(took).toBeLessThan(4_000)
  // The next invocation's exporter is its own: nothing of the limited one is left to hold it.
  answer = "ok"
  await inRequest("after-429", () => telemetry.runExit(runtime, work("after")))
  expect(posted).toEqual([["after"]])
})
