import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test"
import { createHmac } from "node:crypto"
import { admit, newContext, onPreview, previewRequest } from "./access.ts"

/*
 * Step 1's journey (15, "Done when"): register → the mail → verify → onboarding; signing in before verifying and with
 * the wrong password says why in Dutch; sign out and back in; reset the password end to end; a signed-out deep link
 * goes to sign-in with the way back. One person per run, so runs against a shared preview never meet.
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

/** Waits for the page to be React's (`<html data-hydrated>`, the root route): a click before that opens nothing. */
const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1)

test("@auth register, verify, sign out and in, reset the password", async ({ page, request }) => {
  const email = `e2e-${Date.now().toString(36)}@example.com`
  const password = "een-lang-wachtwoord"

  // Registering is the onboarding's first step.
  await page.goto("/register")
  await hydrated(page)
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
  await hydrated(page)
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
  await hydrated(page)
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
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  // The field's name carries its hint, "Minimaal 8 tekens."
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto("/login")
  await hydrated(page)
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
  await hydrated(page)
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
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(`e2e-${Date.now().toString(36)}-breached@example.com`)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill("password123")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByText("Dit wachtwoord komt voor in bekende datalekken. Kies een ander.")).toBeVisible()
})

test("@auth an address that is not invited is told Insyte is invite-only", async ({ page }) => {
  await page.goto("/onboarding")
  await hydrated(page)
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
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill(password)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
  await hydrated(page)

  // Enrolment's screen is the security settings page (M3); here the signed-in browser enrols through the API.
  const origin = new URL(page.url()).origin
  const enabled = await page.request.post("/api/auth/two-factor/enable", {
    data: { password },
    ...onPreview({ origin })
  })
  expect(enabled.status()).toBe(200)
  const { totpURI } = await enabled.json() as { totpURI: string }
  const confirmed = await page.request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totp(totpURI) },
    ...onPreview({ origin })
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

test("@analysis @order @customer @product @search a new admin with a store reads its first analysis, then opens its records", async ({ page, request }) => {
  // Onboarding to the store step, the recorded store imported in its place (previews have no Shopify), then the sync
  // and the store's first analysis: the reads tick off as the server reads, then the early read, then ready.
  test.setTimeout(180_000)
  const email = `e2e-${Date.now().toString(36)}-analysis@example.com`
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Ada Analyse")
  await page.getByLabel(/^Wachtwoord/).fill("een-lang-wachtwoord")
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await hydrated(page)
  await page.getByText("Mijn winkel inrichten").click()
  await page.getByLabel("Naam werkruimte").fill(`Analyse ${Date.now().toString(36)}`)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()

  // The store, connected and imported, as Shopify's way back would leave it.
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)
  await page.goto("/onboarding?connected=shopify")
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Alles wordt opgehaald." })).toBeVisible()
  await page.getByRole("button", { name: "Laat Insyte kijken" }).click()

  // The reading ends in the early read: no Shopify to read the policies from, so no prediction is made up.
  await expect(page.getByRole("heading", { name: "Nog te vroeg om te oordelen." })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("5 bestellingen in")).toBeVisible()
  await expect(page.getByText("Wat je inrichting al zegt")).toHaveCount(0)
  await expect(page.getByText("Levertijd per land")).toBeVisible()
  await page.getByRole("radio", { name: "Ja, zelf doen" }).click()
  await page.getByRole("button", { name: "Klaarzetten" }).click()

  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await expect(page.getByText("3 producten · 5 bestellingen · 3 klanten")).toBeVisible()
  await expect(page.getByText("Klaar om aan te zetten", { exact: true })).toBeVisible()
  await expect(page.getByText("Antwoorden op statusvragen, zodra de klantagent beschikbaar is"))
    .toBeVisible()
  // A reload keeps it: the choice is the server's.
  await page.reload()
  await hydrated(page)
  await expect(
    page.getByText("Levertijd-update op dag 5, zodra Automatiseringen beschikbaar zijn")
  )
    .toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // @order (steps 8.4d, 9.1): with the recorded store imported (previews have no Shopify), a row opens its order over
  // the list: the lines, the totals and its commands. A label added there is undone inside the window, before Shopify
  // hears of it. Its URL is a page, rendered whole on the server.
  await page.goto("/orders")
  await hydrated(page)
  // Draft orders are not made from the console yet: the page's and the panel's "new" are off.
  for (const button of await page.getByRole("button", { name: "Nieuwe bestelling" }).all()) {
    await expect(button).toBeDisabled()
  }
  await page.getByRole("row", { name: /#1002/ }).click()
  const record = page.getByRole("dialog")
  await expect(record.getByText("#1002")).toBeVisible()
  await expect(record.getByText("Wollen trui")).toBeVisible()
  await expect(record.getByRole("button", { name: "Acties" })).toBeVisible()
  await record.getByLabel("Label toevoegen").fill("Terugbellen")
  await record.getByLabel("Label toevoegen").press("Enter")
  await expect(record.getByRole("button", { name: "terugbellen verwijderen" })).toBeVisible()
  await page.getByRole("button", { name: "Ongedaan maken" }).click()
  await expect(record.getByRole("button", { name: "terugbellen verwijderen" })).toHaveCount(0)
  await expect(page).toHaveURL(/\/orders\/[^/]+$/)
  await page.reload()
  await hydrated(page)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "#1002" })).toBeVisible()
  await expect(page.getByText("Wollen trui")).toBeVisible()
  await page.getByRole("link", { name: "Bestellingen" }).first().click()
  await expect(page.getByRole("row", { name: /#1005/ })).toBeVisible()

  // @customer @product (step 8.4e): a customer opens over Klanten with their orders, each of which opens; a product
  // opens over Producten with its variants and the way into its store's Shopify admin, and its URL is a page.
  await page.goto("/customers")
  await hydrated(page)
  await page.getByRole("row", { name: /Anna de Vries/ }).click()
  const profile = page.getByRole("dialog")
  await expect(profile.getByRole("link", { name: "#1002" })).toBeVisible()
  await expect(profile.getByRole("button", { name: "Nieuw ticket" })).toHaveCount(0)
  await profile.getByRole("link", { name: "#1002" }).click()
  await expect(page.getByRole("heading", { name: "#1002" })).toBeVisible()
  await page.goto("/products")
  await hydrated(page)
  await page.getByRole("row", { name: /Linnen overhemd/ }).click()
  const item = page.getByRole("dialog")
  await expect(item.getByText("LIN-L")).toBeVisible()
  // Its photographs, featured first, each asked for at the size it is shown.
  await expect(item.getByRole("button", { name: /^Foto \d van 3 bekijken$/ })).toHaveCount(3)
  await expect(item.getByRole("link", { name: "Openen in Shopify" })).toHaveAttribute(
    "href",
    /^https:\/\/admin\.shopify\.com\/store\/seed-[a-z0-9]+\/products\/\d+$/
  )
  await page.reload()
  await hydrated(page)
  await expect(page.getByRole("heading", { name: "Linnen overhemd" })).toBeVisible()
  await expect(page.getByText("LIN-M")).toBeVisible()

  // @search (step 8.4e): the palette finds records through `Search.records`: an order by its number, then a customer
  // by name, each opening its record.
  // Without a trace the run is fast enough for the keys to land before the palette listens: press until it is open.
  const palette = page.getByRole("dialog")
  await expect(async () => {
    if (await palette.getByPlaceholder(/^Zoek bestellingen/).isVisible()) return
    await page.keyboard.press("ControlOrMeta+k")
    await expect(palette.getByPlaceholder(/^Zoek bestellingen/)).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await palette.getByPlaceholder(/^Zoek bestellingen/).fill("1003")
  await palette.getByRole("option", { name: /#1003/ }).click()
  await expect(page.getByRole("heading", { name: "#1003" })).toBeVisible()
  await page.keyboard.press("ControlOrMeta+k")
  // Each opening starts empty.
  await expect(page.getByRole("dialog").getByPlaceholder(/^Zoek bestellingen/)).toHaveValue("")
  await page.getByRole("dialog").getByPlaceholder(/^Zoek bestellingen/).fill("bram")
  await page.getByRole("dialog").getByRole("option", { name: /Bram Jansen/ }).click()
  await expect(page.getByRole("heading", { name: /Bram Jansen/ })).toBeVisible()

  // @supplier @orders (steps 10.1, 10.2): the linen shirt's Shopify vendor is a supplier. It gets an address for its
  // orders, then #1001 (paid, its line Atelier Noord's) is forwarded from Doorsturen with a note, waits out its window,
  // and waits for the supplier; its order's tracker shows it went to the supplier.
  await page.goto("/suppliers")
  await hydrated(page)
  await page.getByRole("row", { name: /Atelier Noord/ }).click()
  await page.getByRole("button", { name: "Bewerken" }).click()
  await page.getByLabel("E-mailadres voor bestellingen").fill("orders@atelier-noord.example")
  await page.getByRole("button", { name: "Opslaan" }).click()
  await expect(page.getByText("Atelier Noord opgeslagen")).toBeVisible()

  await page.goto("/orders?view=to_forward")
  await hydrated(page)
  await expect(page.getByRole("row", { name: /#1001.*Atelier Noord/ })).toBeVisible()
  await page.getByRole("button", { name: "Alles doorsturen" }).click()
  await page.getByPlaceholder(/^Bijvoorbeeld: cadeauverpakking/).fill("Graag zonder factuur in het pakket")
  await page.getByRole("button", { name: "1 bestelling naar 1 leverancier doorsturen" }).click()
  await expect(page.getByText("Alles is doorgestuurd")).toBeVisible()
  await page.goto("/orders?view=awaiting")
  await hydrated(page)
  await page.getByRole("row", { name: /#1001/ }).click()
  await expect(page.getByRole("region", { name: "Verwerking" })).toContainText("Naar leverancier")
})

test("@onboarding @team a new admin runs onboarding to Start, every return resumes, and Team invites a colleague", async ({ browser, page, request }) => {
  // The whole of onboarding, then a mail that waits out the undo window and the queue.
  // Then the colleague's journey, roles, API keys and Agents en MCP: on a preview that is more than four minutes.
  test.setTimeout(360_000)
  const email = `e2e-${Date.now().toString(36)}-onboarding@example.com`
  const password = "een-lang-wachtwoord"
  await page.goto("/onboarding")
  await hydrated(page)
  await page.getByLabel("Zakelijk e-mailadres").fill(email)
  await page.getByLabel("Volledige naam").fill("Eva Tester")
  await page.getByLabel(/^Wachtwoord/).fill(password)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Check je inbox." })).toBeVisible()
  await page.goto(await mailLink(request, email, "auth.verify"))
  await expect(page.getByRole("heading", { name: "Aan welke kant van de bestelling sta jij?" })).toBeVisible()
  await hydrated(page)

  await page.getByText("Mijn winkel inrichten").click()
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()

  // A reload, and a bare /onboarding, open on the step the server holds.
  await page.reload()
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()
  await page.goto("/onboarding")
  await expect(page.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()

  // Another browser: sign in, and the landing is the same step.
  // A new context gets none of the project's options by itself: the base URL, and on a preview the admission.
  const { baseURL } = test.info().project.use
  const other = await newContext(browser, baseURL)
  const elsewhere = await other.newPage()
  await elsewhere.goto("/login")
  await hydrated(elsewhere)
  await signIn(elsewhere, email, password)
  await expect(elsewhere.getByRole("heading", { name: "Geef je werkruimte een naam." })).toBeVisible()
  await other.close()

  // Founding: an empty name is refused in Dutch; a name and a free URL found the workspace, and a reload stays there.
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByText("Vul een naam voor je werkruimte in.")).toBeVisible()
  const workspace = `Allure ${Date.now().toString(36)}`
  await page.getByLabel("Naam werkruimte").fill(workspace)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Kies een abonnement om te proberen." })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Kies een abonnement om te proberen." })).toBeVisible()
  await hydrated(page)

  // The trial starts without a card; the store is left for Start, which skips the steps a store needs.
  await page.getByRole("button", { name: "Gratis proefperiode starten" }).click()
  await expect(page.getByRole("heading", { name: "Koppel Shopify." })).toBeVisible()
  await page.getByRole("button", { name: "Nu overslaan" }).click()
  await expect(page.getByRole("heading", { name: "Je bent binnen." })).toBeVisible()
  await page.getByRole("button", { name: "Dashboard openen" }).click()

  // Start: the setup plate for the new workspace, and a ticked task that stays ticked.
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole("heading", { name: `Nog 7 stappen, dan draait Insyte voor ${workspace}` })).toBeVisible()
  await page.getByRole("button", { name: `"2FA voor iedereen inschakelen" markeren als klaar` }).click()
  await expect(page.getByRole("heading", { name: `Nog 6 stappen, dan draait Insyte voor ${workspace}` })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: `Nog 6 stappen, dan draait Insyte voor ${workspace}` })).toBeVisible()

  // Done is done: onboarding sends them to Start.
  await page.goto("/onboarding")
  await hydrated(page)
  await expect(page).toHaveURL(/\/dashboard$/)

  // @team (step 4.3): Start opens Team, where the founder is alone on the trial's seats.
  await page.getByRole("link", { name: "Openen" }).first().click()
  await expect(page).toHaveURL(/\/settings\/team$/)
  await expect(page.getByText("1 teamlid · 0 uitnodigingen open · 5 vrij")).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  // An invitation takes a seat; its undo takes it back before any mail goes.
  // Not an allowlisted domain: the invitation is their way past the beta gate.
  const colleague = `e2e-${Date.now().toString(36)}-colleague@invited.test`
  const invite = async () => {
    // A click before the page has hydrated opens nothing: try until the dialog is there.
    await expect(async () => {
      await page.getByRole("button", { name: "Collega uitnodigen" }).first().click()
      await expect(page.getByLabel("E-mailadressen")).toBeVisible({ timeout: 2_000 })
    }).toPass()
    await page.getByLabel("E-mailadressen").fill(colleague)
    await page.getByLabel("E-mailadressen").press("Enter")
    await page.getByRole("button", { name: "Uitnodiging versturen" }).click()
    await expect(page.getByText(`Uitnodiging verstuurd naar ${colleague}`)).toBeVisible()
  }
  await invite()
  await expect(page.getByText("Openstaande uitnodigingen · 1")).toBeVisible()
  await expect(page.getByText("1 teamlid · 1 uitnodiging open · 4 vrij")).toBeVisible()
  await page.getByRole("button", { name: "Ongedaan maken" }).click()
  await expect(page.getByText("Openstaande uitnodigingen · 0")).toBeVisible()

  // Sent and left: it holds on a reload, and the mail goes once the undo window has passed.
  await invite()
  await page.reload()
  await expect(page.getByText(colleague)).toBeVisible()
  await expect.poll(async () => {
    const res = await request.get(`/api/__dev/mail?to=${encodeURIComponent(colleague)}`)
    const { mails } = await res.json() as { mails: Array<{ kind: string }> }
    return mails.map((m) => m.kind)
  }, { message: "the invitation mail", timeout: 60_000 }).toEqual(["team.invite"])

  // The shareable link, turned on, shows its address.
  await page.getByRole("switch", { name: "Uitnodigen via link" }).click()
  await expect(page.getByLabel("Uitnodigingslink")).toHaveValue(/\/invitations\/link_[A-Za-z0-9_-]{16}$/)
  // @team (step 4.4): the colleague opens the mail in a browser of their own, makes an account on the landing (no
  // confirmation mail: the link proved the address), goes through the steps and lands in the workspace.
  const landing = await mailLink(request, colleague, "team.invite")
  const theirs = await newContext(browser, baseURL)
  const invitee = await theirs.newPage()
  await invitee.goto(landing)
  await hydrated(invitee)
  await expect(invitee.getByRole("heading", { name: `Word lid van ${workspace}` })).toBeVisible()
  await expect(invitee.getByText("Als Klantenservice")).toBeVisible()
  await invitee.getByLabel("Volledige naam").fill("Amber Lewis")
  await invitee.getByLabel("Wachtwoord", { exact: true }).fill(password)
  await invitee.getByRole("button", { name: "Account maken en deelnemen" }).click()
  await expect(invitee.getByRole("heading", { name: "Hoe je team je herkent" })).toBeVisible()
  await invitee.getByRole("button", { name: "Verder" }).click()
  await expect(invitee.getByRole("heading", { name: "Wat je wilt horen" })).toBeVisible()
  await invitee.getByRole("button", { name: `Naar ${workspace}` }).click()
  await expect(invitee).toHaveURL(/\/dashboard$/)
  await expect(invitee.getByText(`Je zit in ${workspace}`)).toBeVisible()
  // @realtime (step 7.2): the founder's open Team page shows the new colleague without a reload; on a preview too,
  // since `/api/realtime` bypasses Access (it checks the session itself).
  await expect(page.getByText("Amber Lewis")).toBeVisible({ timeout: 15_000 })
  // @shell (step 7.5): the bell counts it at once, and says who joined.
  const bell = page.getByRole("button", { name: "Meldingen (1 ongelezen)" })
  await expect(bell).toBeVisible({ timeout: 15_000 })
  await bell.click()
  await expect(page.getByText("accepteerde je uitnodiging")).toBeVisible()
  await page.keyboard.press("Escape")
  const mails = await (await request.get(`/api/__dev/mail?to=${encodeURIComponent(colleague)}`)).json() as {
    mails: Array<{ kind: string }>
  }
  expect(mails.mails.map((m) => m.kind)).toEqual(["team.invite"])

  // @rbac (step 5.1): as Klantenservice the colleague reads the team but not the link, and what they may not do the
  // server refuses, said in place with the permission it takes.
  await invitee.goto("/settings/team")
  await hydrated(invitee)
  await expect(invitee.getByText("Je rol kan de uitnodigingslink niet zien")).toBeVisible()
  await expect(invitee.getByRole("status").filter({ hasText: "Team en rollen · Bewerken" })).toBeVisible()
  // @rbac (step 5.2): asking for it lands with whoever may grant it, says so with Undo, and holds on a reload.
  const linkDenied = invitee.getByRole("status").filter({ hasText: "Je rol kan de uitnodigingslink niet zien" })
  await linkDenied.getByRole("button", { name: "Toegang vragen" }).click()
  await expect(invitee.getByText("Verzoek verstuurd")).toBeVisible()
  await expect(linkDenied.getByText(/^Gevraagd /)).toBeVisible()
  await invitee.reload()
  await hydrated(invitee)
  await expect(
    invitee.getByRole("status").filter({ hasText: "Je rol kan de uitnodigingslink niet zien" }).getByText(/^Gevraagd /)
  ).toBeVisible()
  // The page's first-visit guide can arrive after the page and take the click while it is open: closed when it shows,
  // and the menu opened until it is open.
  await expect(async () => {
    const guide = invitee.getByRole("button", { name: "Uitleg sluiten" })
    if (await guide.isVisible()) await guide.click()
    await invitee.getByRole("button", { name: "Acties voor Amber Lewis" }).click()
    await expect(invitee.getByRole("menuitem", { name: "Alleen lezen" })).toBeVisible({ timeout: 2_000 })
  }).toPass()
  await invitee.getByRole("menuitem", { name: "Alleen lezen" }).click()
  const refusal = invitee.getByRole("alert").filter({ hasText: "Dat ging niet door." })
  await expect(refusal).toContainText("Team en rollen · Beheren")
  await expect(refusal).toContainText("Je rol Klantenservice heeft dat niet")
  await refusal.getByRole("button", { name: "Details" }).click()
  await expect(refusal).toContainText("team.manage")
  await expect(refusal).toContainText("Members.setRole")

  // The link has done its work, and the founder sees their colleague in the team.
  await invitee.goto(landing)
  await expect(invitee.getByText(`${colleague} accepteerde deze uitnodiging op`, { exact: false })).toBeVisible()
  // @rbac (step 5.3): the founder grants the request on Rollen; the area goes up on Klantenservice, so the colleague
  // sees the link at once. The request list stays theirs to see: it takes Beheren.
  await page.goto("/settings/roles")
  await expect(page.getByText("Amber Lewis vraagt om")).toBeVisible()
  await hydrated(page)
  await page.getByRole("button", { name: "Toekennen aan Klantenservice" }).click()
  await expect(page.getByText("Klantenservice kan nu collega's uitnodigen")).toBeVisible()
  await invitee.goto("/settings/team")
  await expect(invitee.getByLabel("Uitnodigingslink")).toBeVisible()
  await expect(invitee.getByText("Je rol kan de uitnodigingslink niet zien")).toHaveCount(0)
  await invitee.goto("/settings/roles")
  await expect(invitee.getByText("Je rol kan de toegangsverzoeken niet zien")).toBeVisible()

  // A new role from Klantenservice opens in the editor, and holds on a reload.
  await page.getByRole("button", { name: "Nieuwe rol" }).click()
  await page.getByPlaceholder("Retourbalie").fill("Retourbalie")
  await page.getByRole("button", { name: "Rol maken" }).click()
  await expect(page).toHaveURL(/\/settings\/roles\?role=rol_/)
  await expect(page.getByRole("heading", { name: "Retourbalie" })).toBeVisible()
  await page.reload()
  await expect(page.getByText("Gemaakt vanuit Klantenservice.")).toBeVisible()
  await page.goto("/settings/team")

  await theirs.close()
  await page.reload()
  await expect(page.getByText("2 teamleden · 0 uitnodigingen open · 4 vrij")).toBeVisible()
  await expect(page.getByText("Amber Lewis")).toBeVisible()

  // @keys (step 6.1): the founder makes an API key and sees the secret once, then rotates it and revokes it.
  await page.goto("/settings/api-keys")
  await hydrated(page)
  const making = page.getByRole("dialog")
  // A click before the page has hydrated opens nothing: try until the dialog is there.
  await expect(async () => {
    await page.getByRole("button", { name: "Sleutel aanmaken" }).first().click()
    await expect(making).toBeVisible({ timeout: 2_000 })
  }).toPass()
  await making.getByPlaceholder("Voorraadfeed magazijn").fill("Voorraadfeed")
  await making.getByRole("button", { name: "Sleutel aanmaken" }).click()
  await expect(making.getByRole("heading", { name: "Voorraadfeed is klaar" })).toBeVisible()
  await expect(making.getByText(/^ins_live_\w+_\w+$/)).toBeVisible()
  await making.getByText("Ik heb hem opgeslagen").click()
  await making.getByRole("button", { name: "Klaar" }).click()
  await page.reload()
  await hydrated(page)
  await page.getByRole("button", { name: /Voorraadfeed/ }).click()
  const detail = page.getByRole("dialog")
  await detail.getByRole("button", { name: "Roteren" }).click()
  await detail.getByRole("button", { name: "Nieuwe sleutel maken" }).click()
  await expect(detail.getByText("De nieuwe sleutel, één keer.", { exact: false })).toBeVisible()
  await expect(detail.getByText(/^ins_live_\w+_\w+$/)).toBeVisible()
  await detail.getByRole("button", { name: "Intrekken" }).click()
  await expect(page.getByText("Voorraadfeed ingetrokken")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "1 ingetrokken sleutel tonen" })).toBeVisible()

  // @mcp (step 6.3): Agents en MCP shows the live server's address, ready to copy.
  await page.goto("/settings/agents")
  await expect(page.getByText("Nog geen sleutel voor een agent")).toBeVisible()
  await expect(page.getByText(/^https:\/\/.+\/mcp$/)).toBeVisible()
  await expect(page.getByText("Live", { exact: true })).toBeVisible()

  // @stores (step 8.1): Winkels lists the workspace's stores, none yet. Connecting an address Shopify does not know is
  // refused before Shopify opens (a stage without the Shopify app says it cannot connect yet); a refusal from the
  // callback is said once and leaves the address.
  await page.goto("/settings/stores")
  await hydrated(page)
  await expect(page.getByText("Shopify-winkels · 0")).toBeVisible()
  const connecting = page.getByRole("dialog")
  await expect(async () => {
    await page.getByRole("button", { name: "Winkel koppelen" }).click()
    await expect(connecting).toBeVisible({ timeout: 2_000 })
  }).toPass()
  await connecting.getByPlaceholder("northwind-nl").fill(`insyte-e2e-${Date.now().toString(36)}`)
  await connecting.getByRole("button", { name: "Doorgaan naar Shopify" }).click()
  await connecting.getByRole("button", { name: "Goedkeuren en koppelen" }).click()
  await expect(page.getByText(/^(Die winkel bestaat niet|Koppelen met Shopify kan hier nog niet)$/)).toBeVisible()
  await expect(connecting.getByRole("button", { name: "Goedkeuren en koppelen" })).toBeEnabled()
  await page.goto("/settings/stores?error=elsewhere")
  await expect(page.getByText("Deze winkel hangt aan een andere werkruimte")).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/stores$/)

  // @orders (step 8.4b): Bestellingen is the reference's list over `Orders.list`; without a store it is the first day.
  await page.goto("/orders")
  await expect(page.getByRole("heading", { name: "Nog geen bestellingen" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Winkel koppelen" })).toBeVisible()
  // @customers @products (step 8.4c): the same first day on Klanten and Producten.
  await page.goto("/customers")
  await expect(page.getByRole("heading", { name: "Nog geen klanten" })).toBeVisible()
  await page.goto("/products")
  await expect(page.getByRole("heading", { name: "Nog geen producten" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Uit Shopify importeren" })).toBeVisible()
})
