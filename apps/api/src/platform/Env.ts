import type { AutomationRunParams } from "../workflows/AutomationRun.ts"
import type { EvidencePackParams } from "../workflows/EvidencePack.ts"
import type { ExportParams } from "../workflows/Export.ts"
import type { AnalysisParams } from "../workflows/FirstAnalysis.ts"
import type { ForwardSendParams } from "../workflows/ForwardSend.ts"
import type { ImportParseParams } from "../workflows/ImportParse.ts"
import type { MarketingSyncParams } from "../workflows/MarketingSync.ts"
import type { MonthlyCloseParams } from "../workflows/MonthlyClose.ts"
import type { ReturnLabelParams } from "../workflows/ReturnLabel.ts"
import type { BackfillParams } from "../workflows/ShopifyBackfill.ts"
import type { ShopifyWriteParams } from "../workflows/ShopifyWrite.ts"
import type { WebhookDeliveryParams } from "../workflows/WebhookDelivery.ts"
import type { ConnectionGateObject } from "./ConnectionGate.ts"
import type { IngestMessage } from "./IngestQueue.ts"
import type { LiveRoomDurableObject } from "./LiveRoom.ts"
import type { RateLimiter } from "./RateLimiter.ts"
import type { EventsMessage } from "./Relay.ts"
import type { RoomDurableObject } from "./Room.ts"

