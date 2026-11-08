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

test("@onboarding @team a new admin runs onboarding to Start, every return resumes, and Team invites a colleague", async ({ browser, page, request }) => {
  // The whole of onboarding, then a mail that waits out the undo window and the queue.
  // Then the colleague's journey, roles, API keys and Agents en MCP: on a preview that is more than four minutes.
  test.setTimeout(360_000)
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

  // Founding: an empty name is refused in Dutch; a name and a free URL found the workspace, and a reload stays there.
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByText("Vul een naam voor je werkruimte in.")).toBeVisible()
  const workspace = `Allure ${Date.now().toString(36)}`
  await page.getByLabel("Naam werkruimte").fill(workspace)
  await page.getByRole("button", { name: "Doorgaan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Kies een abonnement om te proberen." })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Kies een abonnement om te proberen." })).toBeVisible()

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
    await page.getByRole("button", { name: "Collega uitnodigen" }).first().click()
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
  const theirs = await browser.newContext({ baseURL, ...(extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders }) })
  const invitee = await theirs.newPage()
  await invitee.goto(landing)
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
  // @realtime (step 7.2): the founder's open Team page shows the new colleague without a reload. Not behind Access:
  // a browser's WebSocket handshake carries cookies but not CI's service-token headers, so Access answers it with a
  // 302 (a person signed in to Access has its cookie). The local journey covers it.
  if (extraHTTPHeaders === undefined) await expect(page.getByText("Amber Lewis")).toBeVisible({ timeout: 15_000 })
  const mails = await (await request.get(`/api/__dev/mail?to=${encodeURIComponent(colleague)}`)).json() as {
    mails: Array<{ kind: string }>
  }
  expect(mails.mails.map((m) => m.kind)).toEqual(["team.invite"])

  // @rbac (step 5.1): as Klantenservice the colleague reads the team but not the link, and what they may not do the
  // server refuses, said in place with the permission it takes.
  await invitee.goto("/settings/team")
  await expect(invitee.getByText("Je rol kan de uitnodigingslink niet zien")).toBeVisible()
  await expect(invitee.getByRole("status").filter({ hasText: "Team en rollen · Bewerken" })).toBeVisible()
  // @rbac (step 5.2): asking for it lands with whoever may grant it, says so with Undo, and holds on a reload.
  const linkDenied = invitee.getByRole("status").filter({ hasText: "Je rol kan de uitnodigingslink niet zien" })
  await linkDenied.getByRole("button", { name: "Toegang vragen" }).click()
  await expect(invitee.getByText("Verzoek verstuurd")).toBeVisible()
  await expect(linkDenied.getByText(/^Gevraagd /)).toBeVisible()
  await invitee.reload()
  await expect(
    invitee.getByRole("status").filter({ hasText: "Je rol kan de uitnodigingslink niet zien" }).getByText(/^Gevraagd /)
  ).toBeVisible()
  await invitee.getByRole("button", { name: "Acties voor Amber Lewis" }).click()
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
})
