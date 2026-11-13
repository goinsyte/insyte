import type { Connect } from "@insyte/database/Connect"
import { PostHogAnalytics } from "@insyte/integrations-posthog/PostHog"
import { ResendMailer } from "@insyte/integrations-resend/ResendMailer"
import type { Mailer } from "@insyte/modules/shared/domain/Mailer"
import type { ProductAnalytics } from "@insyte/modules/shared/domain/ProductAnalytics"
import { Config, Effect, Layer, Option, Scheduler } from "effect"
import { FetchHttpClient, type HttpClient } from "effect/http"
import { AppInfo, ConfigLive } from "./Bindings.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { MailerCapture } from "./Mail.ts"
import { ObservabilityLive } from "./Observability.ts"
import { ProductAnalyticsCapture } from "./ProductAnalyticsCapture.ts"

/*
 * What every Worker's layers stand on (ADR-0041): the scheduler, the configuration, logging and spans, and the way to
 * open a connection; and the two adapters whose choice the stage makes, mail and product analytics.
 */

/**
 * The sync scheduler, for the layer and for requests: Effect's guidance for Workers (`HttpRouter.toWebHandler`), so a
 * fiber's first step does not wait on a timer the isolate may drop.
 */
export const SyncScheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))

/** Where mail goes (02 §5.1): a table the dev route reads (local, tests, previews), or Resend where the stage says so. */
export const MailerLive = Layer.unwrap(
  Effect.map(
    Config.String("MAIL_ADAPTER").pipe(Config.withDefault("capture")),
    (adapter): Layer.Layer<Mailer, Config.ConfigError, Connect | HttpClient.HttpClient> =>
      adapter === "resend" ? ResendMailer : MailerCapture
  )
)

/** Product analytics (17 §5): PostHog where the stage has a key, a captured row the dev route reads where it has none. */
export const ProductAnalyticsLive = Layer.unwrap(
  Effect.map(
    Config.Redacted("POSTHOG_API_KEY").pipe(Config.option),
    (key): Layer.Layer<ProductAnalytics, Config.ConfigError, Connect | HttpClient.HttpClient> =>
      Option.isSome(key) ? PostHogAnalytics : ProductAnalyticsCapture
  )
)

/**
 * A background layer over the infrastructure: a connection per invocation, the configuration, logging and spans, fetch
 * and the sync scheduler.
 */
export const onInfra = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
  layer.pipe(
    Layer.provideMerge(HyperdriveConnect),
    Layer.provideMerge(ObservabilityLive),
    Layer.provideMerge(AppInfo.layer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(ConfigLive),
    Layer.provideMerge(SyncScheduler)
  )
