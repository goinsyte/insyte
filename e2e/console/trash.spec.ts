import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, previewRequest } from "./access.ts"

/*
 * The Prullenbak's journey (W11.4): a new admin removes a cost line on Kosten and a sheet on Rekenbladen; both are in
 * Instellingen → Prullenbak with who removed them; the sheet is put back from there and is on Rekenbladen again,
 * while the cost line stays in the trash, also after a reload, because it is the server's. One person per run, as in
 * `auth.spec.ts`.
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

test("@trash a new admin removes a cost line and a sheet, and puts the sheet back from the Prullenbak", async ({ page, request }) => {
  test.setTimeout(150_000)
  const email = `e2e-${Date.now().toString(36)}-trash@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Petra Prullenbak")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Prullenbak ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // A cost line, added and removed on Kosten.
  await page.goto("/costs")
  await hydrated(page)
  await page.getByRole("button", { name: "Eerste kostenpost" }).click()
  const dialog = page.getByRole("dialog", { name: "Kostenpost toevoegen" })
  await dialog.getByPlaceholder("Bijvoorbeeld: Klantenservice-software").fill("Verpakking")
  await dialog.getByPlaceholder("0").fill("25")
  await dialog.getByRole("button", { name: "Toevoegen" }).click()
  await expect(page.getByText("Verpakking toegevoegd")).toBeVisible()
  await page.getByRole("row", { name: /Verpakking/ }).hover()
  await page.getByRole("button", { name: "Opties voor Verpakking" }).click()
  await page.getByRole("menuitem", { name: "Verwijderen" }).click()
  await expect(page.getByText("Verpakking verwijderd")).toBeVisible()

  // A sheet, made and removed on Rekenbladen.
  await page.goto("/sheets")
  await hydrated(page)
  await page.getByRole("button", { name: "Winst per maand maken" }).click()
  const made = page.getByRole("dialog", { name: "Nieuw rekenblad" })
  await made.getByPlaceholder("Winst per maand").fill("Weekcijfers")
  await made.getByRole("button", { name: "Rekenblad maken" }).click()
  await expect(page).toHaveURL(/\/sheets\/.+/)
  await page.goto("/sheets")
  await hydrated(page)
  await page.getByRole("button", { name: "Opties voor Weekcijfers" }).click()
  await page.getByRole("menuitem", { name: "Verwijderen" }).click()
  await expect(page.getByText("“Weekcijfers” verwijderd")).toBeVisible()
  await expect(page.getByRole("button", { name: "Weekcijfers openen" })).toHaveCount(0)

  // Both in the Prullenbak, with who removed them.
  await page.goto("/settings/trash")
  await hydrated(page)
  const sheetRow = page.getByRole("listitem").filter({ hasText: "Weekcijfers" })
  const costRow = page.getByRole("listitem").filter({ hasText: "Verpakking" })
  await expect(sheetRow).toContainText("Rekenblad · verwijderd door Petra Prullenbak")
  await expect(costRow).toContainText("Kostenpost · verwijderd door Petra Prullenbak")

  // The sheet back from there: gone from the trash, on Rekenbladen again; the cost line stays.
  await sheetRow.getByRole("button", { name: "Terugzetten" }).click()
  await expect(page.getByText("“Weekcijfers” teruggezet")).toBeVisible()
  await expect(sheetRow).toHaveCount(0)
  await page.reload()
  await hydrated(page)
  await expect(page.getByRole("listitem").filter({ hasText: "Weekcijfers" })).toHaveCount(0)
  await expect(page.getByRole("listitem").filter({ hasText: "Verpakking" })).toBeVisible()
  await page.goto("/sheets")
  await hydrated(page)
  await expect(page.getByRole("button", { name: "Weekcijfers openen" })).toBeVisible()
})
