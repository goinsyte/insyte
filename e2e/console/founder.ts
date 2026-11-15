import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { admit, previewRequest } from "./access.ts"

/*
 * What the console's journeys share: the fixtures (Access on the preview's origin only, the dev routes' request
 * context, and no uncaught error on the page), the captured mail's link, and a founder who has just come through
 * onboarding without a store. One person per run, so runs against a shared preview never meet.
 */

export const test = base.extend<{ page: Page }>({
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

/** The newest captured mail of one kind to one address: the link in it, on the origin the test runs against. */
export async function mailLink(request: APIRequestContext, to: string, kind: string): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    const res = await request.get(`/api/__dev/mail?to=${encodeURIComponent(to)}`)
    const { mails } = await res.json() as { mails: Array<{ kind: string; url: string | null }> }
    link = mails.find((m) => m.kind === kind)?.url ?? undefined
    return link
  }, { message: `a ${kind} mail to ${to}`, timeout: 60_000 }).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

/** Waits for the page to be React's (`<html data-hydrated>`): a click before that opens nothing. */
export const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

export const PASSWORD = "een-lang-wachtwoord"

/**
 * A new founder through onboarding (register, the mail, verify, a workspace, the trial, no store) to Start. Returns
 * their address and the workspace's name.
 */
export async function founded(
  page: Page,
  request: APIRequestContext,
  { name, tag }: { name: string; tag: string }
): Promise<{ email: string; workspace: string }> {
  const run = Date.now().toString(36)
  const email = `e2e-${run}-${tag}@example.com`
  const workspace = `${name.split(" ")[0]} ${run}`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill(name)
  await page.getByLabel(/^Wachtwoord/).fill(PASSWORD)
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
  return { email, workspace }
}
