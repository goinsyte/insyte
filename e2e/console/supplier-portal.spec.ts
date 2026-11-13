import { type APIRequestContext, type BrowserContext, expect, type Page, test as base } from "@playwright/test"
import { admit, newContext, onPreview, previewRequest } from "./access.ts"

/*
 * The supplier portal's journey (M16 steps 1–2): a new admin's recorded store has orders for its vendor Atelier Noord;
 * the admin gives the supplier an address, invites its person to the portal from the supplier's dialog and sends it
 * one of the orders. That person makes an account through the mail and lands in the portal, sees the order with only its own
 * line, accepts it and marks it shipped with tracking. The brand sees it shipped, and the supplier as active. Each
 * waits out the real undo window (eight seconds) rather than a test hook: the journey runs on a preview too.
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

async function mailed(request: APIRequestContext, to: string, kind: string): Promise<void> {
  await expect.poll(async () => {
    const res = await request.get(`/api/__dev/mail?to=${encodeURIComponent(to)}`)
    const { mails } = await res.json() as { mails: Array<{ kind: string }> }
    return mails.some((m) => m.kind === kind)
  }, { message: `a ${kind} mail to ${to}`, timeout: 45_000 }).toBe(true)
}

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

test("@supplier-portal a brand invites its supplier, who accepts and ships an order in the portal", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(240_000)
  const run = Date.now().toString(36)
  const email = `e2e-${run}-brand@example.com`
  const orders = `e2e-${run}-orders@supplier.example`
  const person = `e2e-${run}-noor@supplier.example`

  // A new admin, with the recorded store imported.
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Bram Merk")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Merk ${run}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  // The store's vendor Atelier Noord is a supplier: its orders go to this address.
  await page.goto("/suppliers")
  await hydrated(page)
  await page.getByRole("row", { name: /Atelier Noord/ }).click()
  const card = page.getByRole("dialog").filter({ hasText: "Leveranciersportaal" })
  await expect(card.getByText("Niet uitgenodigd")).toBeVisible()
  await card.getByRole("button", { name: "Bewerken" }).click()
  await page.getByPlaceholder("orders@leverancier.nl").fill(orders)
  await page.getByRole("button", { name: "Opslaan" }).click()
  await expect(page.getByText("Atelier Noord opgeslagen")).toBeVisible()

  // Its person, invited to the portal from the supplier's dialog: invited, until they join.
  if ((await card.count()) === 0) await page.getByRole("row", { name: /Atelier Noord/ }).click()
  await card.getByRole("button", { name: "Uitnodigen voor het portaal" }).click()
  const invite = page.getByRole("dialog", { name: "Atelier Noord uitnodigen voor het portaal" })
  await invite.getByPlaceholder("ops@leverancier.com").fill(person)
  await invite.getByPlaceholder("Marco Rossi").fill("Noor")
  await invite.getByRole("button", { name: "Uitnodiging versturen" }).click()
  await expect(page.getByText("Atelier Noord uitgenodigd voor het portaal")).toBeVisible()
  await expect(card.getByText(`Verstuurd naar ${person}`)).toBeVisible()
  await page.keyboard.press("Escape")

  // One of Atelier Noord's orders, sent to it: it reaches them by mail and in the portal.
  await page.goto("/orders?view=to_forward")
  await hydrated(page)
  const row = page.getByRole("row").filter({ hasText: "Atelier Noord" }).first()
  const number = (await row.getByText(/^#\d+$/).first().textContent())!
  await page.getByRole("button", { name: "Alles doorsturen" }).click()
  const forward = page.getByRole("dialog", { name: "Doorsturen naar leveranciers" })
  await forward.getByRole("radio", { name: "Leveranciersportaal" }).click()
  await forward.getByRole("button", { name: /sturen$/i }).click()
  await mailed(request, orders, "supplier.order")
  await page.goto("/orders?view=awaiting")
  await hydrated(page)
  await expect(page.getByRole("row", { name: new RegExp(number) })).toBeVisible()

  // The supplier's person: an account through the invitation, and straight into the portal.
  const supplier: BrowserContext = await newContext(browser, baseURL)
  const portal = await supplier.newPage()
  const pageErrors: Array<string> = []
  portal.on("pageerror", (e) => pageErrors.push(`${String(e)} @ ${portal.url()}`))
  await portal.goto(await mailLink(request, person, "team.invite"))
  await hydrated(portal)
  await expect(portal.getByText("Atelier Noord in het leveranciersportaal")).toBeVisible()
  await portal.getByLabel("Je naam").fill("Noor")
  await portal.getByRole("textbox", { name: "Wachtwoord" }).fill("een-lang-wachtwoord")
  await portal.getByRole("button", { name: "Account maken en verder" }).click()
  await expect(portal).toHaveURL(/\/supplier\/dashboard$/)

  // Their order: accepted, then shipped with tracking, each with its toast.
  await portal.goto("/supplier/orders?view=to_accept")
  await hydrated(portal)
  await portal.getByRole("row", { name: new RegExp(number) }).click()
  await expect(portal.getByRole("heading", { name: number })).toBeVisible()
  await portal.getByRole("button", { name: "Accepteren", exact: true }).click()
  await expect(portal.getByText(`${number} geaccepteerd`)).toBeVisible()
  await portal.getByRole("button", { name: "Markeren als verzonden", exact: true }).click()
  const ship = portal.getByRole("dialog", { name: `${number} verzenden` })
  await ship.getByRole("radio", { name: "PostNL" }).click()
  await ship.getByPlaceholder("3SXYZ0123456789").fill("3SNOORD123456")
  await ship.getByRole("button", { name: "Markeren als verzonden", exact: true }).click()
  await expect(portal.getByText(`${number} gemarkeerd als verzonden`)).toBeVisible()
  await expect(portal.getByText("Verzonden met PostNL · 3SNOORD123456")).toBeVisible()
  expect(pageErrors, "uncaught errors in the portal").toEqual([])
  await supplier.close()

  // The brand: the order is no longer waiting on Atelier Noord, and its person signs in to the portal.
  await page.goto("/orders?view=awaiting")
  await hydrated(page)
  await expect(page.getByRole("row", { name: new RegExp(number) })).toHaveCount(0)
  await page.goto("/suppliers")
  await hydrated(page)
  await page.getByRole("row", { name: /Atelier Noord/ }).click()
  await expect(card.getByText(`${person} logt zelf in`, { exact: false })).toBeVisible()
})
