import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * Settings that take effect (M17 step 20.1b): a new admin's recorded store, its returns portal turned on, and
 * Huisstijl saved with a logo and a colour. The shopper's portal is headed with that logo and its button wears that
 * colour; a track-and-trace update sent from Bestellingen reaches the shopper with the same look and the parcel's
 * status as Verzending words it. Mail is read from the capture adapter (`/api/__dev/mail`).
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

type Captured = {
  kind: string
  url: string | null
  sentAt: string
  look?: { color: string | null; logoPath: string | null } | null
  status?: { text: string; show: string } | null
}

/*
 * The look and the status a mail went with are kept by the capture adapter's isolate only (`capturedSenders`), not in
 * `captured_mail`. Locally that is the one isolate the dev route answers from; on a deployed stage the mail may have
 * gone from another, so there the journey checks the mail arrived and leaves its look to the Worker test
 * (`settings-effect.worker.test.ts`) and the template test (`resend.test.ts`).
 */
const oneIsolate = process.env.CONSOLE_URL === undefined

const mails = async (request: APIRequestContext, to: string) =>
  ((await (await request.get(`/api/__dev/mail?to=${encodeURIComponent(to)}`)).json()) as { mails: Array<Captured> })
    .mails

async function mailLink(request: APIRequestContext, to: string, kind: string): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    link = (await mails(request, to)).find((m) => m.kind === kind)?.url ?? undefined
    return link
  }, { message: `a ${kind} mail to ${to}`, timeout: 45_000 }).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

// A one-pixel PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)
const COLOR = "#7A1F3D"

test("@settings-effect Huisstijl reaches the returns portal and a shopper's tracking mail", async ({ page, request }) => {
  test.setTimeout(240_000)
  const run = Date.now().toString(36)
  const email = `e2e-${run}-huisstijl@example.com`

  // A new admin, with the recorded store imported.
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Hanna Huisstijl")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Huisstijl ${run}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  // The returns portal on.
  await page.goto("/settings/returns")
  await hydrated(page)
  await page.getByRole("switch", { name: "Retourportaal aan" }).click()
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(page.getByText("Retourinstellingen opgeslagen")).toBeVisible()
  const portal = await page.getByRole("link", { name: "Portaal bekijken" }).getAttribute("href")
  expect(portal).toMatch(/^\/retour\//)

  // Huisstijl: a logo and a colour.
  await page.goto("/settings/brand")
  await hydrated(page)
  await page.locator("input[type=file]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG })
  await expect(page.getByRole("img", { name: "Logo" })).toBeVisible()
  await page.getByLabel("Hexcode").fill(COLOR)
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(page.getByText("Huisstijl opgeslagen")).toBeVisible()

  // The shopper's portal: the store's logo at the head, its colour on the button.
  await page.goto(portal!)
  await hydrated(page)
  const logo = page.locator("header img")
  await expect(logo).toBeVisible()
  const logoSrc = (await logo.getAttribute("src"))!
  expect(logoSrc).toMatch(/^\/api\/brand\/[^/]+\/logo\/[^/]+$/)
  // Without a session: a shopper's mail client asks for it the same way.
  expect((await request.get(logoSrc)).headers()["content-type"]).toBe("image/png")
  // The button wears the colour once it can be pressed (a disabled one stays grey).
  await page.getByLabel("Bestelnummer").fill("#1003")
  await page.getByLabel("E-mailadres van de bestelling").fill("iemand@example.com")
  await expect(page.getByRole("button", { name: "Bestelling zoeken" })).toHaveCSS(
    "background-color",
    "rgb(122, 31, 61)"
  )

  // A track-and-trace update from Bestellingen: the shopper's mail wears the look and words the parcel's status.
  await page.goto("/orders")
  await hydrated(page)
  await page.getByRole("row", { name: /#1003/ }).getByRole("checkbox", { name: "Rij selecteren" }).click()
  await page.getByRole("button", { name: "Acties" }).click()
  const sent = Date.now() - 5_000
  await page.getByText("Track & trace-update sturen").click()
  await expect(page.getByText(/Track & trace-update gestuurd/)).toBeVisible()
  await expect.poll(
    async () =>
      (await mails(request, "klant2@example.com")).some((m) =>
        m.kind === "order.message" && Date.parse(m.sentAt) >= sent &&
        (!oneIsolate ||
          (m.look?.logoPath === logoSrc && m.look.color === COLOR && typeof m.status?.text === "string" &&
            m.status.text !== ""))
      ),
    { message: "the tracking mail in the store's look", timeout: 60_000 }
  ).toBe(true)
})
