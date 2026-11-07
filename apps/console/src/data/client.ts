import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Atom, AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"

/*
 * The console's one client for the API (13 §2). Every server read is a query atom and every command a mutation atom,
 * built from the same `RpcGroup` the API Worker serves. NDJSON on both ends.
 */

/** In the browser: same origin, because the console Worker forwards `/api/*` to the API by service binding. */
const browserProtocol = RpcClient.layerProtocolHttp({ url: RPC_PATH }).pipe(
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson])
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
