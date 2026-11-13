import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * Analyse's journey (step 16.2): a new admin's workspace has no orders, so the page says there is nothing to read yet;
 * with the recorded store imported (previews have no Shopify) it reads the six figures from the facts, says that
 * disputes are not kept yet, takes the paid orders apart in the drawer, and says that asking cannot be done yet. One
 * person per run, as in `auth.spec.ts`.
 */

const test = base.extend<{ page: Page }>({
  // On a preview, Access lets the context through on the preview's origin; no other origin gets the token.
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
  }, { message: `a ${kind} mail to ${to}` }).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

test("@analytics a new admin's Analyse is empty, then reads the store's figures and takes them apart", async ({ page, request }) => {
  test.setTimeout(120_000)
  const email = `e2e-${Date.now().toString(36)}-analytics@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Anna Analyse")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Analyse ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // No orders yet: nothing to compare, and a page of zeros would read as news.
  await page.goto("/analytics")
  await hydrated(page)
  await expect(page.getByText("Nog niets om te lezen.")).toBeVisible()

  // The recorded store, imported: its five orders are what the footnote counts.
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)
  await page.reload()
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Analyse", level: 1 })).toBeVisible()
  await expect(page.getByText(/^Berekend uit 5 bestellingen/)).toBeVisible()
  for (const label of ["Omzet", "Betaalde bestellingen", "Op tijd", "Terugbetaald", "Uren tot opgelost"]) {
    await expect(page.locator("dt", { hasText: label }).first()).toBeVisible()
  }
  // Disputes wait for the chargebacks: said, not shown as zero.
  const disputes = page.locator("dl > div", { has: page.locator("dt", { hasText: "Geschillen" }) })
  await expect(disputes.getByText("Nog niet beschikbaar")).toBeVisible()
  await expect(disputes.getByText("—")).toBeVisible()

  // The paid orders, taken apart: Insyte's sentence about them, read from the server.
  await page.getByRole("button", { name: /Betaalde bestellingen/ }).click()
  const drawer = page.getByRole("dialog", { name: "Betaalde bestellingen" })
  await expect(drawer.getByRole("heading", { name: "Betaalde bestellingen" })).toBeVisible()
  await expect(drawer.getByText(/betaald en gehouden/)).toBeVisible()
  await drawer.getByRole("button", { name: "Sluiten" }).click()
  await expect(drawer).toHaveCount(0)

  // Asking has no model yet: it says so.
  await page.getByRole("textbox", { name: "Vraag iets over deze cijfers" }).first().fill("Waarom?")
  await page.getByRole("textbox", { name: "Vraag iets over deze cijfers" }).first().press("Enter")
  await expect(page.getByText("Vragen over je cijfers is nog niet beschikbaar")).toBeVisible()
})