/*
 * What `env` holds (02 §5.1). Merged into `Cloudflare.Env`, which types `env` from `cloudflare:workers`. Bindings join
 * with the step that first uses them, with the name infra gives them. One interface for both Workers (ADR-0041): each
 * deployed Worker is given the part it reads (`infra/app.ts`), and the local Worker (`Local.ts`) all of it.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** Postgres through Hyperdrive, as `insyte_app`. Caching off: a read after a write must see the write. */
      readonly HYPERDRIVE: Hyperdrive
      /** Sign-in, sign-up and mail limits per IP and per address (`RateLimiter`, M2.3). */
      readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>
      /** The realtime rooms (M5.1): one per audience, `ws:<workspace>`; sockets and presence only. */
      readonly ROOMS: DurableObjectNamespace<RoomDurableObject>
      /** The gate per external account (M6.3): its token, its bucket; by connection id (`ConnectionGate.ts`). */
      readonly CONNECTION_GATE: DurableObjectNamespace<ConnectionGateObject>
      /** The live rooms (M14 step 3): one per workspace, `ws:<workspace>`; storefront visitors in memory only. */
      readonly LIVE: DurableObjectNamespace<LiveRoomDurableObject>
      /** A store's first import (M6.3): one instance per connect (`ShopifyBackfillWorkflow`). */
      readonly SHOPIFY_BACKFILL: Workflow<BackfillParams>
      /** A store's first analysis (M6.5): one instance per analysis (`FirstAnalysisWorkflow`). */
      readonly FIRST_ANALYSIS: Workflow<AnalysisParams>
      /** An order change to Shopify (M7.1): one instance per outbox event (`ShopifyWriteWorkflow`). */
      readonly SHOPIFY_WRITE: Workflow<ShopifyWriteParams>
      /** A marketing sync's send to Klaviyo (M7.5): one instance per outbox event (`MarketingSyncWorkflow`). */
      readonly MARKETING_SYNC: Workflow<MarketingSyncParams>
      /** A forward's delivery to its suppliers (M8.2): one instance per outbox event (`ForwardSendWorkflow`). */
      readonly FORWARD_SEND: Workflow<ForwardSendParams>
      /** A return's label from the carrier (M9.2): one instance per outbox event (`ReturnLabelWorkflow`). */
      readonly RETURN_LABEL: Workflow<ReturnLabelParams>
      /** A case's evidence pack (M13 step 4): one instance per run (`EvidencePackWorkflow`). */
      readonly EVIDENCE_PACK: Workflow<EvidencePackParams>
      /** A flow's run (M12 step 3): one instance per run (`AutomationRunWorkflow`). */
      readonly AUTOMATION_RUN: Workflow<AutomationRunParams>
      /** A webhook delivery's attempts (M19.4): one instance per delivery (`WebhookDeliveryWorkflow`). */
      readonly WEBHOOK_DELIVERY: Workflow<WebhookDeliveryParams>
      /** `recorded` in the worker tests: no endpoint is called, the URL decides the answer. */
      readonly WEBHOOK_ADAPTER?: string
      /** The supplier statements' monthly close (M13 step 6): one instance per month (`MonthlyCloseWorkflow`). */
      readonly MONTHLY_CLOSE: Workflow<MonthlyCloseParams>
      /** An uploaded CSV read into rows (M14 step 5): one instance per import (`ImportParseWorkflow`). */
      readonly IMPORT_PARSE: Workflow<ImportParseParams>
      /** An export written, whatever its source (M14 step 5): one instance per export (`ExportWorkflow`). */
      readonly EXPORT: Workflow<ExportParams>
      /** The Klaviyo OAuth app (M7.5); without both, Klaviyo cannot be connected. `recorded` in the worker tests. */
      readonly KLAVIYO_CLIENT_ID?: string
      readonly KLAVIYO_CLIENT_SECRET?: string
      readonly KLAVIYO_ADAPTER?: string
      /** Web push (M11 step 13.5): the VAPID key pair and contact; without all three, push is not available. */
      readonly VAPID_PUBLIC_KEY?: string
      readonly VAPID_PRIVATE_KEY?: string
      readonly VAPID_SUBJECT?: string
      /** `recorded` in the worker tests: no push service is called. */
      readonly PUSH_ADAPTER?: string
      /** The Slack app (M11 step 13.5); without both, Slack cannot be connected. `recorded` in the worker tests. */
      readonly SLACK_CLIENT_ID?: string
      readonly SLACK_CLIENT_SECRET?: string
      readonly SLACK_ADAPTER?: string
      /**
       * Insyte AI (M15 step 1): Claude through the stage's AI Gateway (account, gateway, the Anthropic key, the
       * gateway's token where it is authenticated). Without the first three there is no model. `AI_ADAPTER=fake`
       * (local runs and the worker tests) answers with the fake whatever keys are set.
       */
      readonly AI_ADAPTER?: string
      readonly ANTHROPIC_API_KEY?: string
      readonly AI_GATEWAY_ID?: string
      readonly AI_ACCOUNT_ID?: string
      readonly AI_GATEWAY_TOKEN?: string
      /** Shopify's webhooks (M6.3): received deliveries' ids, applied by the jobs Worker's `queue` handler. */
      readonly INGEST: Queue<IngestMessage>
      /** Lines per backfill page, 2000 by default; the worker tests read small pages. */
      readonly SYNC_PAGE_LINES?: string
      /** Files (M8.5): packing slips now, uploads later, one bucket per stage. */
      readonly FILES: R2Bucket
      /** Browser Rendering (M8.5): packing slips as PDF, and an evidence pack's documents (M13 step 4). */
      readonly BROWSER: BrowserRun
      /** `html` in the worker tests, which have no browser: the slip is stored as its HTML. */
      readonly DOCUMENTS_ADAPTER?: string
      /** The outbox relay's queue (M1.4): committed events' ids, consumed by the jobs Worker's `queue` handler. */
      readonly EVENTS: Queue<EventsMessage>
      readonly ENVIRONMENT: "local" | "preview" | "staging" | "production"
      /**
       * The Worker's own public hostname (`*.workers.dev`), where only the public API answers (M19.2). Locally a name
       * no request carries but a test's.
       */
      readonly PUBLIC_API_HOST?: string
      /**
       * The public Worker (ADR-0041 step 5), which the API Worker hands `/v1` and `/mcp`. Locally the Worker itself:
       * `Local.ts` routes those paths to the public handler, so it is never called there.
       */
      readonly PUBLIC: Fetcher
      /** The Shopify app (M6.2): its client id (a var) and secret; without both, stores can only be connected later. */
      readonly SHOPIFY_CLIENT_ID?: string
      readonly SHOPIFY_CLIENT_SECRET?: string
      /** The Admin API version, `2026-10` by default (integrations.md §2). */
      readonly SHOPIFY_API_VERSION?: string
      /** `recorded`: Shopify's recorded twin answers (the worker tests). Anything else, or absent, is Shopify. */
      readonly SHOPIFY_ADAPTER?: string
      /** A secret: the sealer's keyring, comma-separated base64 keys, newest first (integrations.md §1.2). */
      readonly SEAL_KEYS?: string
      /** The console's origin: better-auth's baseURL, cookies and links in mail (18 §2). */
      readonly CONSOLE_ORIGIN: string
      /** A secret: signs better-auth's cookies and tokens. Absent locally (a fixed development value stands in). */
      readonly BETTER_AUTH_SECRET?: string
      /** The commit sha, set by the deploy. Absent locally. */
      readonly VERSION?: string
      readonly LOG_LEVEL?: string
      readonly TURNSTILE_SITE_KEY?: string
      /** A secret: verifies Turnstile tokens. Absent locally, where nothing asks for Turnstile (`HumanCheck.ts`). */
      readonly TURNSTILE_SECRET_KEY?: string
      /** Google's OAuth client for this stage (not a secret: it is in every sign-in URL). Absent on previews. */
      readonly GOOGLE_CLIENT_ID?: string
      /** A secret: Google's OAuth client secret. */
      readonly GOOGLE_CLIENT_SECRET?: string
      /** `resend` sends mail through Resend; anything else, or absent, captures it for the dev route (02 §5.1). */
      readonly MAIL_ADAPTER?: string
      /** The sender, `Insyte <noreply@mail.goinsyte.com>` by default. */
      readonly MAIL_FROM?: string
      /** A secret: Resend's sending key, where `MAIL_ADAPTER=resend`. */
      readonly RESEND_API_KEY?: string
      /** `off` turns off the limits per IP (previews, behind Access); anything else, or absent, keeps them (M2.3). */
      readonly IP_LIMITS?: string
      /** A secret: PostHog's project key. Absent: product events are captured for the dev route instead (17 §5). */
      readonly POSTHOG_API_KEY?: string
      readonly POSTHOG_HOST?: string
      /** `off` admits every address; anything else, or absent, keeps the beta gate shut (M2.2). */
      readonly BETA_GATE?: string
      /** Comma-separated domains admitted on this stage beside `beta_allowlist`. */
      readonly BETA_ALLOWED_DOMAINS?: string
      /** The console's Sentry DSN, public by design; returned by `GET /api/config`. */
      readonly SENTRY_DSN?: string
      readonly OTEL_SERVICE_NAME?: string
      readonly OTEL_TRACES_EXPORTER?: string
      readonly OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string
      /** A secret: `x-sentry-auth=…`. */
      readonly OTEL_EXPORTER_OTLP_HEADERS?: string
      readonly OTEL_BSP_SCHEDULE_DELAY?: string
    }
  }
}

export type Env = Cloudflare.Env
