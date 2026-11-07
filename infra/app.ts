import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Neon from "@alchemy.run/neon"
import * as Alchemy from "alchemy"
import { Config, Effect, Layer } from "effect"
import { SENTRY_LOGS, SENTRY_TRACES } from "./shared.ts"

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
 * Where a stage's data lives. A preview gets its own Neon branch of the migrated nonprod `main`, which expires after a
 * week even if teardown never runs. Staging and production connect to their project's `main` by host (a GitHub
 * variable), and the stack creates nothing in Neon for them: adopting `main` would let `alchemy destroy` delete it.
 */
const Database = Effect.gen(function*() {
  const { stage } = yield* Alchemy.Stack
  const branch = stage.startsWith("pr-")
    ? yield* Neon.Branch("Db", {
      project: { projectId: yield* Config.String("NEON_PROJECT_ID") },
      name: stage,
      parentBranch: { name: "main" },
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

    const api = yield* Cloudflare.Worker("Api", {
      name: `insyte-api-${stage}`,
      main: "../apps/api/src/Main.ts",
      compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat", "enable_request_signal"] },
      placement: { region: "aws:eu-central-1" },
      // Reached only through the console's service binding, never on a public hostname of its own.
      workersDev: false,
      observability: OBSERVABILITY,
      env: {
        HYPERDRIVE: hyperdrive,
        // The edge guards' counters (M2.3), hosted by this Worker (`RateLimiter` in Main.ts); SQLite-backed.
        RATE_LIMITER: Cloudflare.DurableObject("RateLimiter", { className: "RateLimiter" }),
        ENVIRONMENT: environment,
        // better-auth: cookies, links in mail and the CSRF check name the console's origin (18 §2).
        CONSOLE_ORIGIN: `https://insyte-console-${stage}.${WORKERS_SUBDOMAIN}`,
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
        // Cloudflare's always-passes test key until each environment has its widget (infra/shared.ts).
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA"
      }
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

    return { console: console.url.as<string>(), api: api.workerName, branch: branch?.branchId }
  })
)
