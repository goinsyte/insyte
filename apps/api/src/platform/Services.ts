import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { PwnedPasswords } from "@insyte/integrations-better-auth/PwnedPasswords"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { CoursesService } from "@insyte/modules/courses/Courses"
import { LiveService } from "@insyte/modules/live/Live"
import { QualityLinkService } from "@insyte/modules/quality/Quality"
import { PortalService } from "@insyte/modules/returns/Portal"
import { StoresService } from "@insyte/modules/stores/Stores"
import { SupplierPortalService } from "@insyte/modules/supplier-portal/SupplierPortal"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, type HttpClient, HttpServer } from "effect/http"
import { KeyDoor } from "../transports/public/KeyDoor.ts"
import { AuthenticatedLive } from "../transports/rpc/AuthenticatedLive.ts"
import { MemberLive } from "../transports/rpc/MemberLive.ts"
import { ShopperLive } from "../transports/rpc/ShopperLive.ts"
import { SupplierContactLive } from "../transports/rpc/SupplierContactLive.ts"
import { ViewerLive } from "../transports/rpc/ViewerLive.ts"
import { WithDbLive } from "../transports/rpc/WithDbLive.ts"
import { AnalysesLive } from "./Analyses.ts"
import { AuthHooksLive } from "./AuthHooks.ts"
import { AutomationRunsLive } from "./AutomationRuns.ts"
import { AppInfo, BetaSettings, ConfigLive } from "./Bindings.ts"
import { ConnectionGateLive } from "./ConnectionGate.ts"
import { DocumentsChoice, FileStoreR2 } from "./Documents.ts"
import { SupplierApiChoice } from "./Forwarding.ts"
import { RatesChoice } from "./Fx.ts"
import { HumanCheck } from "./HumanCheck.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { MailerLive, SyncScheduler } from "./InfraLayer.ts"
import { IngestQueueLive } from "./IngestQueue.ts"
import { InvitationLinksLive } from "./InvitationLinks.ts"
import { KeyHasherLive } from "./KeyHasher.ts"
import { KlaviyoChoice } from "./Klaviyo.ts"
import { LabelsChoice } from "./Labels.ts"
import { AppKeysLive } from "./links/AppKeys.ts"
import { LiveRoomsLive } from "./LiveRooms.ts"
import { NoteRepliesLive, SlackChoice, WebPushChoice } from "./Notify.ts"
import { ObservabilityLive } from "./Observability.ts"
import { RateLimits } from "./RateLimits.ts"
import { RelayLive } from "./Relay.ts"
import { SealerLive } from "./Seal.ts"
import { SendingDomainsChoice } from "./SendingDomains.ts"
import { ShopifyAdminChoice, ShopifyGraphqlChoice } from "./Shopify.ts"
import { SliceLinks } from "./SliceLinks.ts"
import { TrackingChoice } from "./Tracking.ts"
import { WebhookRunsLive } from "./Webhooks.ts"

/*
 * The services a request may need (16 §5, ADR-0041): every implementation is chosen here, under the routes a Worker
 * serves. The API Worker puts its routes and the console's RPC handlers on it (`AppLayer.ts`), the public Worker the
 * public API and the MCP server (`PublicLayer.ts`). A module of its own, without the routes, so a Worker loads only
 * the routes it serves.
 */

/** The breached-password check asks HIBP from deployed stages only, so local runs and the worker tests stay offline. */
const PwnedPasswordsLive = Layer.unwrap(
  Effect.map(
    Config.String("ENVIRONMENT"),
    (environment): Layer.Layer<PwnedPasswords, never, HttpClient.HttpClient> =>
      environment === "local" ? PwnedPasswords.layerOffline : PwnedPasswords.layer
  )
)

