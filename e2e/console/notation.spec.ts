import { expect } from "@playwright/test"
import { onPreview } from "./access.ts"
import { founded, hydrated, test } from "./founder.ts"

/*
 * Regio's notation (Instellingen → Regio) in what the console writes: a founder with the recorded store saves
 * year-first dates and the 12-hour clock, and Bestellingen writes its orders' dates that way, the same in the server's
 * page and the browser's, so the page hydrates without a mismatch.
 */

test("@notation Bestellingen writes dates in Regio's notation, on the server as in the browser", async ({ page, request }) => {
  test.setTimeout(240_000)
  const hydration: Array<string> = []
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat/i.test(m.text())) hydration.push(m.text())
  })
  await founded(page, request, { name: "Noor Notatie", tag: "notation" })
  expect((await page.request.post("/api/__dev/stores/seed", onPreview())).ok()).toBe(true)

  await page.goto("/settings/regional")
  await hydrated(page)
  await page.getByLabel("Datumnotatie").selectOption("YYYY-MM-DD")
  await page.getByLabel("Tijdnotatie").selectOption("12h")
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click()
  await expect(page.getByText("Taal en notatie opgeslagen")).toBeVisible()

  // A new document: the server writes the dates, the browser takes the page over.
  await page.goto("/orders")
  await hydrated(page)
  await expect(page.getByRole("row", { name: /#1003/ })).toContainText(/\d{2}-\d{2}, \d{2}:\d{2} [ap]\.m\./)
  expect(hydration).toEqual([])
})
