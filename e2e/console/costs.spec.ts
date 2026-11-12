import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"

/*
 * Kosten's journey (step 15.5): a new admin's workspace starts with no costs; a fixed line is added with an amount per
 * month, a month typed over, a share of revenue added, a line removed and brought back with Undo, and a reload keeps
 * it all, because it is the server's. "Meta Ads koppelen" says that it cannot be yet. One person per run, as in
 * `auth.spec.ts`.
 */

const test = base.extend<{ page: Page }>({
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

test("@costs a new admin adds costs, types a month, removes a line and takes it back", async ({ page, request }) => {
  test.setTimeout(120_000)
  const email = `e2e-${Date.now().toString(36)}-costs@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Karel Kosten")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Kosten ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // No costs yet: the empty page, with the first line as its action.
  await page.goto("/costs")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Nog geen kosten" })).toBeVisible()
  // Meta and Google Ads have no app keys yet: connecting says so instead of pretending.
  await page.getByText("Meta Ads koppelen").click()
  await expect(page.getByText("Meta Ads koppelen kan nog niet")).toBeVisible()
  await page.getByRole("button", { name: "Eerste kostenpost" }).click()
  const dialog = page.getByRole("dialog", { name: "Kostenpost toevoegen" })
  await dialog.getByPlaceholder("Bijvoorbeeld: Klantenservice-software").fill("Shopify-abonnement")
  await dialog.getByPlaceholder("0").fill("39")
  await dialog.getByRole("button", { name: "Toevoegen" }).click()
  await expect(page.getByText("Shopify-abonnement toegevoegd")).toBeVisible()
  await expect(page.getByText("1 posten ·", { exact: false })).toBeVisible()

  // Every month has the amount; one typed over says so and keeps it.
  const cells = page.getByRole("textbox", { name: /^Shopify-abonnement, / })
  await expect(cells).toHaveCount(5)
  await expect(cells.first()).toHaveValue(/39/)
  await cells.last().fill("49")
  await cells.last().press("Enter")
  await expect(page.getByText(/^Shopify-abonnement, \w+: /)).toBeVisible()
  await expect(cells.last()).toHaveValue(/49/)

  // A share of revenue is worked out, not typed.
  await page.getByRole("button", { name: "Kostenpost", exact: true }).click()
  await dialog.getByPlaceholder("Bijvoorbeeld: Klantenservice-software").fill("Betaalkosten")
  await dialog.getByRole("radio").filter({ hasText: "Deel van de omzet" }).click()
  await dialog.getByPlaceholder("2,9").fill("2,9")
  await dialog.getByRole("button", { name: "Toevoegen" }).click()
  await expect(page.getByText("2,9% van de omzet")).toBeVisible()
  await expect(page.getByRole("textbox", { name: /^Betaalkosten, / })).toHaveCount(0)

  // Removed, then back with Undo.
  await page.getByRole("row", { name: /Betaalkosten/ }).hover()
  await page.getByRole("button", { name: "Opties voor Betaalkosten" }).click()
  await page.getByRole("menuitem", { name: "Verwijderen" }).click()
  await expect(page.getByText("Betaalkosten verwijderd")).toBeVisible()
  await expect(page.getByText("2,9% van de omzet")).toHaveCount(0)
  await page.getByRole("button", { name: "Ongedaan maken" }).last().click()
  await expect(page.getByText("2,9% van de omzet")).toBeVisible()

  // The server's: a reload shows the same.
  await page.reload()
  await hydrated(page)
  await expect(page.getByText("2 posten ·", { exact: false })).toBeVisible()
  await expect(page.getByRole("textbox", { name: /^Shopify-abonnement, / }).last()).toHaveValue(/49/)
})
