import { expect, type Page } from "@playwright/test"
import { newContext } from "./access.ts"
import { founded, hydrated, mailLink, PASSWORD, test } from "./founder.ts"

/*
 * The team's journey (M3, `@team`): the owner invites a colleague, who joins in a browser of their own; the owner
 * changes their role up and back down, and the colleague's open Team page follows each change without a reload (the
 * `records.changed member` refresh); then the owner removes them, and they are out of the workspace. The invitation's
 * own steps, the access request and its grant are `auth.spec.ts`'s `@onboarding @team` journey.
 */

const COLLEAGUE = "Mila Meijer"

/** A member's row menu: the page's first-visit guide can take the click while it opens, so closed when it shows. */
async function memberMenu(page: Page, name: string) {
  await expect(async () => {
    const guide = page.getByRole("button", { name: "Uitleg sluiten" })
    if (await guide.isVisible()) await guide.click()
    await page.getByRole("button", { name: `Acties voor ${name}` }).click()
    await expect(page.getByRole("menuitem", { name: "Openen" })).toBeVisible({ timeout: 2_000 })
  }).toPass()
  return page.getByRole("menu")
}

test("@team the owner invites a colleague, changes their role up and down as they watch, and removes them", async ({ browser, page, request }) => {
  // Onboarding, a mail that waits out the undo window and the queue, a second browser.
  test.setTimeout(240_000)
  const { workspace } = await founded(page, request, { name: "Tessa Team", tag: "team" })

  // The invitation, as Klantenservice (the dialog's default).
  await page.goto("/settings/team")
  await hydrated(page)
  const colleague = `e2e-${Date.now().toString(36)}-member@invited.test`
  await expect(async () => {
    await page.getByRole("button", { name: "Collega uitnodigen" }).first().click()
    await expect(page.getByLabel("E-mailadressen")).toBeVisible({ timeout: 2_000 })
  }).toPass()
  await page.getByLabel("E-mailadressen").fill(colleague)
  await page.getByLabel("E-mailadressen").press("Enter")
  await page.getByRole("button", { name: "Uitnodiging versturen" }).click()
  await expect(page.getByText(`Uitnodiging verstuurd naar ${colleague}`)).toBeVisible()

  // The colleague joins from the mail, in a browser of their own.
  const landing = await mailLink(request, colleague, "team.invite")
  const theirs = await newContext(browser, test.info().project.use.baseURL)
  try {
    const member = await theirs.newPage()
    await member.goto(landing)
    await hydrated(member)
    await expect(member.getByRole("heading", { name: `Word lid van ${workspace}` })).toBeVisible()
    await member.getByLabel("Volledige naam").fill(COLLEAGUE)
    await member.getByLabel("Wachtwoord", { exact: true }).fill(PASSWORD)
    await member.getByRole("button", { name: "Account maken en deelnemen" }).click()
    await expect(member.getByRole("heading", { name: "Hoe je team je herkent" })).toBeVisible()
    await member.getByRole("button", { name: "Verder" }).click()
    await member.getByRole("button", { name: `Naar ${workspace}` }).click()
    await expect(member).toHaveURL(/\/dashboard$/)
    // Start for someone who joined rather than founded: no setup of theirs, and the workspace's missing store said.
    await expect(member.getByRole("heading", { name: "Nog geen winkel gekoppeld" })).toBeVisible()
    // The front door sends them where the gate does: their landing, Start.
    await member.goto("/")
    await expect(member).toHaveURL(/\/dashboard$/)

    // In the owner's team; as Klantenservice the colleague's Team page holds the link back.
    await expect(page.getByText(COLLEAGUE).first()).toBeVisible({ timeout: 15_000 })
    await member.goto("/settings/team")
    await hydrated(member)
    const denied = member.getByText("Je rol kan de uitnodigingslink niet zien")
    const linkSwitch = member.getByRole("switch", { name: "Uitnodigen via link" })
    await expect(denied).toBeVisible()
    await expect(linkSwitch).toHaveCount(0)
    // Without the right to invite, only the top's greyed-out button says "Collega uitnodigen", not the empty list.
    await expect(member.getByText("Geen uitnodigingen open.")).toBeVisible()
    await expect(member.getByRole("button", { name: "Collega uitnodigen" })).toHaveCount(1)
    // The workspace switch counts the seats as Team does: two people of the trial's six.
    await member.getByRole("button", { name: new RegExp(workspace) }).first().click()
    await expect(member.getByText("4 van 6 plekken vrij", { exact: false })).toBeVisible()
    await member.keyboard.press("Escape")

    // Up to Beheerder: the colleague's open page gives them the link, without a reload.
    await (await memberMenu(page, COLLEAGUE)).getByRole("menuitem", { name: "Beheerder", exact: true }).click()
    await expect(page.getByText(`${COLLEAGUE} is nu Beheerder`)).toBeVisible()
    await expect(linkSwitch).toBeVisible({ timeout: 15_000 })
    await expect(denied).toHaveCount(0)

    // Down to Alleen lezen: the link is held back again, and it holds on a reload.
    await (await memberMenu(page, COLLEAGUE)).getByRole("menuitem", { name: "Alleen lezen", exact: true }).click()
    await expect(page.getByText(`${COLLEAGUE} is nu Alleen lezen`)).toBeVisible()
    await expect(denied).toBeVisible({ timeout: 15_000 })
    await expect(linkSwitch).toHaveCount(0)
    await member.reload()
    await hydrated(member)
    await expect(denied).toBeVisible()

    // Removed: the owner's team is one again, and the colleague is out of the workspace, onboarding's to start anew.
    await (await memberMenu(page, COLLEAGUE)).getByRole("menuitem", { name: "Verwijderen uit werkruimte" }).click()
    await expect(page.getByText(`${COLLEAGUE} verwijderd`)).toBeVisible()
    await page.reload()
    await hydrated(page)
    await expect(page.getByText("1 teamlid · 0 uitnodigingen open · 5 vrij")).toBeVisible()
    await expect(page.getByText(COLLEAGUE)).toHaveCount(0)
    await member.goto("/settings/team")
    await expect(member).toHaveURL(/\/onboarding/)
  } finally {
    await theirs.close()
  }
})
