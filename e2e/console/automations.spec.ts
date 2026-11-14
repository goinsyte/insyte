import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * Automations' journey (M12 step 6, W2.1): a new admin with the recorded store builds "Levertijd-update op dag 5" from
 * the template, sets the day to the one its oldest open order reaches, tests it on an order (nothing kept or sent),
 * and publishes it. The clock is moved on to that day at 9:00 (`/api/__dev/automations/schedule`, the hourly tick
 * the cron makes): the flow runs, "Leverdatum herberekenen" says when the order should come, and "E-mail versturen"
 * says it cannot run yet. Start's "Automatiseringen" card counts it. One person per run, as in `auth.spec.ts`.
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

/** The recorded store's first order was placed on 1 October at 10:00 UTC. */
const PLACED = Date.parse("2026-10-01T10:00:00Z")

const amsterdamHour = (t: number) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hourCycle: "h23" }).format(t)
  )

test("@automations a new admin builds the day-5 update from the template, tests, publishes and the clock runs it", async ({ page, request }) => {
  test.setTimeout(180_000)
  const email = `e2e-${Date.now().toString(36)}-automations@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Flo Flow")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Flows ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  // The template, used: a draft with its three steps.
  await page.goto("/automations?view=templates")
  await hydrated(page)
  const template = page.locator("li", { has: page.getByText("Levertijd-update op dag 5", { exact: true }) })
  await template.getByRole("button", { name: "Sjabloon gebruiken" }).click()
  await expect(page).toHaveURL(/\/automations\/auto_/)
  await hydrated(page)

  // The day the oldest open order reaches tomorrow morning: the flow has work once it is on.
  const days = Math.ceil((Date.now() - PLACED) / 86_400_000) + 1
  // The trigger's card is not draggable (`aria-disabled`), but it opens its settings.
  await page.getByRole("button", { name: /^Op een vast moment, / }).click({ force: true })
  const daysField = page.locator("div", { has: page.locator(":scope > span", { hasText: /^Dagen/ }) }).locator("input")
  await daysField.fill(String(days))
  await page.getByRole("button", { name: "Instellingen sluiten" }).click()

  // Tested on an order: nothing kept or sent.
  await page.getByRole("button", { name: "Test met voorbeeld" }).click()
  await expect(page.getByText("Test geslaagd, niets opgeslagen of verstuurd")).toBeVisible()

  // Published: the flow is on.
  await page.getByRole("button", { name: "Publiceren", exact: true }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: "Publiceren", exact: true }).click()
  await expect(page.getByText("Concept", { exact: true })).toHaveCount(0)

  // The clock moved on to that day, 9:00 in the workspace's timezone: the hourly tick starts the run.
  let at = PLACED + days * 86_400_000
  while (amsterdamHour(at) !== 9) at += 3_600_000
  const tick = await page.request.post(
    `/api/__dev/automations/schedule?at=${encodeURIComponent(new Date(at).toISOString())}`,
    onPreview()
  )
  expect(tick.ok()).toBe(true)
  expect(((await tick.json()) as { runs: Array<string> }).runs.length).toBeGreaterThan(0)

  // The run, in Runs: its ETA worked out, and the mail step not run yet.
  await page.getByText("Runs", { exact: true }).click()
  await expect.poll(async () => {
    await page.reload()
    await hydrated(page)
    return page.getByText("Geslaagd").count()
  }, { timeout: 60_000 }).toBeGreaterThan(0)

  // Start's card counts it.
  await page.goto("/dashboard")
  await hydrated(page)
  await page.getByRole("button", { name: "Kaart toevoegen" }).click()
  await page.getByRole("menuitem", { name: /Automatiseringen/ }).click()
  await expect(page.getByText("1 van 1")).toBeVisible()
})
