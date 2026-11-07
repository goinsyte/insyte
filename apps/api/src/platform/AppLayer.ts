import type { Connect } from "@insyte/database/Connect"
import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { PwnedPasswords } from "@insyte/integrations-better-auth/PwnedPasswords"
import { ResendMailer } from "@insyte/integrations-resend/ResendMailer"
import type { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { Config, Effect, Layer, Scheduler } from "effect"
import { FetchHttpClient, type HttpClient, HttpServer } from "effect/http"
import { AuthRoutes } from "../transports/http/AuthRoutes.ts"
import { DevRoutes } from "../transports/http/DevRoutes.ts"
import { NotFound } from "../transports/http/NotFound.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { SystemRoutes } from "../transports/http/SystemRoutes.ts"
import { AuthenticatedLive } from "../transports/rpc/AuthenticatedLive.ts"
import { RpcContext, RpcRoutes } from "../transports/rpc/RpcRoutes.ts"
import { WithDbLive } from "../transports/rpc/WithDbLive.ts"
import { AuthHooksLive } from "./AuthHooks.ts"
import { AppInfo, BetaSettings, ConfigLive } from "./Bindings.ts"
import { HumanCheck } from "./HumanCheck.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { MailerCapture } from "./Mail.ts"
import { ObservabilityLive } from "./Observability.ts"
import { RateLimits } from "./RateLimits.ts"

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

/** Where mail goes (02 §5.1): a table the dev route reads (local, tests, previews), or Resend where the stage says so. */
const MailerLive = Layer.unwrap(
  Effect.map(
    Config.String("MAIL_ADAPTER").pipe(Config.withDefault("capture")),
    (adapter): Layer.Layer<Mailer, Config.ConfigError, Connect | HttpClient.HttpClient> =>
      adapter === "resend" ? ResendMailer : MailerCapture
  )
)

/** The breached-password check asks HIBP from deployed stages only, so local runs and the worker tests stay offline. */
const PwnedPasswordsLive = Layer.unwrap(
  Effect.map(
    Config.String("ENVIRONMENT"),
    (environment): Layer.Layer<PwnedPasswords, never, HttpClient.HttpClient> =>
      environment === "local" ? PwnedPasswords.layerOffline : PwnedPasswords.layer
  )
)

export const AppLayer = Transports.pipe(
  Layer.provideMerge(RpcContext),
  Layer.provideMerge(WithDbLive),
  Layer.provideMerge(AuthenticatedLive),
  // better-auth, built per request by the auth routes and the session check, over the app's hooks.
  Layer.provideMerge(BetterAuth.layer),
  Layer.provideMerge(AuthHooksLive),
  Layer.provideMerge(PwnedPasswordsLive),
  Layer.provideMerge(MailerLive),
  // The edge guards' counters; the Durable Object binding is read per call.
  Layer.provideMerge(RateLimits.layer),
  Layer.provideMerge(HumanCheck.layer),
  Layer.provideMerge(BetaSettings.layer),
  // Read per request by the routes and the RPC middleware; building it opens no socket.
  Layer.provideMerge(HyperdriveConnect),
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(AppInfo.layer),
  Layer.provide([FetchHttpClient.layer, HttpServer.layerServices]),
  Layer.provide(ConfigLive),
  Layer.provideMerge(SyncScheduler)
)
