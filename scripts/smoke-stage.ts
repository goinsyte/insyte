/*
 * A deployed stage, checked from outside after its deploy (backend.yml): the console renders the database's answer, and
 * better-auth answers through the console's origin. Through Access with the CI service token.
 *
 *   bun scripts/smoke-stage.ts https://insyte-console-staging.ishak-73d.workers.dev
 *
 * Retries for two minutes: a new deploy can take a few seconds to reach every location.
 */
import { setTimeout as sleep } from "node:timers/promises"

const origin = process.argv[2]
if (origin === undefined) {
  console.error("smoke-stage: pass the console's origin")
  process.exit(1)
}
const headers = {
  "cf-access-client-id": process.env["CF_ACCESS_CLIENT_ID"] ?? "",
  "cf-access-client-secret": process.env["CF_ACCESS_CLIENT_SECRET"] ?? ""
}

const checks: ReadonlyArray<{ readonly name: string; readonly run: () => Promise<string | undefined> }> = [
  {
    name: "/status renders database ok",
    run: async () => {
      const html = await (await fetch(`${origin}/status`, { headers })).text()
      return /data-testid="database"><span[^>]*>ok</.test(html) ? undefined : html.slice(0, 500)
    }
  },
  {
    name: "better-auth answers /api/auth/get-session",
    run: async () => {
      const response = await fetch(`${origin}/api/auth/get-session`, { headers })
      const body = await response.text()
      // No session cookie: better-auth answers 200 with `null`.
      return response.status === 200 && body.trim() === "null" ? undefined : `${response.status} ${body.slice(0, 300)}`
    }
  }
]

for (const check of checks) {
  let failure: string | undefined = "not run"
  for (let attempt = 0; attempt < 20 && failure !== undefined; attempt++) {
    if (attempt > 0) await sleep(6000)
    failure = await check.run().catch((error: unknown) => String(error))
  }
  if (failure !== undefined) {
    console.error(`smoke-stage: ${origin}: ${check.name} failed: ${failure}`)
    process.exit(1)
  }
  console.log(`smoke-stage: ${origin}: ${check.name}`)
}
