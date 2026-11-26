import { expect, type Page } from "@playwright/test"
import { founded, hydrated, test } from "./founder.ts"

/*
 * The console's Content-Security-Policy (M18, 08 §6) breaks no page: a founder signs up through the forms Turnstile
 * guards, and every screen of the rail renders and hydrates with no policy violation reported by the browser. Each
 * page carries its own nonce on Start's inline scripts, and the policy names no `'unsafe-inline'` for scripts. The
 * not-found pages, in the frame and out of it, and the shell's own keys are checked on the way.
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

  // The area panel's rows are links: a new tab or a copied address goes where a click does.
  await expect(page.locator("aside a[href='/settings/team']").first()).toBeVisible()

  // An address no page answers, under an area: said in the frame (its top bar, with ⌘K on the search), with the way back.
  const search = page.locator("[aria-keyshortcuts='Meta+K Control+K']")
  await page.goto("/settings/region")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Deze pagina bestaat niet" })).toBeVisible()
  await expect(page.getByRole("main").getByRole("link", { name: /Instellingen/ })).toHaveAttribute("href", "/settings")
  await expect(search).toBeVisible()
  // ? lists every shortcut, and ⌘J opens Vraag Insyte, as the list says.
  await page.keyboard.press("?")
  const shortcuts = page.getByRole("dialog", { name: "Sneltoetsen" })
  await expect(shortcuts.getByText("Alle sneltoetsen")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(shortcuts).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+j")
  await expect(page.getByRole("dialog", { name: "Vraag Insyte" })).toBeVisible()
  // A record that is not there: said by its own page, in its own words, with the rail and the top bar still round it.
  await page.goto("/orders/ord_00000000000000000000000000")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Deze bestelling bestaat niet" })).toBeVisible()
  await expect(page.getByRole("navigation").getByRole("link", { name: "Insyte start" })).toBeVisible()
  await expect(search).toBeVisible()
  await expect(page.getByRole("main").getByRole("link", { name: /Bestellingen/ })).toHaveAttribute("href", "/orders")
  // Anywhere else: a page of its own, no frame around it.
  await page.goto("/nergens")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Deze pagina bestaat niet" })).toBeVisible()
  await expect(search).toHaveCount(0)
  expect(seen, "Content-Security-Policy violations").toEqual([])
})
