/*
 * `bun run dev:vars`: the local Worker's secrets (`apps/api/.dev.vars`, gitignored) from the founder's
 * `~/vantion/insyte/.env.local`, outside the repo. Only the names below are copied, and no value is ever printed: the
 * script says which names it wrote and which it did not find. Run it again after changing `.env.local`.
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
  "SENDCLOUD_SECRET_KEY"
]

const source = process.env["INSYTE_ENV_FILE"] ?? join(homedir(), "vantion/insyte/.env.local")
const target = new URL("../apps/api/.dev.vars", import.meta.url).pathname

if (!existsSync(source)) {
  console.error(`No ${source}: nothing to copy.`)
  process.exit(1)
}

const values = new Map<string, string>()
for (const line of readFileSync(source, "utf8").split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
  if (match !== null && NAMES.includes(match[1]!)) values.set(match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2"))
}

writeFileSync(target, [...values].map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", {
  mode: 0o600
})
console.log(`Wrote ${[...values.keys()].join(", ") || "nothing"} to apps/api/.dev.vars`)
const missing = NAMES.filter((n) => !values.has(n))
if (missing.length > 0) console.log(`Not in ${source}: ${missing.join(", ")}`)
