import { Layer, Scheduler } from "effect"
import { FetchHttpClient, HttpServer } from "effect/http"
import { AuthRoutes } from "../transports/http/AuthRoutes.ts"
import { DevRoutes } from "../transports/http/DevRoutes.ts"
import { NotFound } from "../transports/http/NotFound.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { SystemRoutes } from "../transports/http/SystemRoutes.ts"
import { RpcContext, RpcRoutes } from "../transports/rpc/RpcRoutes.ts"
import { WithDbLive } from "../transports/rpc/WithDbLive.ts"
import { AppInfo, AuthSettings, ConfigLive } from "./Bindings.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { MailerCapture } from "./Mail.ts"
import { ObservabilityLive } from "./Observability.ts"

/*
 * The composition root (16 §5): every implementation is chosen here, and the layer is built once per isolate. Nothing
 * that holds a socket belongs in it: a Worker forbids I/O objects shared across requests, so the database connection
 * is opened per request (`RequestDb.ts`), and the layer holds only the way to open one (`HyperdriveConnect`).
 */

const Transports = Layer.mergeAll(SystemRoutes, AuthRoutes, DevRoutes, RpcRoutes, RequestContext, NotFound)

/**
 * The sync scheduler, for the layer and for requests: Effect's guidance for Workers (`HttpRouter.toWebHandler`), so a
 * fiber's first step does not wait on a timer the isolate may drop.
 */
const SyncScheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))

export const AppLayer = Transports.pipe(
  Layer.provideMerge(RpcContext),
  Layer.provideMerge(WithDbLive),
  // Read per request by the auth routes. The capture adapter until Resend arrives (MAIL_ADAPTER, 02 §5.1).
  Layer.provideMerge(MailerCapture),
  Layer.provideMerge(AuthSettings.layer),
  // Read per request by the routes and the RPC middleware; building it opens no socket.
  Layer.provideMerge(HyperdriveConnect),
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(AppInfo.layer),
  Layer.provide([FetchHttpClient.layer, HttpServer.layerServices]),
  Layer.provide(ConfigLive),
  Layer.provideMerge(SyncScheduler)
)
