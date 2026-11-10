import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Neon from "@alchemy.run/neon"
import * as Alchemy from "alchemy"
import { Config, Effect, Layer, Redacted } from "effect"
import { SENTRY_LOGS, SENTRY_TRACES } from "./shared.ts"
import { type Environment, OBSERVABILITY as SENTRY, STAGES } from "./stages.ts"

/*
 * The per-stage stack (14 §3): `pr-<n>` for a pull request's preview, later `staging` and `production`. Everything a
 * stage owns lives here, so `alchemy destroy --stage pr-<n>` removes exactly that preview and nothing shared. Our
 * Workers stay plain modules: this file names their entries and bindings, and app code never imports alchemy.
 *
 * Step 0 deploys what the walking skeleton needs: the stage's database (a Neon branch per preview), Hyperdrive to it as
 * insyte_app, the API Worker behind it and the console in front. Queues, R2, KV, further Durable Objects and Workflows join with the step that
 * first uses them.
 */

const COMPATIBILITY_DATE = "2026-10-26"

/** The account's workers.dev subdomain: each stage's console lives at insyte-console-<stage>.<this> until the cut-over. */
const WORKERS_SUBDOMAIN = "ishak-73d.workers.dev"

/**
 * Logs, traces and Issues for every Worker, sampled at 100 % through the MVP (17 §1), and exported to Sentry through
 * the account's destinations (`shared.ts`).
 */
const OBSERVABILITY = {
  enabled: true,
  logs: { enabled: true, headSamplingRate: 1, invocationLogs: true, persist: true, destinations: [SENTRY_LOGS] },
  traces: { enabled: true, headSamplingRate: 1, persist: true, destinations: [SENTRY_TRACES] }
}

/**
 * The reusable Access policy "Insyte reference": the people who may open any Insyte surface (Ishak and the founder, by
 * one-time email PIN). It already gates the design reference; the console joins it in every stage.
 */
const TEAM_POLICY_ID = "e885a0e2-97f8-4a1b-ba8e-cd9c500e51dc"

/**
 * Where a stage's data lives. A preview gets its own Neon branch of `preview-base` (`previews.ts`: staging's schema and
 * the three scenario workspaces, nobody's data), which expires after a week even if teardown never runs. Staging and production connect to their project's `main` by host (`stages.ts`), and the stack creates nothing in Neon for them: adopting `main` would let `alchemy destroy` delete it.
 */
const Database = (environment: Environment) =>
  Effect.gen(function*() {
    const { stage } = yield* Alchemy.Stack
    const branch = environment === "preview"
      ? yield* Neon.Branch("Db", {
        project: { projectId: STAGES.preview.neonProjectId },
        name: stage,
        parentBranch: { name: "preview-base" },
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString()
      })
      : undefined
    const host = branch?.origin.host ?? STAGES[environment].databaseHost
    if (host === undefined) return yield* Effect.die(new Error(`stages.ts gives ${environment} no database host`))
    const hyperdrive = yield* Cloudflare.Hyperdrive.Connection("Hd", {
      origin: {
        scheme: "postgres",
        host,
        port: 5432,
        database: "insyte",
        user: "insyte_app",
        password: yield* Config.Redacted("INSYTE_APP_DB_PASSWORD")
      },
      // A read after a write must see the write.
      caching: { disabled: true }
    })
    return { branch, hyperdrive }
  })

