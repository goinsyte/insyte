import type { Connect } from "@insyte/database/Connect"
import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { PwnedPasswords } from "@insyte/integrations-better-auth/PwnedPasswords"
import { PostHogAnalytics } from "@insyte/integrations-posthog/PostHog"
import { ResendMailer } from "@insyte/integrations-resend/ResendMailer"
import { QualityLinkService } from "@insyte/modules/quality/Quality"
import { PortalService } from "@insyte/modules/returns/Portal"
import type { Mailer } from "@insyte/modules/shared/domain/Mailer"
import type { ProductAnalytics } from "@insyte/modules/shared/domain/ProductAnalytics"
import { StoresService } from "@insyte/modules/stores/Stores"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Config, Effect, Layer, Option, Scheduler } from "effect"
import { FetchHttpClient, type HttpClient, HttpServer } from "effect/http"
import { AuthRoutes } from "../transports/http/AuthRoutes.ts"
import { ConnectRoutes, KlaviyoConnectRoutes, SlackConnectRoutes } from "../transports/http/ConnectRoutes.ts"
import { DevRoutes } from "../transports/http/DevRoutes.ts"
import { FileRoutes } from "../transports/http/FileRoutes.ts"
import { NotFound } from "../transports/http/NotFound.ts"
import { PortalRoutes } from "../transports/http/PortalRoutes.ts"
import { QualityMediaRoutes } from "../transports/http/QualityMediaRoutes.ts"
import { RealtimeRoutes } from "../transports/http/RealtimeRoutes.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { SupplierHookRoutes } from "../transports/http/SupplierHookRoutes.ts"
import { SystemRoutes } from "../transports/http/SystemRoutes.ts"
import { TrackingRoutes } from "../transports/http/TrackingRoutes.ts"
import { WebhookRoutes } from "../transports/http/WebhookRoutes.ts"
import { KeyDoor } from "../transports/public/KeyDoor.ts"
import { McpRoutes } from "../transports/public/McpRoutes.ts"
import { PublicApiRoutes } from "../transports/public/PublicApiRoutes.ts"
import { Resources } from "../transports/public/Resources.ts"
import { AuthenticatedLive } from "../transports/rpc/AuthenticatedLive.ts"
import { MemberLive } from "../transports/rpc/MemberLive.ts"
import { RpcContext, RpcRoutes } from "../transports/rpc/RpcRoutes.ts"
import { ShopperLive } from "../transports/rpc/ShopperLive.ts"
import { ViewerLive } from "../transports/rpc/ViewerLive.ts"
import { WithDbLive } from "../transports/rpc/WithDbLive.ts"
import { AnalysesLive } from "./Analyses.ts"
import { AuthHooksLive } from "./AuthHooks.ts"
import { BackfillsLive } from "./Backfills.ts"
import { AppInfo, BetaSettings, ConfigLive } from "./Bindings.ts"
import { ConnectionGateLive } from "./ConnectionGate.ts"
import { DocumentsChoice, FileStoreR2 } from "./Documents.ts"
import { ForwardSendsLive, SupplierApiChoice } from "./Forwarding.ts"
import { HumanCheck } from "./HumanCheck.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { IngestQueueLive } from "./IngestQueue.ts"
import { InvitationLinksLive } from "./InvitationLinks.ts"
import { KeyHasherLive } from "./KeyHasher.ts"
import { KlaviyoChoice, MarketingSyncsLive } from "./Klaviyo.ts"
import { LabelsChoice, ReturnLabelsLive } from "./Labels.ts"
import { MailerCapture } from "./Mail.ts"
import { NoteRepliesLive, SlackChoice, WebPushChoice } from "./Notify.ts"
import { ObservabilityLive } from "./Observability.ts"
import { ProductAnalyticsCapture } from "./ProductAnalyticsCapture.ts"
import { RateLimits } from "./RateLimits.ts"
import { RelayLive } from "./Relay.ts"
import { SealerLive } from "./Seal.ts"
import { ShopifyAdminChoice, ShopifyGraphqlChoice } from "./Shopify.ts"
import { ShopifyWritesLive } from "./ShopifyWrites.ts"
import { SliceLinks } from "./SliceLinks.ts"
import { TrackingChoice } from "./Tracking.ts"

/*
 * The composition root (16 §5): every implementation is chosen here, and the layer is built once per isolate. Nothing
 * that holds a socket belongs in it: a Worker forbids I/O objects shared across requests, so the database connection
 * is opened per request (`RequestDb.ts`), and the layer holds only the way to open one (`HyperdriveConnect`).
 */

const Transports = Layer.mergeAll(
  SystemRoutes,
  AuthRoutes,
  DevRoutes,
  RpcRoutes,
  RealtimeRoutes,
  ConnectRoutes,
  KlaviyoConnectRoutes,
  SlackConnectRoutes,
  WebhookRoutes,
  SupplierHookRoutes,
  TrackingRoutes,
  FileRoutes,
  PortalRoutes,
  QualityMediaRoutes,
  PublicApiRoutes,
  McpRoutes,
  RequestContext,
  NotFound
)

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

