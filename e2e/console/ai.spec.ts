import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, pageRequest, previewRequest } from "./access.ts"

/*
 * The agent acting on its own (M15 step 6, W10.1): a new admin puts "Klant beantwoorden" on Zelf doen, connects a
 * mailbox by forwarding, and a customer of the seeded store mails asking where her order is. Insyte answers it by
 * itself, held for five minutes, and "Wat Insyte deed" lists it with Ongedaan maken, which takes the reply back before
 * it leaves. On the fake model locally; where Insyte AI is not switched on (a preview has no model), there is nothing
 * to answer with and the journey is skipped. One person per run, as in `auth.spec.ts`.
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

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

test("@ai Insyte answers a mail asking where an order is on Zelf doen, and the activity log takes it back", async ({ page, request }) => {
  test.setTimeout(180_000)
  const tag = Date.now().toString(36)
  const email = `e2e-${tag}-agent@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Aart Agent")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Agent ${tag}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  // The recorded store: Anna de Vries is its customer, and the agent answers a thread's own customer only.
  expect((await pageRequest(page).post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  // Zelfstandigheid: "Klant beantwoorden" on Zelf doen, saved. Without a model there is nothing to answer with.
  await page.goto("/settings/ai/autonomy")
  await hydrated(page)
  const answer = page.getByRole("radio", { name: "Klant beantwoorden: Zelf doen" })
  await expect(answer).toBeVisible()
  await page.waitForLoadState("networkidle")
  test.skip(
    await page.getByText("Insyte AI is nog niet ingeschakeld").isVisible(),
    "Insyte AI is not switched on here (a preview has no model)"
  )
  await answer.click()
  await page.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })
    .getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(page.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })).toHaveCount(0)
  await expect(answer).toHaveAttribute("aria-checked", "true")

  // A mailbox by forwarding: the address its mail is sent on to.
  await page.goto("/inbox?connect=mailbox")
  await hydrated(page)
  await page.getByRole("dialog").getByRole("textbox").first().fill(`support-${tag}@agent-e2e.nl`)
  await page.getByRole("button", { name: "Koppelen", exact: true }).click()
  const forwarding = (await page.getByRole("dialog").locator("span.flex-1.truncate").first().textContent())?.trim() ??
    ""
  expect(forwarding).toContain("@")
  await page.getByRole("button", { name: "Klaar", exact: true }).click()

  // The customer asks where her order is.
  const raw = mime({
    From: "Anna de Vries <klant1@example.com>",
    To: `support-${tag}@agent-e2e.nl`,
    Subject: "Waar is mijn pakket?",
    "Message-ID": `<e2e-${tag}@voorbeeld.nl>`
  }, "Hoi, ik heb vorige week besteld en nog niets ontvangen. Waar blijft mijn pakket?")
  const delivered = await pageRequest(page).post(
    "/api/__dev/mail/inbound",
    { ...onPreview({ "content-type": "application/json" }), data: { to: forwarding, raw } }
  )
  expect(delivered.ok()).toBe(true)

  // Wat Insyte deed: the reply it sent by itself, with five minutes to take it back.
  const row = page.getByRole("row", { name: /Klant geantwoord op de vraag waar de bestelling is/ })
  await expect.poll(async () => {
    await page.goto("/ask/activity")
    await hydrated(page)
    return row.count()
  }, { timeout: 60_000, message: "the agent's reply in the activity log" }).toBeGreaterThan(0)
  await row.getByRole("button", { name: /^Ongedaan maken/ }).click()
  await expect(row.getByText("Ongedaan gemaakt")).toBeVisible()

  // The thread has the mail and no reply: it never left.
  await page.goto("/inbox")
  await hydrated(page)
  await page.getByText("Waar is mijn pakket?").first().click()
  await expect(page.getByText(/^Hoi Anna,/)).toHaveCount(0)
})
