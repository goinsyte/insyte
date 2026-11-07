import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"

/*
 * Step 1's journey (15, "Done when"): register → the mail → verify → onboarding; signing in before verifying and with
 * the wrong password says why in Dutch; sign out and back in; reset the password end to end; a signed-out deep link
 * goes to sign-in with the way back. One person per run, so runs against a shared preview never meet.
 */

const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: Array<string> = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await use(page)
    expect(errors, "uncaught errors on the page").toEqual([])
  }
})

/** The newest captured mail of one kind to one address: the link in it, as the person would click it. */
async function mailLink(request: APIRequestContext, to: string, kind: string): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    const res = await request.get(`/api/__dev/mail?to=${encodeURIComponent(to)}`)
    const { mails } = await res.json() as { mails: Array<{ kind: string; url: string | null }> }
    link = mails.find((m) => m.kind === kind)?.url ?? undefined
    return link
  }, { message: `a ${kind} mail to ${to}` }).toBeTruthy()
  // The mail links to the origin the API was told; the test follows it on the origin it runs against.
  const url = new URL(link!)
  return `${url.pathname}${url.search}`
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Wachtwoord", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Inloggen", exact: true }).click()
}

test("@auth register, verify, sign out and in, reset the password", async ({ page, request }) => {
  const email = `e2e-${Date.now().toString(36)}@example.com`
  const password = "een-lang-wachtwoord"

  // Registering is the onboarding's first step.
  await page.goto("/register")
  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByRole("heading", { name: "Maak je account aan." })).toBeVisible()
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  // The field's name carries its hint, "Minimaal 8 tekens."
  await page.getByLabel(/^Wachtwoord/).fill(password)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()

  // Not yet verified: the step says so instead of moving on.
  await page.getByRole("button", { name: "Ik heb op de link geklikt" }).click()
  await expect(page.getByText("Je e-mailadres is nog niet bevestigd.")).toBeVisible()

  // The link signs in and lands on the role step.
  await page.goto(await mailLink(request, email, "auth.verify"))
  await expect(page).toHaveURL(/\/onboarding\?step=2/)
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()

  // Leaving the flow signs out.
  await page.getByRole("button", { name: "Onboarding sluiten" }).click()
  await expect(page).toHaveURL(/\/login/)

  // The wrong password is named, in Dutch; the right one lands on the person's landing, the role step.
  await signIn(page, email, "niet-het-wachtwoord")
  await expect(page.getByText("Dit e-mailadres en wachtwoord horen niet bij elkaar.")).toBeVisible()
  await signIn(page, email, password)
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
  await page.getByRole("button", { name: "Onboarding sluiten" }).click()
  await expect(page).toHaveURL(/\/login/)

  // Reset: the dialog mails a link, the link opens the reset screen, the new password signs in and the old does not.
  await page.getByRole("button", { name: "Vergeten?" }).click()
  await page.getByRole("dialog").getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByRole("button", { name: "Resetlink versturen" }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox" })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.reset"))
  await expect(page).toHaveURL(/\/reset-password\?token=/)
  await page.getByLabel("Nieuw wachtwoord").fill("nog-een-lang-wachtwoord")
  await page.getByLabel("Herhaal je wachtwoord").fill("nog-een-lang-wachtwoord")
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click()
  await expect(page.getByRole("heading", { name: "Wachtwoord gewijzigd" })).toBeVisible()
  await page.getByRole("link", { name: "Inloggen" }).click()
  await signIn(page, email, password)
  await expect(page.getByText("Dit e-mailadres en wachtwoord horen niet bij elkaar.")).toBeVisible()
  await signIn(page, email, "nog-een-lang-wachtwoord")
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
})

test("@auth signing in before verifying says why", async ({ page }) => {
  const email = `e2e-${Date.now().toString(36)}-unverified@example.com`
  await page.goto("/onboarding")
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  // The field's name carries its hint, "Minimaal 8 tekens."
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto("/login")
  await signIn(page, email, "een-lang-wachtwoord")
  await expect(page.getByText(/^Bevestig eerst je e-mailadres/)).toBeVisible()
})

test("@auth a signed-out deep link goes to sign-in with the way back", async ({ page }) => {
  await page.goto("/orders?view=open")
  await expect(page).toHaveURL(/\/login\?redirect=%2Forders%3Fview%3Dopen$/)
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible()
})
