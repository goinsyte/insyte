import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { WORKSPACE_HEADER } from "@insyte/api/rpc/Member"
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
  if (tabWorkspace !== null) headers.set(WORKSPACE_HEADER, tabWorkspace)
  const sent = globalThis.fetch(input, { ...init, headers })
  if (tabWorkspace !== null) void sent.then(reloadOnMismatch, () => {})
  return sent
}

/*
 * The workspace this tab shows (M3.1), named on every call (`x-insyte-workspace`): the session may have moved to
 * another one since the page loaded (another tab switched, or the person left this one). The server then does nothing
 * and answers `WorkspaceMismatch`, and the tab loads afresh, in the workspace the session is in now.
 */
let tabWorkspace: string | null = null
let reloading = false

/** The frame names its workspace once it is read; until then no call names one. In the browser only. */
export const nameTabWorkspace = (id: string) => {
  if (typeof window !== "undefined") tabWorkspace = id
}

const reloadOnMismatch = async (response: Response) => {
  if (reloading || !response.ok) return
  const body = await response.clone().text().catch(() => "")
  if (!body.includes("\"WorkspaceMismatch\"")) return
  reloading = true
  window.location.reload()
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
