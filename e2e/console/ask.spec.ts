import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * Vraag Insyte (M15 step 3, W11.1): a new admin with the recorded store asks what waits on them. The answer streams in
 * with its numbers as figures that open where they were counted, a follow-up asks on in the same conversation, and the
 * conversation is set aside with Undo. On the fake model, locally and on a preview (where Vraag Insyte takes the fake
 * when the stage has no model, `AiSettings.ts`). One person per run, as in `auth.spec.ts`.
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
  }, { message: `a ${kind} mail to ${to}` }).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

test("@ask Vraag Insyte answers with figures, asks on, and sets the conversation aside with Undo", async ({ page, request }) => {
  test.setTimeout(180_000)
  const tag = Date.now().toString(36)
  const email = `e2e-${tag}-ask@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Vera Vraag")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Vraag ${tag}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  await page.goto("/ask")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: /Waar zullen we naar kijken\?/ })).toBeVisible()

  // A question from the first view: the answer streams in, its numbers figures that open their list.
  await page.getByRole("button", { name: "Welke bestellingen dreigen te laat te komen?" }).click()
  const conversation = page.getByRole("region", { name: "Gesprek" })
  const figure = conversation.getByRole("link", { name: /^Vertraagde bestellingen: / })
  await expect(figure).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/ask\?c=ask_/)
  const address = page.url()
  await expect(conversation.getByText("Las", { exact: true }).first()).toBeVisible()

  // A follow-up on the same conversation.
  await conversation.getByRole("button", { name: "Vat de open zaken van vandaag samen" }).click()
  await expect(conversation.getByRole("link", { name: /^Wacht op jou: / })).toBeVisible({ timeout: 30_000 })
  expect(page.url()).toBe(address)

  // The figure opens where it was counted.
  await figure.click()
  await expect(page).toHaveURL(/\/orders/)

  // A figure Analyse explains opens its explanation over Analyse.
  await page.goto(address)
  await hydrated(page)
  await page.getByRole("textbox").last().fill("Hoe gaat het deze maand met de omzet?")
  await page.keyboard.press("Enter")
  const paid = conversation.getByRole("link", { name: /^Betaalde bestellingen deze maand: / })
  await expect(paid).toBeVisible({ timeout: 30_000 })
  await paid.click()
  await expect(page).toHaveURL(/\/analytics\?explain=/)
  await expect(page.getByRole("dialog", { name: "Betaalde bestellingen" })).toBeVisible()

  // Back on the conversation, read as kept; then set aside, and put back with Undo.
  await page.goto(address)
  await hydrated(page)
  await expect(conversation.getByRole("link", { name: /^Vertraagde bestellingen: / })).toBeVisible()
  const title = "Welke bestellingen dreigen te laat te komen?"
  const listed = page.locator("aside").getByRole("button", { name: title, exact: true })
  await expect(listed).toBeVisible()
  await listed.hover()
  await page.getByRole("button", { name: `“${title}” verwijderen` }).click()
  await expect(page.getByText("Gesprek verwijderd")).toBeVisible()
  await expect(listed).toHaveCount(0)
  await page.getByRole("button", { name: "Ongedaan maken" }).click()
  await expect(listed).toBeVisible()

  // The top bar's panel asks over the same conversations, beside the page, and opens its own on the full page.
  await page.goto("/dashboard")
  await hydrated(page)
  await page.getByRole("button", { name: "Vraag Insyte", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "Vraag Insyte" })
  await expect(panel).toBeVisible()
  await panel.getByRole("button", { name: "Welke chargebacks hebben bewijs nodig?" }).click()
  await expect(panel.getByRole("link", { name: /^Zaken die op jou wachten: / })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/dashboard$/)
  await panel.getByRole("button", { name: "Volledige pagina openen" }).click()
  await expect(page).toHaveURL(/\/ask\?c=ask_/)
  await expect(conversation.getByRole("link", { name: /^Zaken die op jou wachten: / })).toBeVisible()
})
