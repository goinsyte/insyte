/*
 * Staging deployed from a laptop, the same steps as backend.yml's staging job, for when GitHub Actions cannot run:
 * build the console, check the providers, migrate the database, deploy the stack, smoke it from outside.
 *
 *   bun --env-file ~/vantion/insyte/.env.staging run deploy:staging
 *
 * The deploy's credentials come from that file (outside the repo; `.env.staging.example` names them): GitHub never
 * gives a secret back. What staging is configured with is committed (infra/stages.ts), and the API Worker's own
 * secrets stay on the Worker; any of them the file has are sent too (scripts/worker-secrets.ts). Only names are ever
 * printed, never a value. Staging only: production stays with CI and an explicit ask.
 */
import { spawnSync } from "node:child_process"
import { OBSERVABILITY } from "../infra/stages.ts"

const WORKERS_SUBDOMAIN = "ishak-73d.workers.dev"
const CLOUDFLARE_ACCOUNT_ID = "73dfc33e7ece69bbe79129899d8d585d"

/** What backend.yml's staging job sets from the environment's secrets. */
const SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "NEON_API_KEY",
  "INSYTE_APP_DB_PASSWORD",
  "DATABASE_URL_OWNER",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET"
] as const

const env: Record<string, string> = { ...process.env } as Record<string, string>
env["CLOUDFLARE_ACCOUNT_ID"] ??= CLOUDFLARE_ACCOUNT_ID
env["ENVIRONMENT"] = "staging"
env["VITE_SENTRY_DSN"] = OBSERVABILITY.dsn

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
step("the Worker's secrets the file has", "bun", ["scripts/worker-secrets.ts", "staging"])
step("smoke it from outside", "bun", ["scripts/smoke-stage.ts", `https://insyte-console-staging.${WORKERS_SUBDOMAIN}`])
console.log("\ndeploy-staging: staging is deployed and answers.")
