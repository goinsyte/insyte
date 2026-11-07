import { Layer, Scheduler } from "effect"
import { FetchHttpClient, HttpServer } from "effect/http"
import { NotFound } from "../transports/http/NotFound.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { SystemRoutes } from "../transports/http/SystemRoutes.ts"
import { RpcContext, RpcRoutes } from "../transports/rpc/RpcRoutes.ts"
import { AppInfo, ConfigLive } from "./Bindings.ts"
import { ObservabilityLive } from "./Observability.ts"

/*
 * The composition root (16 §5): every implementation is chosen here, and the layer is built once per isolate. Nothing
 * that holds a socket belongs in it: a Worker forbids I/O objects shared across requests, so the database arrives per
 * request through a middleware (M1.2).
 */

const Transports = Layer.mergeAll(SystemRoutes, RpcRoutes, RequestContext, NotFound)

/**
 * The sync scheduler, for the layer and for requests: Effect's guidance for Workers (`HttpRouter.toWebHandler`), so a
 * fiber's first step does not wait on a timer the isolate may drop.
 */
const SyncScheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))

export const AppLayer = Transports.pipe(
  Layer.provideMerge(RpcContext),
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(AppInfo.layer),
  Layer.provide([FetchHttpClient.layer, HttpServer.layerServices]),
  Layer.provide(ConfigLive),
  Layer.provideMerge(SyncScheduler)
)
