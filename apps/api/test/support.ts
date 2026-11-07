import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import worker from "../src/Main.ts"

/** One request through the Worker's own `fetch`, waiting for its `waitUntil` work (the span flush) too. */
export const call = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const ctx = createExecutionContext()
  // A test request has no `cf` properties; the Worker reads none.
  const response = await worker.fetch(
    new Request(input, init) as Request<unknown, IncomingRequestCfProperties>,
    env,
    ctx
  )
  await waitOnExecutionContext(ctx)
  return response
}

/** The console's RPC client, as the console builds it, with the Worker's `fetch` as the network. */
const RpcProtocol = RpcClient.layerProtocolHttp({ url: `http://api.test${RPC_PATH}` }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, call as typeof globalThis.fetch))
)

export const health = () =>
  Effect.gen(function*() {
    const client = yield* RpcClient.make(ConsoleRpcs)
    return yield* client["System.health"]()
  }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromise)

/** `Session.me` over RPC, with a cookie when given: the console's call after sign-in. */
export const sessionMe = (cookie?: string) =>
  Effect.gen(function*() {
    const client = yield* RpcClient.make(ConsoleRpcs)
    return yield* client["Session.me"](undefined, cookie === undefined ? {} : { headers: { cookie } })
  }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit)

/** `Onboarding.me` and `Onboarding.advance` over RPC, as the console calls them, signed in with `cookie`. */
export const onboarding = {
  me: (cookie?: string) =>
    Effect.gen(function*() {
      const client = yield* RpcClient.make(ConsoleRpcs)
      return yield* client["Onboarding.me"](undefined, cookie === undefined ? {} : { headers: { cookie } })
    }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit),
  advance: (input: Parameters<RpcClient.FromGroup<typeof ConsoleRpcs>["Onboarding.advance"]>[0], cookie: string) =>
    Effect.gen(function*() {
      const client = yield* RpcClient.make(ConsoleRpcs)
      return yield* client["Onboarding.advance"](input, { headers: { cookie } })
    }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit)
}
