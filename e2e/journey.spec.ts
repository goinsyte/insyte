import { expect, type Page, test as base } from "@playwright/test"

/*
 * Every way into the product, end to end, with no backend: the reference simulates sign-in, so any
 * valid-looking credentials work and the point is where each path lands and who it says you are.
 * The persona chip (bottom left) is the reference's own switcher and names the current persona.
 */

/** Every test also fails on an uncaught error in the page, which is how the build broke before. */
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e)))
    // No artificial loading delay: the journey is about where things go, not how they arrive.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("insyte:pace", "off")
      } catch {}
    })
    await use(page)
    expect(errors, "uncaught errors on the page").toEqual([])
  }
})

const chip = (p: Page) => p.locator("div.fixed.bottom-2 button").first()

async function signIn(page: Page) {
  await page.locator("input[type=\"email\"]").fill("demo@northwind.co")
  await page.locator("input[type=\"password\"]").fill("wachtwoord123")
  await page.getByRole("button", { name: "Inloggen", exact: true }).click()
  await page.waitForURL((u) => !u.pathname.endsWith("/login"))
}

/** Fills whatever the current step asks for and presses its primary button, until onboarding ends. */
async function onboard(page: Page, role: string) {
  for (let i = 0; i < 30 && new URL(page.url()).pathname.includes("/onboarding"); i++) {
    await page.waitForTimeout(400)
    for (const input of await page.locator("main input:visible").all()) {
      const type = (await input.getAttribute("type")) ?? "text"
      if (["checkbox", "radio", "range", "file", "hidden"].includes(type)) continue
      if ((await input.inputValue()) !== "") continue
      const placeholder = (await input.getAttribute("placeholder")) ?? ""
      await input.fill(
        type === "email"
          ? "demo@northwind.co"
          : type === "password"
          ? "wachtwoord123"
          : type === "url"
          ? "https://northwind.co"
          : type === "number" || type === "tel"
          ? "0612345678"
          : placeholder.includes("je-winkel")
          ? "northwind"
          : "Northwind"
      )
    }
    for (const area of await page.locator("main textarea:visible").all()) {
      if ((await area.inputValue()) === "") await area.fill("Wij verkopen kleding.")
    }
    const pick = page.getByText(role, { exact: true })
    if (await pick.isVisible()) {
      await pick.click()
      continue
    }
    const shopify = page.getByRole("button", { name: /Koppelen met Shopify/ })
    if (await shopify.isVisible()) {
      await shopify.click()
      await page.waitForTimeout(2500)
    }
    const primary = page.locator("main footer button").last()
    if (await primary.isEnabled().catch(() => false)) await primary.click()
    else await page.waitForTimeout(2500)
    await page.waitForTimeout(1200)
  }
}

test("a deploy serves only the product: the site, the brand book and the front door go to it", async ({ page }) => {
  for (const path of ["/", "/site", "/site/prijzen", "/brand", "/brand/tokens", "/brand/insyte-mark-white.svg"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  }
})

test("signing in lands on the console as the admin", async ({ page }) => {
  await page.goto("/app/login")
  await signIn(page)
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(chip(page)).toContainText("Admin")
})

for (
  const [portal, path, persona] of [
    ["supplier", "/supplier/dashboard", "Leverancier"],
    ["partner", "/affiliate/dashboard", "Affiliate (goedgekeurd)"]
  ] as const
) {
  test(`the ${portal} portal sign-in lands in its own dashboard as that persona`, async ({ page }) => {
    await page.goto(`/app/login?redirect=${encodeURIComponent(path)}`)
    await signIn(page)
    await expect(page).toHaveURL(new RegExp(`/app${path}$`))
    await expect(chip(page)).toContainText(persona)
  })
}

for (
  const [persona, role, landing, label] of [
    ["admin", "Mijn winkel inrichten", "/app/dashboard", "Admin"],
    ["supplier", "Ik ben leverancier", "/app/supplier/dashboard", "Leverancier"],
    ["affiliate", "Aanmelden als affiliate", "/app/affiliate/dashboard", "Affiliate (in afwachting)"]
  ] as const
) {
  test(`registering as ${persona} goes through onboarding to the right dashboard`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/app/register")
    await expect(page).toHaveURL(/\/app\/onboarding/)
    await onboard(page, role)
    await expect(page).toHaveURL(new RegExp(`${landing}$`))
    await expect(chip(page)).toContainText(label)
  })
}

for (
  const [id, lands] of [
    ["inv_nieuw", /\/app\/dashboard$/],
    ["inv_bestaand", /\/app\/dashboard$/],
    ["link_nw7k2q9d", /\/app\/dashboard$/],
    ["inv_leverancier", /\/app\/onboarding\?persona=supplier/],
    ["inv_affiliate", /\/app\/onboarding\?persona=affiliate/]
  ] as const
) {
  test(`accepting invitation ${id} continues to where it should`, async ({ page }) => {
    await page.goto(`/app/invitations/${id}`)
    for (let i = 0; i < 8 && page.url().includes("/invitations/"); i++) {
      for (const input of await page.locator("input:visible").all()) {
        const type = (await input.getAttribute("type")) ?? "text"
        if (["checkbox", "radio", "file"].includes(type)) continue
        if ((await input.inputValue()) === "") {
          await input.fill(
            type === "password" ? "wachtwoord123" : type === "email" ? "demo@northwind.co" : "Demo Persoon"
          )
        }
      }
      await page.getByRole("button", { name: /deelnemen|accepteren|Verder|verder|^Naar / }).last().click()
      await page.waitForTimeout(1500)
    }
    await expect(page).toHaveURL(lands)
  })
}

test("the persona switcher opens every persona's dashboard", async ({ page }) => {
  await page.goto("/app/dashboard")
  for (
    const [option, path] of [
      ["Leverancier", "/app/supplier/dashboard"],
      ["Affiliate (goedgekeurd)", "/app/affiliate/dashboard"],
      ["Affiliate (in afwachting)", "/app/affiliate/dashboard"],
      ["Affiliate (afgewezen)", "/app/affiliate/dashboard"],
      ["Admin", "/app/dashboard"]
    ] as const
  ) {
    await chip(page).click()
    await page.getByRole("menuitem", { name: option, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(chip(page)).toContainText(option)
  }
})
