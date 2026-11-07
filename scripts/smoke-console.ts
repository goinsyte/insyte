/*
 * The built console Worker with the API beside it, in workerd (`vite preview` runs both, as `vite dev` does): the
 * walking skeleton end to end (15, step 0).
 *
 *   bun run console:smoke   (after `bun run --filter @insyte/console build`, with the database up and migrated)
 *
 * Asserts the server render: `/status` comes back with the database's answer already in the HTML, `/` redirects
 * before any HTML, a signed-out app route goes to sign-in with a safe way back, every page carries the security
 * headers, and `/api/*` reaches the API by service binding.
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = 4391
const base = `http://localhost:${PORT}`

const preview = spawn("bunx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: "apps/console",
  stdio: "ignore"
})

const fail = (message: string): never => {
  preview.kill()
  console.error(`console:smoke: ${message}`)
  process.exit(1)
}

const deadline = Date.now() + 60_000
let ready = false
while (!ready && Date.now() < deadline) {
  ready = await fetch(`${base}/api/config`).then(
    async (r) => r.ok && "turnstileSiteKey" in (await r.json() as object),
    () => false
  )
  if (!ready) await sleep(500)
}
if (!ready) fail("vite preview did not answer within 60 s")

const front = await fetch(base, { redirect: "manual" })
if (front.status !== 302 || !front.headers.get("location")?.endsWith("/status")) {
  fail(`GET /: expected a 302 to /status, got ${front.status} ${front.headers.get("location")}`)
}

const gated = await fetch(`${base}/orders?view=open`, { redirect: "manual" })
if (gated.status !== 302 || gated.headers.get("location") !== "/login?redirect=%2Forders%3Fview%3Dopen") {
  fail(
    `GET /orders signed out: expected a 302 to sign-in with the way back, got ${gated.status} ${
      gated.headers.get("location")
    }`
  )
}
const opened = await fetch(`${base}/onboarding`, { redirect: "manual" })
if (opened.status === 302 && opened.headers.get("location")?.startsWith("/login")) {
  fail("GET /onboarding is gated; it must stay open")
}

// The sign-in pages render on the server with their own copy, so a visitor sees the form before any script runs.
for (
  const [path, says] of [["/login", "Inloggen"], ["/onboarding", "Maak je account aan."], [
    "/reset-password?token=t",
    "Nieuw wachtwoord"
  ], ["/reset-password", "Deze link werkt niet meer"]] as const
) {
  const page = await fetch(`${base}${path}`)
  if (page.status !== 200) fail(`GET ${path}: ${page.status}`)
  if (!(await page.text()).includes(says)) fail(`GET ${path}: the HTML does not say "${says}"`)
}
const register = await fetch(`${base}/register`, { redirect: "manual" })
if (register.status !== 307 && register.status !== 302 || !register.headers.get("location")?.endsWith("/onboarding")) {
  fail(`GET /register: expected a redirect to /onboarding, got ${register.status} ${register.headers.get("location")}`)
}
const landing = await fetch(`${base}/dashboard`, { redirect: "manual" })
if (landing.status !== 302 || landing.headers.get("location") !== "/login?redirect=%2Fdashboard") {
  fail(`GET /dashboard signed out: expected sign-in with the way back, got ${landing.status}`)
}

const status = await fetch(`${base}/status`)
const html = await status.text()
if (status.status !== 200) fail(`GET /status: ${status.status}`)
if (!/data-testid="database"><span[^>]*>ok</.test(html)) fail("GET /status: the HTML does not say the database is ok")
if (!/\b\d{4}_[a-z_]+\b/.test(html)) fail("GET /status: the HTML does not name the last migration")
for (const header of ["content-security-policy", "strict-transport-security", "referrer-policy"]) {
  if (!status.headers.has(header)) fail(`GET /status: no ${header}`)
}
if (!status.headers.get("content-security-policy")?.includes("frame-ancestors 'none'")) {
  fail("GET /status: the CSP lets the page be framed")
}

const health = await fetch(`${base}/api/health`)
if (health.status !== 200) fail(`GET /api/health through the console: ${health.status}`)

preview.kill()
console.log(
  "console:smoke: /status server-renders the database's answer, through the API binding; the sign-in pages render"
)
