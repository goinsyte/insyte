/*
 * The API Worker under `wrangler dev`, the way it really starts: module evaluated at global scope, then requests.
 *
 *   bun run api:smoke      (with `bun run db:up && bun run db:migrate --local` first)
 *
 * The worker tests import the module inside a test, where a Worker allows I/O, so they cannot see a layer that does
 * something forbidden while it is built at global scope (reading a Hyperdrive binding did: every request answered 500).
 * This can.
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = 8797
const base = `http://localhost:${PORT}`

const dev = spawn("bunx", ["wrangler", "dev", "--port", String(PORT), "--show-interactive-dev-session=false"], {
  cwd: "apps/api",
  stdio: "ignore"
})

const fail = (message: string): never => {
  dev.kill()
  console.error(`api:smoke: ${message}`)
  process.exit(1)
}

const deadline = Date.now() + 60_000
let ready = false
while (!ready && Date.now() < deadline) {
  // The config route needs no database; its JSON shape says this is the API and not something else on the port.
  ready = await fetch(`${base}/api/config`).then(
    async (r) => r.ok && "turnstileSiteKey" in (await r.json() as object),
    () => false
  )
  if (!ready) await sleep(500)
}
if (!ready) fail("wrangler dev did not answer within 60 s")

const health = await fetch(`${base}/api/health`)
const body = await health.json() as { db?: string }
if (health.status !== 200 || body.db !== "ok") fail(`GET /api/health: ${health.status} ${JSON.stringify(body)}`)

const rpc = await fetch(`${base}/api/rpc/v1`, {
  method: "POST",
  headers: { "content-type": "application/ndjson" },
  body: `${JSON.stringify({ _tag: "Request", id: "1", tag: "System.health", payload: null, headers: [] })}\n`
})
const frame = await rpc.text()
if (!frame.includes(`"database":"ok"`)) fail(`System.health: ${rpc.status} ${frame}`)

// better-auth, built per request: a cold isolate's first auth call must answer, not hang (12 §9, S4).
const session = await fetch(`${base}/api/auth/get-session`)
const sessionBody = (await session.text()).trim()
if (session.status !== 200 || sessionBody !== "null") {
  fail(`GET /api/auth/get-session: ${session.status} ${sessionBody}`)
}

dev.kill()
console.log("api:smoke: health, System.health and better-auth answer through Hyperdrive under wrangler dev")
