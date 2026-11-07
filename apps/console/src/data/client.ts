import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Atom, AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"

/*
 * The console's one client for the API (13 §2). Every server read is a query atom and every command a mutation atom,
 * built from the same `RpcGroup` the API Worker serves. NDJSON on both ends.
 */

/**
 * The browser's `fetch`, minus Effect's own trace headers. Sentry's SDK wraps the page's `fetch` and sends
 * `traceparent` for the browser's trace (`propagateTraceparent`), and the API continues that one. Effect's client adds
 * its own `traceparent` and `b3` first, and with them in place the browser and API traces did not join. The call goes
 * through `globalThis.fetch` at request time, so it reaches Sentry's wrapper.
 */
const fetchForSentryTrace: typeof globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.delete("traceparent")
  headers.delete("b3")
  return globalThis.fetch(input, { ...init, headers })
}

/** In the browser: same origin, because the console Worker forwards `/api/*` to the API by service binding. */
const browserProtocol = RpcClient.layerProtocolHttp({ url: RPC_PATH }).pipe(
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchForSentryTrace))
)

/** On the server: the same RPC, over the `API` binding, with the visitor's headers forwarded (`server-protocol.ts`). */
export const protocolOver = (fetch: typeof globalThis.fetch, origin: string) =>
  RpcClient.layerProtocolHttp({ url: `${origin}${RPC_PATH}` }).pipe(
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
  )

/** Which transport the client uses. The server seeds its own per request (`router.tsx`). */
export const ProtocolLayer = Atom.keepAlive(Atom.make(browserProtocol))

export class ConsoleClient extends AtomRpc.Service<ConsoleClient>()("console/ConsoleClient", {
  group: ConsoleRpcs,
  protocol: (get) => get(ProtocolLayer),
  spanPrefix: "console"
}) {}
