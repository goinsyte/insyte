import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, previewRequest } from "./access.ts"

/*
 * A second workspace (M3.1): a new admin with one cost line makes another workspace from the store menu ("Nieuwe
 * werkruimte"), goes through its onboarding, and lands in it, where Kosten is empty; switching back from the menu shows
 * the first workspace's line again. What one workspace holds never shows in the other. One person per run, as in
 * `auth.spec.ts`.
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

/**
 * The organisation step, then the plan, the store left for later, and Start. A workspace made from the store menu
 * loads the page afresh into its onboarding (`reloads`): the plan step is then clicked once that page is live.
 */
async function throughOnboarding(page: Page, name: string, reloads = false) {
  await page.getByLabel("Naam werkruimte").fill(name)
  const loaded = reloads ? page.waitForEvent("load") : Promise.resolve()
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await loaded
  await hydrated(page)
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** The store menu's trigger, named for the workspace (or its store) the console is in. */
const menuOf = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) }).first()

test("@workspaces makes a second workspace, finds it empty, and switches back", async ({ page, request }) => {
  test.setTimeout(180_000)
  const run = Date.now().toString(36)
  const email = `e2e-${run}-workspaces@example.com`
  const first = `Eerste ${run}`
  const second = `Tweede ${run}`

  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Wendy Werkruimte")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await throughOnboarding(page, first)

  // The first workspace holds one cost line.
  await page.goto("/costs")
  await hydrated(page)
  await page.getByRole("button", { name: "Eerste kostenpost" }).click()
  const dialog = page.getByRole("dialog", { name: "Kostenpost toevoegen" })
  await dialog.getByPlaceholder("Bijvoorbeeld: Klantenservice-software").fill("Alleen in de eerste")
  await dialog.getByPlaceholder("0").fill("39")
  await dialog.getByRole("button", { name: "Toevoegen" }).click()
  await expect(page.getByText("Alleen in de eerste toegevoegd")).toBeVisible()

  // "Nieuwe werkruimte" runs the organisation step again, then the new workspace's own onboarding.
  await menuOf(page, first).click()
  await page.getByRole("menuitem", { name: "Nieuwe werkruimte" }).click()
  await expect(page).toHaveURL(/\/onboarding/)
  await hydrated(page)
  await throughOnboarding(page, second, true)
  await expect(menuOf(page, second)).toBeVisible()

  // Its Kosten are its own: empty.
  await page.goto("/costs")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Nog geen kosten" })).toBeVisible()
  await expect(page.getByText("Alleen in de eerste")).toHaveCount(0)

  // Both are in the menu; back to the first, whose line is there again.
  await menuOf(page, second).click()
  await expect(page.getByText("Werkruimtes")).toBeVisible()
  await page.getByRole("menuitem", { name: new RegExp(first) }).click()
  await expect(page.getByText(`Je werkt nu in ${first}`)).toBeVisible()
  await expect(menuOf(page, first)).toBeVisible()
  await page.goto("/costs")
  await hydrated(page)
  await expect(page.getByText("Alleen in de eerste")).toBeVisible()
})
