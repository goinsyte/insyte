import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Effect, type Exit, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import worker from "../src/Local.ts"

/**
 * One request through the Worker's own `fetch`, waiting for its `waitUntil` work (the span flush) too. The body is
 * read first, as a client would: the request's spans are flushed once its response is sent, so waiting before reading
 * a streamed body would wait forever.
 */
export const call = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const ctx = createExecutionContext()
  // A test request has no `cf` properties; the Worker reads none.
  const response = await worker.fetch(
    new Request(input, init) as Request<unknown, IncomingRequestCfProperties>,
    env,
    ctx
  )
  if (response.webSocket !== null && response.webSocket !== undefined) {
    await waitOnExecutionContext(ctx)
    return response
  }
  const body = await response.arrayBuffer()
  await waitOnExecutionContext(ctx)
  return new Response(response.status === 204 || response.status === 304 ? null : body, response)
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

/** The onboarding RPCs, as the console calls them, signed in with `cookie`. */
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
    }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit),
  start: (cookie: string) =>
    Effect.gen(function*() {
      const client = yield* RpcClient.make(ConsoleRpcs)
      return yield* client["Onboarding.start"](undefined, { headers: { cookie } })
    }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit),
  completeTask: (
    input: Parameters<RpcClient.FromGroup<typeof ConsoleRpcs>["Onboarding.completeTask"]>[0],
    cookie: string
  ) =>
    Effect.gen(function*() {
      const client = yield* RpcClient.make(ConsoleRpcs)
      return yield* client["Onboarding.completeTask"](input, { headers: { cookie } })
    }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit)
}

type Client = RpcClient.FromGroup<typeof ConsoleRpcs>

/** Any console RPC by name, signed in with `cookie`: what a slice's tests call it through. */
export const rpc = <K extends keyof Client>(name: K, payload: Parameters<Client[K]>[0], cookie?: string) =>
  Effect.gen(function*() {
    const client = (yield* RpcClient.make(ConsoleRpcs)) as unknown as Record<
      string,
      (payload: unknown, options: { headers: Record<string, string> }) => Effect.Effect<unknown, unknown>
    >
    return yield* client[name]!(payload, { headers: cookie === undefined ? {} : { cookie } })
  }).pipe(Effect.scoped, Effect.provide(RpcProtocol), Effect.runPromiseExit) as Promise<
    Exit.Exit<Effect.Success<ReturnType<Client[K]>>, Effect.Error<ReturnType<Client[K]>>>
  >
