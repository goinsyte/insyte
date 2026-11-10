import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Neon from "@alchemy.run/neon"
import * as Alchemy from "alchemy"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { SENTRY_LOGS, SENTRY_TRACES } from "./shared.ts"

/** An unset GitHub secret arrives as an empty string: that is no secret. */
const set = (r: Redacted.Redacted<string>) => Redacted.value(r) !== ""

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
 * the three scenario workspaces, nobody's data), which expires after a week even if teardown never runs. Staging and production connect to their project's `main` by host (a GitHub
 * variable), and the stack creates nothing in Neon for them: adopting `main` would let `alchemy destroy` delete it.
 */
const Database = Effect.gen(function*() {
  const { stage } = yield* Alchemy.Stack
  const branch = stage.startsWith("pr-")
    ? yield* Neon.Branch("Db", {
      project: { projectId: yield* Config.String("NEON_PROJECT_ID") },
      name: stage,
      parentBranch: { name: "preview-base" },
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString()
    })
    : undefined
  const hyperdrive = yield* Cloudflare.Hyperdrive.Connection("Hd", {
    origin: {
      scheme: "postgres",
      host: branch === undefined ? yield* Config.String("DATABASE_HOST") : branch.origin.host,
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
    const environment = stage.startsWith("pr-") ? "preview" : stage
    const { branch, hyperdrive } = yield* Database

    /*
     * Turnstile (M2.2). Previews use Cloudflare's published test keys: they always pass, so the console's browser tests
     * get a token without solving anything, and the account's widget count is not spent on one widget per PR. Staging
     * and production get a widget each, for the console's own hostname, once the CI token may manage Turnstile
     * (`TURNSTILE_WIDGET=on` in the environment); until then they keep the test keys too.
     */
    const consoleHost = `insyte-console-${stage}.${WORKERS_SUBDOMAIN}`
    const ownWidget = environment !== "preview" &&
      (yield* Config.String("TURNSTILE_WIDGET").pipe(Config.withDefault("off"))) === "on"
    const widget = ownWidget
      ? yield* Cloudflare.Turnstile.Widget("Turnstile", {
        name: `insyte-${stage}`,
        domains: [consoleHost],
        mode: "managed"
      })
      : undefined

    /*
     * Google sign-in (M2.5), on staging and production once their GitHub environment has the stage's OAuth client: the
     * id is a variable (public), the secret a secret. Previews never: Google cannot list a redirect URI per PR.
     */
    const googleClientId = yield* Config.String("GOOGLE_CLIENT_ID").pipe(Config.withDefault(""))
    const googleClientSecret = yield* Config.Redacted("GOOGLE_CLIENT_SECRET").pipe(Config.option)
    const google = environment !== "preview" && googleClientId !== "" && Option.isSome(googleClientSecret)
      ? { GOOGLE_CLIENT_ID: googleClientId, GOOGLE_CLIENT_SECRET: googleClientSecret.value }
      : {}

    /*
     * Shopify (M6.2), on staging and production once their GitHub environment has the app's client (id and secret as
     * secrets) and the sealer's keyring, `SEAL_KEYS`: a store's token is never stored unsealed, so without
     * the keys the stage says it cannot connect a store yet. Previews never: the app lists one redirect URL per stage
     * (`shopify/shopify.app.toml`), not one per PR.
     */
    const sealKeys = environment === "preview"
      ? Option.none()
      : yield* Config.Redacted("SEAL_KEYS").pipe(Config.option)
    const shopifyClientId = yield* Config.String("SHOPIFY_CLIENT_ID").pipe(Config.withDefault(""))
    const shopifyClientSecret = yield* Config.Redacted("SHOPIFY_CLIENT_SECRET").pipe(Config.option)
    const seal = Option.isSome(sealKeys) ? { SEAL_KEYS: sealKeys.value } : {}
    const shopify = Option.isSome(sealKeys) && shopifyClientId !== "" && Option.isSome(shopifyClientSecret)
      ? { SHOPIFY_CLIENT_ID: shopifyClientId, SHOPIFY_CLIENT_SECRET: shopifyClientSecret.value }
      : {}
    // Klaviyo's OAuth app (M7.5), the same way: its client in the GitHub environment, and the sealer for the tokens.
    const klaviyoClientId = yield* Config.String("KLAVIYO_CLIENT_ID").pipe(Config.withDefault(""))
    const klaviyoClientSecret = Option.filter(yield* Config.Redacted("KLAVIYO_CLIENT_SECRET").pipe(Config.option), set)
    const klaviyo = Option.isSome(sealKeys) && klaviyoClientId !== "" && Option.isSome(klaviyoClientSecret)
      ? { KLAVIYO_CLIENT_ID: klaviyoClientId, KLAVIYO_CLIENT_SECRET: klaviyoClientSecret.value }
      : {}

    // AfterShip (M8.4): Insyte's own account, its key and webhook secret in the GitHub environment; without them, parcels
    // keep Shopify's own status.
    const aftershipKey = Option.filter(yield* Config.Redacted("AFTERSHIP_API_KEY").pipe(Config.option), set)
    const aftershipSecret = Option.filter(yield* Config.Redacted("AFTERSHIP_WEBHOOK_SECRET").pipe(Config.option), set)
    const aftership = Option.isSome(aftershipKey) && Option.isSome(aftershipSecret)
      ? { AFTERSHIP_API_KEY: aftershipKey.value, AFTERSHIP_WEBHOOK_SECRET: aftershipSecret.value }
      : {}

    // Sendcloud (M9.2): Insyte's own account for return labels, its keys in the GitHub environment; without them, no
    // labels and returns go back by "zelf versturen".
    const sendcloudPublic = Option.filter(yield* Config.Redacted("SENDCLOUD_PUBLIC_KEY").pipe(Config.option), set)
    const sendcloudSecret = Option.filter(yield* Config.Redacted("SENDCLOUD_SECRET_KEY").pipe(Config.option), set)
    const sendcloud = Option.isSome(sendcloudPublic) && Option.isSome(sendcloudSecret)
      ? { SENDCLOUD_PUBLIC_KEY: sendcloudPublic.value, SENDCLOUD_SECRET_KEY: sendcloudSecret.value }
      : {}

    /*
     * Mail (02 §5.1): previews always capture (the browser tests read the links back); staging and production send
     * through Resend once their environment says `MAIL_ADAPTER=resend` and has the key (the domain must be verified in
     * Resend first), and capture until then.
     */
    const mailAdapter = environment === "preview"
      ? "capture"
      : yield* Config.String("MAIL_ADAPTER").pipe(Config.withDefault("capture"))
    const resendKey = yield* Config.Redacted("RESEND_API_KEY").pipe(Config.option)
    const mail = mailAdapter === "resend" && Option.isSome(resendKey)
      ? { MAIL_ADAPTER: "resend", RESEND_API_KEY: resendKey.value }
      : { MAIL_ADAPTER: "capture" }

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
        BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
        VERSION: yield* Config.String("GITHUB_SHA").pipe(Config.withDefault("dev")),
        LOG_LEVEL: environment === "preview" ? "Debug" : "Info",
        OTEL_SERVICE_NAME: "insyte-api",
        // Spans to Sentry over OTLP (17 §7). The header carries the project's public key; bound as a secret anyway.
        OTEL_TRACES_EXPORTER: yield* Config.String("OTEL_TRACES_EXPORTER").pipe(Config.withDefault("none")),
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: yield* Config.String("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").pipe(
          Config.withDefault("")
        ),
        OTEL_EXPORTER_OTLP_HEADERS: Config.Redacted("OTEL_EXPORTER_OTLP_HEADERS"),
        OTEL_BSP_SCHEDULE_DELAY: yield* Config.String("OTEL_BSP_SCHEDULE_DELAY").pipe(Config.withDefault("3600000")),
        SENTRY_DSN: yield* Config.String("SENTRY_DSN").pipe(Config.withDefault("")),
        TURNSTILE_SITE_KEY: widget?.sitekey ?? "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: widget?.secret ?? Redacted.make("1x0000000000000000000000000000000AA"),
        // Invite-only (M2.2): beside `beta_allowlist`, the reserved test domain is admitted off production, for the tests.
        BETA_ALLOWED_DOMAINS: environment === "production" ? "" : "example.com",
        // Previews sit behind Access, and their browser tests all come from one CI runner: no limits per IP there.
        IP_LIMITS: environment === "preview" ? "off" : "on",
        ...google,
        ...seal,
        ...shopify,
        ...klaviyo,
        ...aftership,
        ...sendcloud,
        ...mail,
        // An unset GitHub variable arrives empty, not missing: empty means the default.
        MAIL_FROM: (yield* Config.String("MAIL_FROM").pipe(Config.withDefault(""))) ||
          "Insyte <noreply@mail.goinsyte.com>"
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