export default Alchemy.Stack(
  "insyte",
  // Neon's provider uses the HTTP client Cloudflare's provides, so they are composed in order, not side by side.
  { providers: Neon.providers().pipe(Layer.provideMerge(Cloudflare.providers())), state: Cloudflare.state() },
  Effect.gen(function*() {
    const { stage } = yield* Alchemy.Stack
    const environment = (stage.startsWith("pr-") ? "preview" : stage) as Environment
    const config = STAGES[environment]
    const { branch, hyperdrive } = yield* Database(environment)

    /*
     * Turnstile (M2.2). Previews use Cloudflare's published test keys: they always pass, so the console's browser tests
     * get a token without solving anything, and the account's widget count is not spent on one widget per PR. Staging
     * and production get a widget each, for the console's own hostname (`turnstileWidget` in `stages.ts`).
     */
    const consoleHost = `insyte-console-${stage}.${WORKERS_SUBDOMAIN}`
    const widget = config.turnstileWidget
      ? yield* Cloudflare.Turnstile.Widget("Turnstile", {
        name: `insyte-${stage}`,
        domains: [consoleHost],
        mode: "managed"
      })
      : undefined

    /*
     * The API's secrets (`WORKER_SECRETS` in `stages.ts`) are not the deploy's: staging and production have them set on
     * the Worker by hand, and a deploy leaves a secret it did not upload alone. Each integration stays off until its
     * secrets are there. A preview's auth secret is generated once and kept in its stack's state.
     */
    const previewAuth = environment === "preview" ? yield* Alchemy.Random("AuthSecret") : undefined

    /*
     * The outbox relay (M1.4): committed events' ids go onto EVENTS, which this stage's API Worker consumes; what fails
     * its retries lands in the dead-letter queue. EU jurisdiction, which can only be set at creation. The minute sweep
     * for events a kick missed runs on staging and production only: an account has few cron triggers, and a preview
     * each would spend them.
     */
    // Files (M8.5): packing slips now, uploads later; in the EU, one bucket per stage.
    // A preview's files are test data: its teardown empties the bucket (R2 refuses to delete a full one). Staging and
    // production keep that refusal.
    const files = yield* Cloudflare.R2.Bucket("Files", {
      name: `insyte-files-${stage}`,
      jurisdiction: "eu",
      forceDestroy: stage.startsWith("pr-")
    })
    const events = yield* Cloudflare.Queues.Queue("Events", { name: `insyte-events-${stage}`, jurisdiction: "eu" })
    const deadEvents = yield* Cloudflare.Queues.Queue("EventsDlq", {
      name: `insyte-events-dlq-${stage}`,
      jurisdiction: "eu"
    })

    // Shopify's webhooks (M6.3): received deliveries' ids, applied by this stage's API Worker; EU like the events.
    const ingest = yield* Cloudflare.Queues.Queue("Ingest", { name: `insyte-ingest-${stage}`, jurisdiction: "eu" })
    const deadIngest = yield* Cloudflare.Queues.Queue("IngestDlq", {
      name: `insyte-ingest-dlq-${stage}`,
      jurisdiction: "eu"
    })

    const api = yield* Cloudflare.Worker("Api", {
      name: `insyte-api-${stage}`,
      main: "../apps/api/src/Main.ts",
      compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat", "enable_request_signal"] },
      placement: { region: "aws:eu-central-1" },
      ...(environment === "preview" ? {} : { crons: ["* * * * *"] }),
      // The public API and the MCP server (M19.2, M19.3) on the Worker's own hostname; the rest only through the console.
      workersDev: true,
      observability: OBSERVABILITY,
      env: {
        HYPERDRIVE: hyperdrive,
        FILES: files,
        // Browser Rendering (M8.5): packing slips as PDF.
        BROWSER: Cloudflare.Browser("BROWSER"),
        EVENTS: events,
        INGEST: ingest,
        // The edge guards' counters (M2.3), hosted by this Worker (`RateLimiter` in Main.ts); SQLite-backed.
        RATE_LIMITER: Cloudflare.DurableObject("RateLimiter", { className: "RateLimiter" }),
        // The realtime rooms (M5.1), hosted by this Worker (`RoomDurableObject` in Main.ts): sockets and presence only.
        ROOMS: Cloudflare.DurableObject("Rooms", { className: "RoomDurableObject" }),
        // The gate per external account (M6.3), hosted by this Worker (`ConnectionGateObject`): token and bucket.
        CONNECTION_GATE: Cloudflare.DurableObject("ConnectionGate", { className: "ConnectionGateObject" }),
        // A store's first import (M6.3), hosted by this Worker (`ShopifyBackfillWorkflow`); one per stage.
        SHOPIFY_BACKFILL: Cloudflare.Workflow("ShopifyBackfill", {
          className: "ShopifyBackfillWorkflow",
          workflowName: `insyte-shopify-backfill-${stage}`
        }),
        // A store's first analysis (M6.5), hosted by this Worker (`FirstAnalysisWorkflow`); one per stage.
        FIRST_ANALYSIS: Cloudflare.Workflow("FirstAnalysis", {
          className: "FirstAnalysisWorkflow",
          workflowName: `insyte-first-analysis-${stage}`
        }),
        // An order change to Shopify (M7.1), hosted by this Worker (`ShopifyWriteWorkflow`); one per stage.
        SHOPIFY_WRITE: Cloudflare.Workflow("ShopifyWrite", {
          className: "ShopifyWriteWorkflow",
          workflowName: `insyte-shopify-write-${stage}`
        }),
        // A marketing sync's send to Klaviyo (M7.5), hosted by this Worker (`MarketingSyncWorkflow`); one per stage.
        MARKETING_SYNC: Cloudflare.Workflow("MarketingSync", {
          className: "MarketingSyncWorkflow",
          workflowName: `insyte-marketing-sync-${stage}`
        }),
        // A forward's delivery to its suppliers (M8.2), hosted by this Worker (`ForwardSendWorkflow`); one per stage.
        FORWARD_SEND: Cloudflare.Workflow("ForwardSend", {
          className: "ForwardSendWorkflow",
          workflowName: `insyte-forward-send-${stage}`
        }),
        // A return's label from the carrier (M9.2), hosted by this Worker (`ReturnLabelWorkflow`); one per stage.
        RETURN_LABEL: Cloudflare.Workflow("ReturnLabel", {
          className: "ReturnLabelWorkflow",
          workflowName: `insyte-return-label-${stage}`
        }),
        ENVIRONMENT: environment,
        // Where `Main.ts` serves `/v1` and nothing else.
        PUBLIC_API_HOST: `insyte-api-${stage}.${WORKERS_SUBDOMAIN}`,
        // better-auth: cookies, links in mail and the CSRF check name the console's origin (18 §2).
        CONSOLE_ORIGIN: `https://${consoleHost}`,
        ...(previewAuth === undefined ? {} : { BETTER_AUTH_SECRET: previewAuth.text }),
        VERSION: yield* Config.String("GITHUB_SHA").pipe(Config.withDefault("dev")),
        LOG_LEVEL: environment === "preview" ? "Debug" : "Info",
        OTEL_SERVICE_NAME: "insyte-api",
        // Spans to Sentry over OTLP (17 §7). The header carries the project's public key; bound as a secret anyway.
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: SENTRY.tracesEndpoint,
        OTEL_EXPORTER_OTLP_HEADERS: Redacted.make(SENTRY.headers),
        OTEL_BSP_SCHEDULE_DELAY: SENTRY.scheduleDelay,
        SENTRY_DSN: SENTRY.dsn,
        TURNSTILE_SITE_KEY: widget?.sitekey ?? "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: widget?.secret ?? Redacted.make("1x0000000000000000000000000000000AA"),
        // Invite-only (M2.2): beside `beta_allowlist`, the reserved test domain is admitted off production, for the tests.
        BETA_ALLOWED_DOMAINS: environment === "production" ? "" : "example.com",
        // Previews sit behind Access, and their browser tests all come from one CI runner: no limits per IP there.
        IP_LIMITS: environment === "preview" ? "off" : "on",
        // Google sign-in (M2.5) on a stage with its OAuth client; previews never, Google lists no redirect URI per PR.
        ...(config.googleClientId === undefined ? {} : { GOOGLE_CLIENT_ID: config.googleClientId }),
        // Mail (02 §5.1): previews always capture, the browser tests read the links back.
        MAIL_ADAPTER: config.mailAdapter,
        MAIL_FROM: "Insyte <noreply@mail.goinsyte.com>"
      }
    })

    yield* Cloudflare.Queues.Consumer("EventsConsumer", {
      queueId: events.queueId,
      scriptName: api.workerName,
      deadLetterQueue: deadEvents.queueName,
      settings: { batchSize: 10, maxWaitTimeMs: 1000, maxRetries: 5 }
    })

    yield* Cloudflare.Queues.Consumer("IngestConsumer", {
      queueId: ingest.queueId,
      scriptName: api.workerName,
      deadLetterQueue: deadIngest.queueName,
      settings: { batchSize: 10, maxWaitTimeMs: 1000, maxRetries: 8 }
    })

    // CI's smoke test gets past Access with a service token (CF_ACCESS_CLIENT_ID / _SECRET in each environment).
    const ci = yield* Cloudflare.Access.Policy("Ci", {
      name: `insyte-ci-${stage}`,
      decision: "non_identity",
      include: ["anyValidServiceToken"]
    })

    const console = yield* Cloudflare.Worker("Console", {
      name: `insyte-console-${stage}`,
      // TanStack Start's build output, uploaded as built: `bun run --filter @insyte/console build` runs first.
      main: "../apps/console/dist/server/index.js",
      bundle: false,
      assets: { directory: "../apps/console/dist/client" },
      compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat"] },
      placement: { region: "aws:eu-central-1" },
      observability: OBSERVABILITY,
      // Every stage behind Access until the cut-over decides what is public (18 §5).
      access: {
        name: `Insyte console · ${stage}`,
        sessionDuration: "24h",
        policies: [{ policyId: TEAM_POLICY_ID }, ci]
      },
      env: { API: api, ENVIRONMENT: environment }
    })

    /*
     * The realtime socket (M5.1) past Access: a browser's WebSocket handshake carries cookies but no custom headers, so
     * CI's service token cannot reach it and Access answered with a 302. `/api/realtime` checks the session cookie
     * itself, and a session is only had by signing in behind Access, so this one path bypasses it (founder's decision,
     * 2026-11-08). A host-and-path application takes precedence over the Worker's own.
     */
    yield* Cloudflare.Access.Application("RealtimeBypass", {
      type: "self_hosted",
      name: `Insyte realtime · ${stage}`,
      domain: `${consoleHost}/api/realtime`,
      policies: [{ decision: "bypass", include: ["everyone"] }]
    })

    return { console: console.url.as<string>(), api: api.workerName, branch: branch?.branchId }
  })
)
