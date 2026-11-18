import { type APIRequestContext, type BrowserContext, expect, type Page, test as base } from "@playwright/test"
import { admit, newContext, previewRequest } from "./access.ts"

/*
 * The affiliate programme's journey (M16 steps 3–5; PLAN 22): a new admin's programme page starts empty; the admin
 * invites someone, which puts the programme's public page in "Link kopiëren". A second person makes an account, opens
 * that page and applies, and waits in the portal's "wordt beoordeeld". The admin approves the application with the
 * proposed code; the affiliate's portal opens on its dashboard, its code read-only, and its payout account saved and
 * shown back only masked.
 */

const test = base.extend<{ page: Page }>({
  context: async ({ context, baseURL }, use) => {
    await admit(context, baseURL)
    await use(context)
  },
  request: async ({ playwright, baseURL }, use) => {
    const request = await previewRequest(playwright, baseURL)
    await use(request)
    await request.dispose()
  },
  page: async ({ page }, use) => {
    const errors: Array<string> = []
    page.on("pageerror", (e) => errors.push(`${String(e)} @ ${page.url()}`))
    await use(page)
    expect(errors, "uncaught errors on the page").toEqual([])
  }
})

async function mailLink(request: APIRequestContext, to: string, kind: string): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    const res = await request.get(`/api/__dev/mail?to=${encodeURIComponent(to)}`)
    const { mails } = await res.json() as { mails: Array<{ kind: string; url: string | null }> }
    link = mails.find((m) => m.kind === kind)?.url ?? undefined
    return link
  }, { message: `a ${kind} mail to ${to}`, timeout: 45_000 }).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

/** An account through the onboarding's first step and its confirmation mail. */
async function signUp(page: Page, request: APIRequestContext, email: string, name: string) {
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill(name)
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
}

test("@affiliate a person applies to a brand's programme, is approved and opens the portal", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(240_000)
  const run = Date.now().toString(36)
  const email = `e2e-${run}-brand@example.com`
  const applicant = `e2e-${run}-femke@example.com`

  // A new admin.
  await signUp(page, request, email, "Bram Merk")
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Merk ${run}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // The programme, empty; an invitation, which the list of invites shows with the programme's link.
  await page.goto("/affiliates")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Affiliates", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Affiliate uitnodigen" }).first().click()
  const invite = page.getByRole("dialog", { name: "Affiliate uitnodigen" })
  await invite.getByPlaceholder("Femke Jansen").fill("Sanne")
  await invite.getByPlaceholder("naam@kanaal.nl").fill(`e2e-${run}-sanne@example.com`)
  await invite.getByRole("button", { name: "Uitnodiging versturen" }).click()
  await expect(page.getByText("Sanne uitgenodigd voor het partnerprogramma")).toBeVisible()
  await page.goto("/affiliates?view=uitnodigingen")
  await hydrated(page)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Link kopiëren" }).first().click()
  await expect(page.getByText("Link gekopieerd")).toBeVisible()
  const copied = String(await page.evaluate("navigator.clipboard.readText()"))
  const apply = new URL(copied).pathname
  expect(apply).toMatch(/^\/partners\/[a-z0-9]{10,32}$/)

  // The applicant: an account, the programme's page, the application, and the portal's gate.
  const other: BrowserContext = await newContext(browser, baseURL)
  const portal = await other.newPage()
  const portalErrors: Array<string> = []
  portal.on("pageerror", (e) => portalErrors.push(`${String(e)} @ ${portal.url()}`))
  await signUp(portal, request, applicant, "Femke Maker")
  await portal.goto(apply)
  await hydrated(portal)
  await expect(portal.getByRole("heading", { name: `Partnerprogramma van Merk ${run}` })).toBeVisible()
  await portal.getByPlaceholder("Nieuwsbrief (~12k lezers), YouTube-kanaal over…").fill(
    "Instagram, 8k volgers in outdoor"
  )
  await portal.getByPlaceholder("https://").fill("https://instagram.com/femkemaakt")
  await portal.getByRole("button", { name: "Aanmelding versturen" }).click()
  await expect(portal).toHaveURL(/\/affiliate\/dashboard$/)
  await expect(portal.getByRole("heading", { name: "Aanmelding wordt beoordeeld" })).toBeVisible()

  // The admin approves it, with the code the server proposes.
  await page.goto("/affiliates?view=aanmeldingen")
  await hydrated(page)
  const row = page.getByRole("listitem").filter({ hasText: "Femke Maker" })
  await row.getByRole("button", { name: "Goedkeuren", exact: true }).click()
  const decide = page.getByRole("dialog", { name: "Femke Maker goedkeuren" })
  await expect(decide.getByText(/Code: [A-Z0-9]{3,20}\./)).toBeVisible()
  await decide.getByRole("button", { name: /^Goedkeuren op / }).click()
  await expect(page.getByText(/Femke Maker doet mee op /)).toBeVisible()
  await expect(page.getByRole("button", { name: "Ongedaan maken" })).toBeVisible()

  // The affiliate's portal: the dashboard, the code read-only, the account shown back masked.
  await portal.goto("/affiliate/dashboard")
  await hydrated(portal)
  await expect(portal.getByRole("heading", { name: "Aanmelding wordt beoordeeld" })).toHaveCount(0)
  await expect(portal.getByRole("link", { name: "Doorverwijzingen" }).first()).toBeVisible()
  await portal.goto("/affiliate/settings/profile")
  await hydrated(portal)
  await expect(portal.locator("#a-code")).toBeDisabled()
  await portal.goto("/affiliate/settings/payment")
  await hydrated(portal)
  await portal.locator("#account").fill("femke@example.com")
  await portal.getByRole("button", { name: "Opslaan" }).click()
  await expect(portal.getByText("Uitbetalingen gaan naar PayPal")).toBeVisible()
  await expect(portal.getByText(/Nu naar PayPal, f•+@example\.com/)).toBeVisible()
  await expect(portal.getByText("femke@example.com", { exact: true })).toHaveCount(0)

  // The brand's list has them, and the running month approves nothing.
  await page.goto("/affiliates")
  await hydrated(page)
  await expect(page.getByRole("row", { name: /Femke Maker/ })).toBeVisible()

  expect(portalErrors, "uncaught errors in the portal").toEqual([])
  await other.close()
})
