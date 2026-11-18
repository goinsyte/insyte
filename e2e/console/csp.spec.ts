import { expect, type Page } from "@playwright/test"
import { founded, hydrated, test } from "./founder.ts"

/*
 * The console's Content-Security-Policy (M18, 08 §6) breaks no page: a founder signs up through the forms Turnstile
 * guards, and every screen of the rail renders and hydrates with no policy violation reported by the browser. Each
 * page carries its own nonce on Start's inline scripts, and the policy names no `'unsafe-inline'` for scripts.
 */

const PAGES = [
  "/dashboard",
  "/orders",
  "/products",
  "/customers",
  "/inbox",
  "/tickets",
  "/chats",
  "/automations",
  "/analytics",
  "/sheets",
  "/costs",
  "/returns",
  "/marketplace",
  "/settings/profile",
  "/settings/team",
  "/settings/stores",
  "/settings/api-keys"
]

/** Every violation the page reports, as the browser's `securitypolicyviolation` event and its console line. */
const violations = async (page: Page) => {
  const seen: Array<string> = []
  page.on("console", (message) => {
    if (/Content[- ]Security[- ]Policy/i.test(message.text())) seen.push(`${message.text()} @ ${page.url()}`)
  })
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`Content-Security-Policy: ${e.violatedDirective} blocked ${e.blockedURI || "inline"}`)
    })
  })
  return seen
}

test("every screen renders under the console's CSP, with a nonce on each page", async ({ page, request }) => {
  const seen = await violations(page)
  await founded(page, request, { name: "Noor Policy", tag: "csp" })

  for (const path of PAGES) {
    const response = await page.goto(path)
    await hydrated(page)
    const policy = response?.headers()["content-security-policy"] ?? ""
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]
    expect(nonce, `a nonce on ${path}`).toBeTruthy()
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  }
  expect(seen, "Content-Security-Policy violations").toEqual([])
})
