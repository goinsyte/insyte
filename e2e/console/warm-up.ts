import { type Browser, chromium, type FullConfig } from "@playwright/test"
import { newContext } from "./access.ts"

/*
 * Before the journeys run against a preview (`CONSOLE_URL`), the preview is warmed: right after a deploy its first
 * minute or so serves the console's document but the page does not hydrate within a journey's 15 s, so the first spec
 * files (and their retries, a few seconds later) failed at `html[data-hydrated]` on /onboarding while every later file
 * passed. Here /onboarding is loaded in a fresh browser context, as a journey loads it, until it hydrates and the API
 * answers through the console, within a bounded budget. Each try's slow or failed requests are printed (paths only:
 * the Access token is in the headers, never in a URL), so a preview that never warms says why.
 *
 * Locally the console runs beside the tests (`webServer`) and nothing is warmed.
 */

/** How long a preview may take to warm before the run gives up on it. */
const BUDGET_MS = 180_000
/** One try: the document, then hydration, each within this. */
const TRY_MS = 30_000
/** A request slower than this is worth printing. */
const SLOW_MS = 3_000

const say = (line: string) => process.stdout.write(`${line}\n`)
const since = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)} s`

export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  if (process.env["CONSOLE_URL"] === undefined || baseURL === undefined) return
  const browser = await chromium.launch()
  try {
    await untilHydrated(browser, baseURL)
  } finally {
    await browser.close()
  }
}

async function untilHydrated(browser: Browser, baseURL: string): Promise<void> {
  const origin = new URL(baseURL).origin
  const where = (url: string) => {
    const u = new URL(url)
    return u.origin === origin ? u.pathname : `${u.origin}${u.pathname}`
  }
  const started = Date.now()
  for (let attempt = 1;; attempt++) {
    const context = await newContext(browser, baseURL)
    const page = await context.newPage()
    const notes: Array<string> = []
    const sent = new Map<string, number>()
    page.on("request", (r) => sent.set(r.url(), Date.now()))
    page.on("requestfailed", (r) => notes.push(`failed ${where(r.url())}: ${r.failure()?.errorText ?? "?"}`))
    page.on("requestfinished", (r) => {
      const at = sent.get(r.url())
      if (at !== undefined && Date.now() - at > SLOW_MS) notes.push(`slow ${where(r.url())}: ${since(at)}`)
    })
    page.on("response", (r) => {
      if (r.status() >= 400) notes.push(`${r.status()} ${where(r.url())}`)
    })
    page.on("console", (m) => {
      if (m.type() === "error") notes.push(`console: ${m.text().slice(0, 200)}`)
    })
    page.on("pageerror", (e) => notes.push(`page error: ${String(e).slice(0, 200)}`))
    const tried = Date.now()
    try {
      await page.goto("/onboarding", { timeout: TRY_MS })
      await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: TRY_MS })
      // The API behind the console (its service binding), from the page, as the screens call it.
      const status = await page.evaluate(async () => (await fetch("/api/auth/get-session")).status)
      if (status !== 200) throw new Error(`/api/auth/get-session answered ${status}`)
      say(`warm-up: /onboarding hydrated on try ${attempt} in ${since(tried)} (${since(started)} in all)`)
      for (const note of notes) say(`  ${note}`)
      return
    } catch (error) {
      say(`warm-up: try ${attempt} failed after ${since(tried)}: ${String(error).split("\n")[0]}`)
      for (const note of notes) say(`  ${note}`)
      if (Date.now() - started > BUDGET_MS) {
        throw new Error(`the preview did not hydrate /onboarding within ${BUDGET_MS / 1000} s of warming up`, {
          cause: error
        })
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    } finally {
      await context.close()
    }
  }
}
