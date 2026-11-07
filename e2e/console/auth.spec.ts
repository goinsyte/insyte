import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { createHmac } from "node:crypto"

/*
 * Step 1's journey (15, "Done when"): register → the mail → verify → onboarding; signing in before verifying and with
 * the wrong password says why in Dutch; sign out and back in; reset the password end to end; a signed-out deep link
 * goes to sign-in with the way back. One person per run, so runs against a shared preview never meet.
 */

const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: Array<string> = []
    const logged: Array<string> = []
    page.on("pageerror", (e) => errors.push(`${String(e)} @ ${page.url()}`))
    // What the console said, for the report when a page error needs its context (a hydration mismatch says little).
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") logged.push(`${m.type()}: ${m.text()} @ ${page.url()}`)
    })
    await use(page)
    if (errors.length > 0) await test.info().attach("console", { body: logged.join("\n"), contentType: "text/plain" })
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
  await expect(page.getByText("E-mailadres of wachtwoord klopt niet.")).toBeVisible()
  await signIn(page, email, password)
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
  await page.getByRole("button", { name: "Onboarding sluiten" }).click()
  await expect(page).toHaveURL(/\/login/)

  // Reset: the dialog mails a link, the link opens the reset screen, the new password signs in and the old does not.
  await page.getByRole("button", { name: "Vergeten?" }).click()
  await page.getByRole("dialog").getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByRole("button", { name: "Resetlink versturen" }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox" })).toBeVisible()
  await expect(page.getByText("bij ons bekend is, ontvang je een resetlink")).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.reset"))
  await expect(page).toHaveURL(/\/reset-password\?token=/)
  await page.getByLabel("Nieuw wachtwoord").fill("nog-een-lang-wachtwoord")
  await page.getByLabel("Herhaal je wachtwoord").fill("nog-een-lang-wachtwoord")
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click()
  await expect(page.getByRole("heading", { name: "Wachtwoord gewijzigd" })).toBeVisible()
  await page.getByRole("link", { name: "Inloggen" }).click()
  await signIn(page, email, password)
  await expect(page.getByText("E-mailadres of wachtwoord klopt niet.")).toBeVisible()
  await signIn(page, email, "nog-een-lang-wachtwoord")
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()

  // The account's log holds what just happened to it (M2.6).
  const { events } = await (await request.get(`/api/__dev/auth-events?email=${encodeURIComponent(email)}`)).json() as {
    events: Array<{ kind: string }>
  }
  expect(events.map((e) => e.kind)).toEqual(
    expect.arrayContaining([
      "sign_up",
      "sign_in",
      "sign_in_failed",
      "sign_out",
      "password_reset_requested",
      "password_changed"
    ])
  )
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

test("@auth five wrong passwords lock the address, and the form says for how long", async ({ page }) => {
  const email = `e2e-${Date.now().toString(36)}-locked@example.com`
  await page.goto("/login")
  for (let attempt = 1; attempt <= 5; attempt++) {
    await signIn(page, email, `fout-${attempt}`)
    await expect(page.getByText("E-mailadres of wachtwoord klopt niet.")).toBeVisible()
  }
  await signIn(page, email, "fout-6")
  await expect(page.getByText("Te veel pogingen. Probeer het over 15 minuten opnieuw.")).toBeVisible()
})

test("@auth a password from a known breach is refused at registration", async ({ page }) => {
  // The check asks HIBP, which only deployed stages do (local runs stay offline).
  test.skip(process.env.CONSOLE_URL === undefined, "the breached-password check runs on deployed stages only")
  await page.goto("/onboarding")
  await page.getByLabel("Zakelijk e-mailadres").fill(`e2e-${Date.now().toString(36)}-breached@example.com`)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill("password123")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByText("Dit wachtwoord komt voor in bekende datalekken. Kies een ander.")).toBeVisible()
})

test("@auth an address that is not invited is told Insyte is invite-only", async ({ page }) => {
  await page.goto("/onboarding")
  await page.getByLabel("Zakelijk e-mailadres").fill(`e2e-${Date.now().toString(36)}@example.org`)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByText(/^Insyte is nog alleen op uitnodiging\./)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Maak je account aan." })).toBeVisible()
})

/** RFC 6238, what an authenticator app shows, from an `otpauth://` URI's base32 secret. */
const totp = (totpURI: string, at = Date.now()) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const bits = [...(new URL(totpURI).searchParams.get("secret") ?? "").toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => Number.parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const mac = createHmac("sha1", key).update(counter).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

test("@auth an account with two-factor on is asked for the code after the password", async ({ page, request }) => {
  const email = `e2e-${Date.now().toString(36)}-2fa@example.com`
  const password = "een-lang-wachtwoord"
  await page.goto("/onboarding")
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill(password)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()

  // Enrolment's screen is the security settings page (M3); here the signed-in browser enrols through the API.
  const origin = new URL(page.url()).origin
  const enabled = await page.request.post("/api/auth/two-factor/enable", { data: { password }, headers: { origin } })
  expect(enabled.status()).toBe(200)
  const { totpURI } = await enabled.json() as { totpURI: string }
  const confirmed = await page.request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totp(totpURI) },
    headers: { origin }
  })
  expect(confirmed.status()).toBe(200)

  await page.getByRole("button", { name: "Onboarding sluiten" }).click()
  await expect(page).toHaveURL(/\/login/)
  await signIn(page, email, password)
  await expect(page).toHaveURL(/\/login\/two-factor/)
  await expect(page.getByRole("heading", { name: "Tweestapsverificatie" })).toBeVisible()
  await page.getByLabel("Code").fill("000000")
  await page.getByRole("button", { name: "Bevestigen" }).click()
  await expect(page.getByText(/^Deze code klopt niet\./)).toBeVisible()
  // The next window's code: the current one was spent confirming the enrolment.
  await page.getByLabel("Code").fill(totp(totpURI, Date.now() + 30_000))
  await page.getByRole("button", { name: "Bevestigen" }).click()
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
})

test("@auth back from Google with a refusal, the sign-in screen says why", async ({ page }) => {
  await page.goto("/login?error=BETA_CLOSED")
  await expect(page.getByText(/^Insyte is nog alleen op uitnodiging\./)).toBeVisible()
  await page.goto("/login?error=access_denied")
  await expect(page.getByText("Je hebt het inloggen met Google afgebroken.")).toBeVisible()
  // Not a code: dropped, and the form shows nothing.
  await page.goto("/login?error=%3Cscript%3E")
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("@onboarding a new admin reaches the organisation step, and every return resumes there", async ({ browser, page, request }) => {
  const email = `e2e-${Date.now().toString(36)}-onboarding@example.com`
  const password = "een-lang-wachtwoord"
  await page.goto("/onboarding")
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill(password)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()

  await page.getByText("Mijn winkel inrichten").click()
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()

  // A reload, and a bare /onboarding, open on the step the server holds.
  await page.reload()
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()
  await page.goto("/onboarding")
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()

  // Another browser: sign in, and the landing is the same step.
  // A new context gets none of the project's options by itself: the base URL, and on a preview the Access headers.
  const { baseURL, extraHTTPHeaders } = test.info().project.use
  const other = await browser.newContext({ baseURL, ...(extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders }) })
  const elsewhere = await other.newPage()
  await elsewhere.goto("/login")
  await signIn(elsewhere, email, password)
  await expect(elsewhere.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()
  await other.close()
})
