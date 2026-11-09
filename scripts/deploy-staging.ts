/*
 * Staging deployed from a laptop, the same steps as backend.yml's staging job, for when GitHub Actions cannot run:
 * build the console, check the providers, migrate the database, deploy the stack, smoke it from outside.
 *
 *   bun --env-file ~/vantion/insyte/.env.staging run deploy:staging
 *
 * The secrets come from that file (outside the repo; `.env.staging.example` names them): GitHub never gives a secret
 * back. The staging environment's variables, which are not secret, are read from GitHub when the file leaves them
 * out. Only names are ever printed, never a value. Staging only: production stays with CI and an explicit ask.
 */
import { spawnSync } from "node:child_process"

const WORKERS_SUBDOMAIN = "ishak-73d.workers.dev"

/** What backend.yml's staging job sets from the environment's secrets. */
const SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "NEON_API_KEY",
  "INSYTE_APP_DB_PASSWORD",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL_OWNER",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SEAL_KEYS",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET"
] as const

/** …and from its variables, which GitHub does give back. */
const VARIABLES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "NEON_PROJECT_ID",
  "DATABASE_HOST",
  "GOOGLE_CLIENT_ID",
  "MAIL_ADAPTER",
  "TURNSTILE_WIDGET",
  "SENTRY_DSN",
  "OTEL_TRACES_EXPORTER",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_BSP_SCHEDULE_DELAY"
] as const

const env: Record<string, string> = { ...process.env } as Record<string, string>

for (const name of VARIABLES) {
  if (env[name] !== undefined && env[name] !== "") continue
  const read = spawnSync("gh", ["variable", "get", name, "--env", "staging"], { encoding: "utf8" })
  if (read.status === 0) env[name] = read.stdout.trim()
}
env["ENVIRONMENT"] = "staging"
env["VITE_SENTRY_DSN"] = env["SENTRY_DSN"] ?? ""

const missing = SECRETS.filter((name) => env[name] === undefined || env[name] === "")
if (missing.length > 0) {
  console.error(`deploy-staging: missing ${missing.join(", ")}. Add them to the env file (see .env.staging.example).`)
  process.exit(1)
}

const step = (title: string, command: string, args: ReadonlyArray<string>, cwd = ".") => {
  console.log(`\n── ${title}`)
  const run = spawnSync(command, args, { cwd, env, stdio: "inherit" })
  if (run.status !== 0) {
    console.error(`deploy-staging: "${title}" failed; nothing after it ran.`)
    process.exit(run.status ?? 1)
  }
}

step("build the console", "bun", ["run", "--filter", "@insyte/console", "build"])
step("check the providers", "bunx", ["alchemy", "provider", "check-env", "--config", "app.ts"], "infra")
step("migrate the database", "bun", ["run", "db:migrate", "--env", "staging"])
step("deploy the stack", "bunx", ["alchemy", "deploy", "app.ts", "--stage", "staging", "--yes", "--no-input"], "infra")
step("smoke it from outside", "bun", ["scripts/smoke-stage.ts", `https://insyte-console-staging.${WORKERS_SUBDOMAIN}`])
console.log("\ndeploy-staging: staging is deployed and answers.")
