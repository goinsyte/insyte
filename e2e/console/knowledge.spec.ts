import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, previewRequest } from "./access.ts"

/*
 * Kennisbank (M15 step 7, W11.2): a new admin starts the knowledge base from a suggested chapter, writes into the
 * draft, publishes it, and archives it again. Nothing here asks a model: the embeddings are the fake's locally and on
 * a preview, and the reply draft that cites a chapter is the worker test's (`knowledge.worker.test.ts`). One person
 * per run, as in `auth.spec.ts`.
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

test("@knowledge a chapter is started from a suggestion, published, and archived", async ({ page, request }) => {
  test.setTimeout(120_000)
  const tag = Date.now().toString(36)
  const email = `e2e-${tag}-kennis@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Kees Kennis")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Kennis ${tag}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // An empty knowledge base offers its suggested chapters; one is a draft in a click.
  await page.goto("/settings/ai/knowledge")
  await hydrated(page)
  await expect(page.getByText("Nog geen kennisbank")).toBeVisible()
  await page.getByText("Retourneren", { exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/ai\/knowledge\/[^/?]+$/)
  await expect(page.getByText("Concept “Retourneren” gemaakt")).toBeVisible()
  await expect(page.getByLabel("Titel")).toHaveValue("Retourneren")

  // Written into and published: the agents read this version from now on.
  const text = page.getByLabel("Tekst")
  await text.fill(
    `${await text.inputValue()}\n## Sale\n\nSale-artikelen ruil je binnen 14 dagen voor een andere maat.\n`
  )
  await page.getByRole("button", { name: "Publiceren", exact: true }).click()
  await expect(page.getByText("“Retourneren” gepubliceerd")).toBeVisible()
  await expect(page.getByText("Gepubliceerd", { exact: true }).first()).toBeVisible()

  // Back in the list it is published, with what it says.
  await page.getByRole("link", { name: "Kennisbank" }).first().click()
  await expect(page).toHaveURL(/\/settings\/ai\/knowledge$/)
  await expect(page.getByRole("link", { name: /Retourneren/ })).toBeVisible()

  // Archived, it leaves every answer and the list.
  await page.getByRole("link", { name: /Retourneren/ }).click()
  await page.getByRole("button", { name: "Archiveren" }).click()
  await expect(page.getByText("“Retourneren” gearchiveerd")).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/ai\/knowledge$/)
  await expect(page.getByText("Nog geen kennisbank")).toBeVisible()
})
