import { type APIRequestContext, expect, type Page, type Route, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * The customer agent's journey (M15 step 8): an owner lets Insyte answer customers (Zelfstandigheid), publishes a
 * chapter, connects the website chat and switches the Klantagent on for it. A shopper on the storefront asks a question
 * the chapter answers, proves an order and is told its status, then asks for a person: the chat is in Overgedragen. The
 * owner takes it over and the agent is silent; handed back, the agent answers again and asks for the proof anew.
 *
 * The storefront and the widget's host are stood in for as in `webchat.spec.ts`. On the fake model locally; where
 * Insyte AI is not switched on (a preview has no model), there is nothing to answer with and the journey is skipped.
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

/** The agent's reply reaches the widget once its undo window has passed, after the relay and the queue. */
const REPLY = { timeout: 60_000 }

test("@customer-agent the agent answers a shopper, gives a proved order's status, hands over and keeps quiet while a person has it", async ({ page, request, context, baseURL }) => {
  test.setTimeout(300_000)
  const tag = Date.now().toString(36)
  const email = `e2e-${tag}-klantagent@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Kim Klantagent")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Klantagent ${tag}`)
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

  // Zelfstandigheid: "Klant beantwoorden" on Zelf doen. Without a model there is nothing to answer with.
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
  const unsaved = page.getByRole("region", { name: "Niet-opgeslagen wijzigingen" })
  await unsaved.getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(unsaved).toHaveCount(0)
  await expect(answer).toHaveAttribute("aria-checked", "true")

  // A chapter the agent answers from.
  await page.goto("/settings/ai/knowledge")
  await hydrated(page)
  await page.getByText("Retourneren", { exact: true }).click()
  await expect(page.getByText("Concept “Retourneren” gemaakt")).toBeVisible()
  await page.getByLabel("Tekst").fill("Je kunt binnen 30 dagen retourneren, ook sale-artikelen.")
  await page.getByRole("button", { name: "Publiceren", exact: true }).click()
  await expect(page.getByText("“Retourneren” gepubliceerd")).toBeVisible()

  // The website chat on Koppelingen.
  await page.goto("/settings/integrations")
  await hydrated(page)
  const row = page.getByRole("listitem").filter({ hasText: "Een chatvenster op je winkel" })
  await row.getByRole("button", { name: "Koppelen" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Volgende" }).click()
  await dialog.getByRole("button", { name: "Koppelen" }).click()
  await expect(page.getByText(/Websitechat gekoppeld aan/)).toBeVisible()

  // The Klantagent on for the website chat, answering from the knowledge base outside the opening hours too, so the
  // journey does not depend on the hour it runs at.
  await page.goto("/settings/ai/customer-agent")
  await hydrated(page)
  await page.getByRole("button", { name: "Aanzetten voor de websitechat" }).click()
  await expect(page.getByText("Klantagent staat aan")).toBeVisible()
  await page.getByRole("radio", { name: "Antwoorden uit de kennisbank" }).click()
  await unsaved.getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(unsaved).toHaveCount(0)
  await expect(page.getByRole("radio", { name: "Antwoorden uit de kennisbank" })).toHaveAttribute(
    "aria-checked",
    "true"
  )

  // An order of the recorded store's first customer, sent and on its way.
  const order = await page.request.post(`/api/__dev/agent/order?workspace=${workspaceId}`, {
    ...onPreview({ "content-type": "application/json" }),
    data: {
      email: "klant1@example.com",
      number: "#7301",
      status: "shipped",
      postcode: "1015 CJ",
      parcel: {
        carrier: "PostNL",
        trackingNumber: `3S${tag}`,
        trackingUrl: `https://jouw.postnl.nl/track-and-trace/3S${tag}`,
        status: "in_transit"
      }
    }
  })
  expect(order.ok()).toBe(true)

  // The shopper on the storefront.
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
  await shopper.goto(`${storefront}/`)
  await shopper.getByRole("button", { name: "Chat met ons" }).click()
  const say = async (text: string) => {
    await shopper.getByLabel("Je bericht").fill(text)
    await shopper.getByRole("button", { name: "Verstuur" }).click()
    await expect(shopper.getByText(text)).toBeVisible()
  }

  // A question the chapter answers: the agent's reply, from the chapter.
  await say("Kan ik een sale-artikel nog retourneren?")
  await expect(shopper.getByText(/binnen 30 dagen retourneren/)).toBeVisible(REPLY)

  // An order, proved by its number and the address on it: its status, and nothing before.
  await say("Waar blijft mijn bestelling?")
  await expect(shopper.getByText(/Stuur je bestelnummer en het e-mailadres/)).toBeVisible(REPLY)
  await say("Bestelling #7301, klant1@example.com")
  await expect(shopper.getByText(/#7301: Onderweg/)).toBeVisible(REPLY)

  // A person asked for: the shopper is told a colleague takes it, and the chat is in Overgedragen.
  await say("Kan ik een medewerker spreken?")
  await expect(shopper.getByText(/Hier kijkt een collega graag even naar/)).toBeVisible(REPLY)
  await page.goto("/inbox?view=handed_over")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Overgedragen" })).toBeVisible()
  await page.getByText(/Hier kijkt een collega graag even naar/).first().click()
  await expect(page).toHaveURL(/thread=cht_/)
  const threadId = new URL(page.url()).searchParams.get("thread")!

  // The owner takes it over: what the shopper writes now is the team's, and the agent says nothing.
  const band = page.getByRole("region", { name: "Overdracht" })
  await expect(band).toBeVisible()
  await band.getByRole("button", { name: "Overnemen" }).click()
  await expect(band.getByText(/Jij hebt het overgenomen/)).toBeVisible()
  const agentRows = async () => {
    const res = await page.request.get(`/api/__dev/agent/actions?workspace=${workspaceId}`, onPreview())
    const { actions } = await res.json() as {
      actions: Array<{ subjectId: string | null; refuseReason: string | null }>
    }
    return actions.filter((a) => a.subjectId === threadId)
  }
  const before = (await agentRows()).length
  await say("Hallo, is daar iemand?")
  // The agent's turn on it ran, and left it to the person who has it.
  await expect.poll(async () => (await agentRows()).length, REPLY).toBe(before + 1)
  expect((await agentRows()).at(-1)).toMatchObject({ refuseReason: "taken" })
  const said = shopper.getByText(/Hier kijkt een collega graag even naar/)
  await expect(said).toHaveCount(1)

  // Handed back: the agent has it again, and the order must be proved again.
  await band.getByRole("button", { name: "Teruggeven aan Insyte" }).click()
  await expect(band.getByText("Insyte voert dit gesprek weer.")).toBeVisible()
  await say("Is mijn pakket al onderweg?")
  await expect(shopper.getByText(/Stuur je bestelnummer en het e-mailadres/)).toHaveCount(2, REPLY)
})
