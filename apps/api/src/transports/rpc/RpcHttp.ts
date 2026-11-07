import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import { type Rpc, type RpcGroup, RpcServer } from "effect/rpc"

/**
 * An RPC group as a POST route whose server is built inside the request it serves.
 *
 * Not `RpcServer.layerHttp`, which forks the server's fiber while the layer is built. On Workers that fork can be
 * dropped: when an isolate's first request does no I/O (a 404, a health check), it returns before the forked fiber's
 * first step runs, and every later RPC call in that isolate waits on a server that never started ("code had hung").
 * Found and reproduced in effect-cloudflare-full-stack (ADR-0026 there). Per request, the server belongs to the
 * request's scope, so nothing carries over between requests. The handlers, middleware and serialization are read from
 * the context per request, so the composition root `provideMerge`s them.
 */
export const RpcHttp = <Rpcs extends Rpc.Any>(group: RpcGroup.RpcGroup<Rpcs>, path: HttpRouter.PathInput) =>
  HttpRouter.add("POST", path, Effect.flatten(RpcServer.toHttpEffect(group)))
