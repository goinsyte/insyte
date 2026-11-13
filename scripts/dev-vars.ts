/*
 * `bun run dev:vars`: the local Worker's secrets (`apps/api/.dev.vars`, gitignored) from the founder's
 * `~/vantion/insyte/.env.local`, outside the repo. Only the names below are copied, and no value is ever printed: the
 * script says which names it wrote and which it did not find. Run it again after changing `.env.local`.
 *
 * Insyte AI's key and gateway are copied only with `--ai`, which also writes `AI_ADAPTER=anthropic`: a local run calls
 * the model (and spends money) only when asked to. Without it the local Worker has the fake.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** What `wrangler dev` reads for the integrations a developer may try locally. */
const NAMES = [
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "KLAVIYO_CLIENT_ID",
  "KLAVIYO_CLIENT_SECRET",
  "SEAL_KEYS",
  "AFTERSHIP_API_KEY",
  "AFTERSHIP_WEBHOOK_SECRET",
  "SENDCLOUD_PUBLIC_KEY",
  "SENDCLOUD_SECRET_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET"
]

/** Insyte AI's, with `--ai` only. */
const AI_NAMES = ["ANTHROPIC_API_KEY", "AI_GATEWAY_ID", "AI_GATEWAY_TOKEN", "AI_ACCOUNT_ID"]
const withAi = process.argv.includes("--ai")
const names = withAi ? [...NAMES, ...AI_NAMES] : NAMES

const source = process.env["INSYTE_ENV_FILE"] ?? join(homedir(), "vantion/insyte/.env.local")
const target = new URL("../apps/api/.dev.vars", import.meta.url).pathname

if (!existsSync(source)) {
  console.error(`No ${source}: nothing to copy.`)
  process.exit(1)
}

const values = new Map<string, string>()
for (const line of readFileSync(source, "utf8").split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
  if (match !== null && names.includes(match[1]!)) values.set(match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2"))
}

if (withAi) values.set("AI_ADAPTER", "anthropic")

writeFileSync(target, [...values].map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", {
  mode: 0o600
})
console.log(`Wrote ${[...values.keys()].join(", ") || "nothing"} to apps/api/.dev.vars`)
const missing = names.filter((n) => !values.has(n))
if (missing.length > 0) console.log(`Not in ${source}: ${missing.join(", ")}`)
