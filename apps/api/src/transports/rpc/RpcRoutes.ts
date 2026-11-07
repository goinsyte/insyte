import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Layer } from "effect"
import { RpcSerialization } from "effect/rpc"
import { SessionHandlers } from "./handlers/session.ts"
import { SystemHandlers } from "./handlers/system.ts"
import { RpcHttp } from "./RpcHttp.ts"

/** The console's RPC transport. */
export const RpcRoutes = RpcHttp(ConsoleRpcs, RPC_PATH)

/**
 * What the RPC route reads per request: the handlers and the serialization. NDJSON on both ends: the console's client
 * uses the same (13 §2). The composition root `provideMerge`s this after the transports (see `RpcHttp`).
 */
export const RpcContext = Layer.mergeAll(SystemHandlers, SessionHandlers).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson)
)