/** Product analytics (17 §5): PostHog where the stage has a key, a captured row the dev route reads where it has none. */
const ProductAnalyticsLive = Layer.unwrap(
  Effect.map(
    Config.Redacted("POSTHOG_API_KEY").pipe(Config.option),
    (key): Layer.Layer<ProductAnalytics, Config.ConfigError, Connect | HttpClient.HttpClient> =>
      Option.isSome(key) ? PostHogAnalytics : ProductAnalyticsCapture
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
  // The RPC handlers; the public API's and the MCP server's way in, and what a key reads (M19.2, M19.3).
  // …and the returns portal's and the quality link's, for their upload routes (M9.3, M9.4).
  Layer.provideMerge(
    Layer.mergeAll(
      RpcContext,
      KeyDoor.layer,
      Resources.layer,
      StoresService.layer,
      PortalService.layer,
      QualityLinkService.layer
    )
  ),
  Layer.provideMerge(WithDbLive),
  Layer.provideMerge(AuthenticatedLive),
  // …the signed-in person if any, and where a returns portal call came from (M9.3).
  Layer.provideMerge(Layer.mergeAll(ViewerLive, ShopperLive)),
  Layer.provideMerge(MemberLive.pipe(Layer.provide(Workspaces.layer))),
  // Committed events onto the queue, after commit (the outbox relay's kick).
  Layer.provideMerge(RelayLive),
  // What the server's secret keys: invitation links and API keys.
  // …and the sealer for external accounts' tokens, beside Shopify (M6.2).
  // …and the gate in front of every call for an external account (M6.3).
  Layer.provideMerge(
    Layer.mergeAll(
      InvitationLinksLive,
      KeyHasherLive,
      SealerLive,
      ShopifyAdminChoice,
      // …and Shopify's GraphQL for what a request reads again (a product's "Synchroniseren", M7.3).
      ShopifyGraphqlChoice,
      // …and Klaviyo's OAuth app and API (M7.5).
      KlaviyoChoice,
      // …and web push, Slack, and an answer to a notification mail as a comment (M11 step 13.5).
      WebPushChoice,
      SlackChoice,
      NoteRepliesLive,
      // …and a supplier's own API, for "Verbinding testen" (M8.2).
      SupplierApiChoice,
      // …and AfterShip, for its webhooks (M8.4).
      TrackingChoice,
      // …and Sendcloud, for whether return labels can be asked for (M9.2).
      LabelsChoice,
      // …and the files bucket, for downloads (M8.5).
      FileStoreR2,
      // …and Browser Rendering, for the dev route's close of the supplier statements (M13 step 6).
      DocumentsChoice,
      ConnectionGateLive,
      IngestQueueLive,
      // …and the first analysis's Workflow (M6.5).
      AnalysesLive,
      // …and where one slice's need meets another's use case.
      SliceLinks
    )
  ),
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

/**
 * What the queue consumer and the minute cron run on (M1.4): a connection per invocation, the sinks' ports (product
 * analytics, mail and the links it carries), the relay's kick for anything a sink writes, and the same configuration,
 * logging and spans as the routes. No routes.
 */
export const BackgroundLayer = Layer.mergeAll(
  ProductAnalyticsLive,
  MailerLive,
  InvitationLinksLive,
  RelayLive,
  // `store.connected` starts the store's backfill (M6.3).
  BackfillsLive,
  // An order changed in Insyte goes to Shopify (M7.1).
  ShopifyWritesLive,
  // A marketing sync goes to Klaviyo once its window has passed (M7.5).
  MarketingSyncsLive,
  // A forward goes to its suppliers once its window has passed (M8.2).
  ForwardSendsLive,
  // Return labels are made at the carrier once their window has passed (M9.2).
  ReturnLabelsLive,
  // A return label's PDF goes with the shopper's mail (M9.3).
  FileStoreR2,
  // Notes by push and in Slack, its token sealed; an answer to a notification mail as a comment (M11 step 13.5).
  WebPushChoice,
  SlackChoice,
  SealerLive,
  NoteRepliesLive
).pipe(
  Layer.provideMerge(HyperdriveConnect),
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(AppInfo.layer),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(ConfigLive),
  Layer.provideMerge(SyncScheduler)
)

/**
 * What the backfill Workflow's steps run on (M6.3): the background services, Shopify's bulk operations, and the gate
 * every call passes (`ConnectionGate.ts`), which holds the account's token and bucket.
 */
export const SyncLayer = Layer.mergeAll(
  ShopifyGraphqlChoice,
  ConnectionGateLive,
  RelayLive,
  KlaviyoChoice,
  SealerLive,
  // A forward's delivery (M8.2): a supplier's API, or the mail.
  SupplierApiChoice,
  MailerLive,
  // The tracking sweep (M8.4): AfterShip.
  TrackingChoice,
  // A return's label (M9.2): Sendcloud.
  LabelsChoice,
  // A forward's packing slip (M8.5): rendered and kept.
  DocumentsChoice,
  FileStoreR2,
  // Where one slice's need meets another's use case: the mirror's followers, a write-back's read again.
  SliceLinks
)
  .pipe(
    Layer.provideMerge(HyperdriveConnect),
    Layer.provideMerge(ObservabilityLive),
    Layer.provideMerge(AppInfo.layer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(ConfigLive),
    Layer.provideMerge(SyncScheduler)
  )
