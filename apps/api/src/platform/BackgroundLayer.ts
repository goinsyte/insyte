import { Layer, ManagedRuntime } from "effect"
import { AdSpendLive } from "./AdSpend.ts"
import { AutomationRunsLive } from "./AutomationRuns.ts"
import { BackfillsLive } from "./Backfills.ts"
import { ConnectionGateLive } from "./ConnectionGate.ts"
import { DocumentsChoice, FilePartsR2, FileStoreR2 } from "./Documents.ts"
import { EvidencePacksLive } from "./EvidencePacks.ts"
import { ExportRunsLive, ImportParsesLive } from "./Exports.ts"
import { ForwardSendsLive, SupplierApiChoice } from "./Forwarding.ts"
import { RatesChoice } from "./Fx.ts"
import { MailerLive, onInfra, ProductAnalyticsLive } from "./InfraLayer.ts"
import { InvitationLinksLive } from "./InvitationLinks.ts"
import { KlaviyoChoice, MarketingSyncsLive } from "./Klaviyo.ts"
import { LabelsChoice, ReturnLabelsLive } from "./Labels.ts"
import { ProviderGrantsLive } from "./links/ProviderGrants.ts"
import { NoteRepliesLive, SlackChoice, WebPushChoice } from "./Notify.ts"
import { PrivacyRunsLive } from "./PrivacyRuns.ts"
import { RelayLive } from "./Relay.ts"
import { SealerLive } from "./Seal.ts"
import { SendingDomainsChoice } from "./SendingDomains.ts"
import { ShopifyAdminChoice, ShopifyGraphqlChoice } from "./Shopify.ts"
import { ShopifyWritesLive } from "./ShopifyWrites.ts"
import { SliceLinks } from "./SliceLinks.ts"
import { TrackingChoice } from "./Tracking.ts"
import { WebhookRunsLive, WebhookSenderChoice } from "./Webhooks.ts"

/*
 * The background half (ADR-0041): what the
 * queue consumers, the cron and the Workflows run on, without the routes. The jobs Worker composes this and `InfraLayer.ts`
 * only.
 */

/**
 * What the queue consumer and the minute cron run on (M1.4): a connection per invocation, the sinks' ports (product
 * analytics, mail and the links it carries), the relay's kick for anything a sink writes, and the same configuration,
 * logging and spans as the routes. No routes.
 */
const BackgroundLayer = onInfra(Layer.mergeAll(
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
  // A case's evidence pack is gathered by its Workflow (M13 step 4).
  EvidencePacksLive,
  // An export, a shopper's package and a deletion's wait each run in their own Workflow (M17 step 5).
  PrivacyRunsLive,
  // An uploaded CSV is read, and an export written, by their Workflows (M14 step 5).
  ImportParsesLive,
  ExportRunsLive,
  // A trigger's event starts a flow's run (M12 step 3).
  AutomationRunsLive,
  // A return label's PDF goes with the shopper's mail (M9.3).
  FileStoreR2,
  // The nightly sweep empties an export's folder in the bucket (M14 step 5).
  FilePartsR2,
  // Notes by push and in Slack, its token sealed; an answer to a notification mail as a comment (M11 step 13.5).
  WebPushChoice,
  SlackChoice,
  SealerLive,
  NoteRepliesLive,
  // Ad spend from Meta and Google Ads (M13 step 5): not configured until Insyte has their app keys.
  AdSpendLive,
  // A committed fact's webhook deliveries, each started on its own run (M19.4).
  WebhookRunsLive,
  // The ECB's reference rates, into `fx_rates` on the cron's nightly turn (§0.4).
  RatesChoice,
  // The sending domains' daily re-check (M17 step 20.1c).
  SendingDomainsChoice
))

/**
 * What the backfill Workflow's steps run on (M6.3): the background services, Shopify's bulk operations, and the gate
 * every call passes (`ConnectionGate.ts`), which holds the account's token and bucket.
 */
export const SyncLayer = onInfra(Layer.mergeAll(
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
  // An export's parts joined into its file (M14 step 5).
  FilePartsR2,
  // Where one slice's need meets another's use case: the mirror's followers, a write-back's read again.
  SliceLinks.pipe(Layer.provide(LabelsChoice)),
  // A webhook delivery's attempt (M19.4): the endpoint, over fetch.
  WebhookSenderChoice,
  // A workspace's deletion (M17 step 5): each provider's grant given back before the tokens go.
  ProviderGrantsLive.pipe(
    Layer.provide(Layer.mergeAll(KlaviyoChoice, SlackChoice, SealerLive, ShopifyAdminChoice, ConnectionGateLive))
  )
))

/** The queue consumer's, the cron's and the inbound mail's runtime: built once per isolate, on first use. */
export const BackgroundRuntime = ManagedRuntime.make(BackgroundLayer)
