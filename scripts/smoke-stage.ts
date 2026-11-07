/*
 * A deployed stage, checked from outside after its deploy (backend.yml): the console renders the database's answer, and
 * better-auth answers through the console's origin. Through Access with the CI service token.
 *
 *   bun scripts/smoke-stage.ts https://insyte-console-staging.ishak-73d.workers.dev
 *   bun scripts/smoke-stage.ts <origin> --auth-journey     previews only: also sign up, verify, sign in, sign out
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

/** The whole account journey through the deployed console: a new address per run, so previews only. */
const authJourney = async (): Promise<string | undefined> => {
  const email = `smoke-${Date.now().toString(36)}@example.com`
  const password = "smoke-test-password-1"
  const post = (path: string, body: unknown, cookie = "") =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        ...headers,
        origin,
        "content-type": "application/json",
        // Cloudflare's published dummy token, which the test secret previews carry accepts (M2.2; infra/app.ts).
        "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX",
        ...(cookie === "" ? {} : { cookie })
      },
      body: JSON.stringify(body)
    })
  const signUp = await post("/api/auth/sign-up/email", { name: "Smoke", email, password })
  if (signUp.status !== 200) return `sign-up: ${signUp.status} ${await signUp.text()}`
  const mails = await (await fetch(`${origin}/api/__dev/mail?to=${encodeURIComponent(email)}`, { headers })).json() as {
    mails: Array<{ kind: string; url: string }>
  }
  const verify = mails.mails.find((m) => m.kind === "auth.verify")
  if (verify === undefined) return "no verification mail captured"
  const verified = await fetch(verify.url, { headers, redirect: "manual" })
  if (verified.status !== 302) return `verify: ${verified.status}`
  const signIn = await post("/api/auth/sign-in/email", { email, password })
  const setCookie = signIn.headers.getSetCookie().find((c) => c.includes("insyte.session="))
  if (signIn.status !== 200 || setCookie === undefined) return `sign-in: ${signIn.status}`
  if (!setCookie.startsWith("__Secure-insyte.session=") || /Domain=/i.test(setCookie)) {
    return `session cookie: expected __Secure-, host-only; got ${setCookie.split(";").slice(1).join(";")}`
  }
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
  const session = await (await fetch(`${origin}/api/auth/get-session`, { headers: { ...headers, cookie } })).json() as {
    user?: { email: string }
  } | null
  if (session?.user?.email !== email) return `get-session: ${JSON.stringify(session)}`
  const signOut = await post("/api/auth/sign-out", {}, cookie)
  return signOut.status === 200 ? undefined : `sign-out: ${signOut.status}`
}

const all = process.argv.includes("--auth-journey")
  ? [...checks, { name: "sign-up, verify, sign-in (__Secure-, host-only), session, sign-out", run: authJourney }]
  : checks

for (const check of all) {
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