/** The entry points the routes call: the key door, and the services of the routes that are not RPC. */
const Entries = Layer.mergeAll(
  // The public API's and the MCP server's way in (M19.2, M19.3).
  KeyDoor.layer,
  // …and the returns portal's and the quality link's, for their upload routes (M9.3, M9.4); courses' for theirs and
  // the file route (M17).
  // …and the chargebacks', for a case's evidence (M13 step 4).
  StoresService.layer,
  PortalService.layer,
  QualityLinkService.layer,
  ChargebacksService.layer,
  CoursesService.layer,
  // …and the Web Pixel's ingest (M14 step 3).
  LiveService.layer
)

/** What both the API's and the public Worker's routes stand on: the slices' adapters, mail, limits, the database. */
const onCore = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
  layer.pipe(
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
        // …and the ECB's reference rates, for the dev route that fills `fx_rates` (§0.4).
        RatesChoice,
        // …and Sendcloud, for whether return labels can be asked for (M9.2).
        LabelsChoice,
        // …and the brand's sending domain at Resend, for E-mail en domein (M17 step 20.1c).
        SendingDomainsChoice,
        // …and the files bucket, for downloads (M8.5).
        FileStoreR2,
        // …and Browser Rendering, for the dev route's close of the supplier statements (M13 step 6).
        DocumentsChoice,
        ConnectionGateLive,
        IngestQueueLive,
        // …and the first analysis's Workflow (M6.5).
        AnalysesLive,
        // …and a flow's runs: "Opnieuw", stopping one, the answer to "Goedkeuring vragen" (M12 step 5).
        AutomationRunsLive,
        // …and the live rooms (M14 step 3).
        LiveRoomsLive,
        // …and where one slice's need meets another's use case (a filed plate's return label is Sendcloud's).
        SliceLinks.pipe(Layer.provide(LabelsChoice)),
        // …and a webhook delivery's run, for a test send and a redelivery (M19.4).
        WebhookRunsLive,
        // …and the Marketplace's recipe apps' keys, under the same hasher (M17).
        AppKeysLive.pipe(Layer.provide(KeyHasherLive))
      )
    ),
    Layer.provideMerge(MailerLive),
    // The edge guards' counters; the Durable Object binding is read per call.
    Layer.provideMerge(RateLimits.layer),
    // Read per request by the routes and the RPC middleware; building it opens no socket.
    Layer.provideMerge(HyperdriveConnect),
    Layer.provideMerge(ObservabilityLive),
    Layer.provideMerge(AppInfo.layer),
    Layer.provide([FetchHttpClient.layer, HttpServer.layerServices]),
    Layer.provide(ConfigLive),
    Layer.provideMerge(SyncScheduler)
  )

/**
 * The API Worker's routes over every service: the entry points, a person's session (better-auth, the signed-in
 * person, the member and their workspace, the human check, the beta gate), and the core.
 */
export const onServices = <A, E, R>(routes: Layer.Layer<A, E, R>) =>
  onCore(routes.pipe(
    Layer.provideMerge(Entries),
    Layer.provideMerge(WithDbLive),
    Layer.provideMerge(AuthenticatedLive),
    // …the signed-in person if any, and where a returns portal call came from (M9.3).
    Layer.provideMerge(Layer.mergeAll(ViewerLive, ShopperLive)),
    Layer.provideMerge(MemberLive.pipe(Layer.provide(Workspaces.layer))),
    Layer.provideMerge(SupplierContactLive.pipe(Layer.provide(SupplierPortalService.layer))),
    // better-auth, built per request by the auth routes and the session check, over the app's hooks.
    Layer.provideMerge(BetterAuth.layer),
    Layer.provideMerge(AuthHooksLive),
    Layer.provideMerge(PwnedPasswordsLive),
    Layer.provideMerge(HumanCheck.layer),
    Layer.provideMerge(BetaSettings.layer)
  ))

/** The public Worker's routes (ADR-0041 step 5): a key, not a session, so the entry points and the core only. */
export const onKeys = <A, E, R>(routes: Layer.Layer<A, E, R>) => onCore(routes.pipe(Layer.provideMerge(Entries)))
