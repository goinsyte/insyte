import { describe, expect, it } from "vitest"
import { checkE2eRequests } from "../lib/e2e-requests-rules.ts"

const spec = (source: string, path = "e2e/console/x.spec.ts") => checkE2eRequests([{ path, source }])

const FIXTURE = `
const test = base.extend<{ page: Page }>({
  request: async ({ playwright, baseURL }, use) => {
    const request = await previewRequest(playwright, baseURL)
    await use(request)
  }
})
`

describe("e2e:requests", () => {
  it("passes sealed calls: the fixture, the page's context and a plain one", () => {
    expect(spec(`${FIXTURE}
test("x", async ({ page, request }) => {
  await request.get("/api/__dev/mail")
  await pageRequest(page).post("/api/__dev/stores/seed", onPreview())
  const api = await plainRequest(playwright, { maxRedirects: 0 })
  const body = route.request().postData()
})`)).toEqual([])
  })

  it("passes founder.ts's shared test, whose fixture is sealed", () => {
    expect(spec(`import { founded, test } from "./founder.ts"
test("x", async ({ page, request }) => { await founded(page, request, { name: "A", tag: "a" }) })`)).toEqual([])
  })

  it("lets access.ts reach Playwright's contexts: it is the one that seals them", () => {
    expect(spec(`const x = page.request; await playwright.request.newContext({})`, "e2e/console/access.ts")).toEqual([])
  })

  it("fails page.request, context.request and playwright.request", () => {
    expect(spec(`${FIXTURE}
await page.request.post("/api/auth/two-factor/enable")
const c = context.request
const api = await playwright.request.newContext({ maxRedirects: 0 })`)).toHaveLength(3)
  })

  it("names the line", () => {
    expect(spec(`\n\nawait page.request.get("/x")`)[0]).toMatch(/^e2e\/console\/x\.spec\.ts:3: /)
  })

  it("ignores what a comment names", () => {
    expect(
      spec(`// page.request is not sealed\n/* nor is\n context.request */\nconst url = "http://x/a" // page.request`)
    )
      .toEqual([])
  })

  it("fails Playwright's own request factory", () => {
    expect(spec(`import { expect, request } from "@playwright/test"`)).toHaveLength(1)
  })

  it("fails toBeOK, whose message prints the call log", () => {
    expect(spec(`${FIXTURE}\nawait expect(await request.get("/x")).toBeOK()`)).toHaveLength(1)
  })

  it("fails a spec that takes Playwright's own request fixture", () => {
    expect(spec(`import { expect, test } from "@playwright/test"
test("x", async ({ page, request }) => { await request.get("/api/__dev/mail") })`)).toEqual([
      "e2e/console/x.spec.ts: takes Playwright's own request fixture: define it with previewRequest or use founder.ts's test"
    ])
  })

  it("fails a request fixture that does not come from previewRequest", () => {
    expect(spec(`const test = base.extend({
  request: async ({ playwright }, use) => { await use(await playwright.newContext()) }
})`)).toEqual(["e2e/console/x.spec.ts: its request fixture does not come from previewRequest (access.ts)"])
  })
})
