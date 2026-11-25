import { type APIRequestContext, expect, type Page, type Route, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * The website chat's journey (M15 step 8): an owner connects Websitechat on Koppelingen; a shopper writes from the
 * store's storefront; the message is in the inbox; the team answers and the shopper reads it; the agent hands it over
 * (through the dev route that runs the seam as the agent), a person takes it over and hands it back.
 *
 * The storefront is the shop's own address (`https://<shop>.myshopify.com`), answered by the test with the page the
 * theme's app embed writes, so the widget's requests carry the Origin the API checks. The widget's script and its
 * requests go to a stand-in host on https that the test hands on to the API it runs against, with that Origin: the
 * page never reaches a plain-http or a local address. The widget's shadow root is closed on a real storefront; here it
 * is opened before any script runs, so the test can read it.
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

/** Where the storefront loads the widget from, in the test: handed on to the API under test. */
const WIDGET_HOST = "https://chat-api.test"

test("@webchat a shopper chats from the storefront and the team answers, takes over and hands back", async ({ page, request, context, baseURL }) => {
  test.setTimeout(180_000)
  const email = `e2e-${Date.now().toString(36)}-chat@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Cas Chat")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Chat ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  const seeded = await page.request.post("/api/__dev/stores/seed", onPreview())
  expect(seeded.ok()).toBe(true)
  const { shop, workspaceId } = await seeded.json() as { shop: string; workspaceId: string }

  // The storefront, as the theme's app embed writes it, and the widget's host handed on to the API under test; the chat
  // is connected on Koppelingen, in the design's two steps, once the storefront showed nothing without it.
  const storefront = `https://${shop}`
  const api = new URL(baseURL!).origin
  const shopper = await context.newPage()
  await shopper.addInitScript(() => {
    const attach = Element.prototype.attachShadow
    Element.prototype.attachShadow = function(init) {
      return attach.call(this, { ...init, mode: "open" })
    }
  })
  await shopper.route(`${storefront}/**`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Winkel</title></head><body>` +
        `<h1>Winkel</h1><script src="${WIDGET_HOST}/api/public/chat/widget.js" data-shop="${shop}" defer></script>` +
        `</body></html>`
    }))
  await shopper.route(`${WIDGET_HOST}/**`, async (route: Route) => {
    const asked = route.request()
    const path = new URL(asked.url()).pathname + new URL(asked.url()).search
    const headers = { ...await asked.allHeaders(), origin: storefront, ...onPreview().headers }
    delete headers["host"]
    const answer = await route.fetch({ url: `${api}${path}`, headers, maxRedirects: 0 })
    await route.fulfill({ response: answer })
  })
  // Before the chat is connected the embed's script finds no chat: no bubble at all, rather than one that does nothing.
  const unopened = shopper.waitForResponse((r) => r.url().endsWith("/api/public/chat/session"))
  await shopper.goto(`${storefront}/`)
  expect((await unopened).status()).toBe(404)
  await expect(shopper.locator("[data-insyte-chat]")).toHaveCount(0)
  await page.goto("/settings/integrations")
  await hydrated(page)
  const row = page.getByRole("listitem").filter({ hasText: "Een chatvenster op je winkel" })
  await row.getByRole("button", { name: "Koppelen" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Volgende" }).click()
  await dialog.getByRole("button", { name: "Koppelen" }).click()
  await expect(page.getByText(/Websitechat gekoppeld aan/)).toBeVisible()

  // The isolate that answered the first 404 may hold "no chat here" for half a minute (`routeOf`): the storefront is
  // loaded again until the bubble shows, as a shopper's next page would.
  await expect(async () => {
    await shopper.goto(`${storefront}/`)
    await expect(shopper.getByRole("button", { name: "Chat met ons" })).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 45_000 })
  await shopper.getByRole("button", { name: "Chat met ons" }).click()
  await shopper.getByLabel("Je bericht").fill("Waar blijft mijn pakket?")
  await shopper.getByRole("button", { name: "Verstuur" }).click()
  await expect(shopper.getByText("Waar blijft mijn pakket?")).toBeVisible()

  // In the inbox, under Websitechat.
  await page.goto("/inbox?channel=webchat")
  await hydrated(page)
  await page.getByText("Waar blijft mijn pakket?").first().click()
  await expect(page).toHaveURL(/thread=cht_/)
  const threadId = new URL(page.url()).searchParams.get("thread")!

  // The team answers; the shopper reads it once the undo window is over.
  await page.getByLabel("Antwoord", { exact: true }).fill("Hij is onderweg, morgen in huis.")
  await page.getByRole("button", { name: "Versturen" }).click()
  await expect(page.getByText("Hij is onderweg, morgen in huis.").last()).toBeVisible()
  await expect(shopper.getByText("Hij is onderweg, morgen in huis.")).toBeVisible({ timeout: 45_000 })

  // The agent hands it over (as the customer agent will); a person takes it over and hands it back.
  const handed = await page.request.post(`/api/__dev/webchat/agent?workspace=${workspaceId}`, {
    ...onPreview({ "content-type": "application/json" }),
    data: { op: "handOver", threadId, reason: "Vraagt naar een terugbetaling" }
  })
  expect(await handed.json()).toEqual({ ok: null })
  const band = page.getByRole("region", { name: "Overdracht" })
  await expect(band).toBeVisible({ timeout: 20_000 })
  await band.getByRole("button", { name: "Overnemen" }).click()
  await expect(band.getByText(/Jij hebt het overgenomen/)).toBeVisible()
  await band.getByRole("button", { name: "Teruggeven aan Insyte" }).click()
  // Nobody holds it and no handover is open: the agent, which has not spoken here yet, has it back.
  await expect(band).toBeHidden()
  const thread = await page.request.post(`/api/__dev/webchat/agent?workspace=${workspaceId}`, {
    ...onPreview({ "content-type": "application/json" }),
    data: { op: "thread", threadId }
  })
  const read = await thread.json() as { ok: { takenOverBy: string | null; handedBackAt: string | null } }
  expect(read.ok.takenOverBy).toBeNull()
  expect(read.ok.handedBackAt).not.toBeNull()
  // The widget keeps polling: a request still handed on when the test ends is dropped, not failed.
  await shopper.unrouteAll({ behavior: "ignoreErrors" })
})
