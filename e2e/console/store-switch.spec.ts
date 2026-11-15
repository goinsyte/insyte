import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, onPreview, previewRequest } from "./access.ts"

/*
 * The store switch's journey (M6 multi-store): an admin with two stores (the recorded store imported twice, previews
 * have no Shopify) sees both stores' orders, switches the top bar to the second store and sees only its orders, finds
 * the console on that store after a reload, and goes back to every store. One person per run, as in `auth.spec.ts`.
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

const FIRST = "Insyte MVP Test"
const SECOND = "Tweede winkel"

test("@stores an admin with two stores switches the console from both to one and back", async ({ page, request }) => {
  test.setTimeout(150_000)
  const email = `e2e-${Date.now().toString(36)}-stores@example.com`
  const workspace = `Wissel ${Date.now().toString(36)}`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Wim Wissel")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(workspace)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // Two stores: the recorded one, and the same import again under another name.
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)
  const second = `/api/__dev/stores/seed?${new URLSearchParams({ tag: "tweede", name: SECOND })}`
  expect((await page.request.post(second, onPreview())).ok()).toBe(true)

  // Every store at once: both stores' orders.
  await page.goto("/orders")
  await hydrated(page)
  const rows = page.locator("tbody tr")
  await expect(rows.filter({ hasText: FIRST }).first()).toBeVisible()
  await expect(rows.filter({ hasText: SECOND }).first()).toBeVisible()

  // The top bar's switch: the second store only.
  await page.getByRole("button", { name: workspace }).click()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: /Alle winkels/ })).toBeVisible()
  // The choice is written as the member's preference: the reload below reads it back, so it waits for the write.
  const saved = page.waitForResponse((r) =>
    r.request().method() === "POST" && (r.request().postData() ?? "").includes("\"Prefs.patch\"") && r.ok()
  )
  await menu.getByRole("menuitem", { name: new RegExp(SECOND) }).click()
  expect(await (await saved).text(), "the store preference is saved").toContain("\"Success\"")
  await expect(page.getByRole("button", { name: SECOND })).toBeVisible()
  await expect(rows.filter({ hasText: SECOND }).first()).toBeVisible()
  await expect(rows.filter({ hasText: FIRST })).toHaveCount(0)

  // Kept for the member: after a reload the console is still on the second store.
  await page.reload()
  await hydrated(page)
  await expect(page.getByRole("button", { name: SECOND })).toBeVisible()
  await expect(rows.filter({ hasText: SECOND }).first()).toBeVisible()
  await expect(rows.filter({ hasText: FIRST })).toHaveCount(0)

  // Back to every store.
  await page.getByRole("button", { name: SECOND }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: /Alle winkels/ }).click()
  await expect(page.getByRole("button", { name: workspace })).toBeVisible()
  await expect(rows.filter({ hasText: FIRST }).first()).toBeVisible()
  await expect(rows.filter({ hasText: SECOND }).first()).toBeVisible()
})
