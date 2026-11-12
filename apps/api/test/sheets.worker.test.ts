import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Rekenbladen (step 16.4, M14 step 4). A member's sheets are their own and those shared with them; a save names the
 * version it was made on and a stale one is refused; each change carries its undo; only the owner shares and
 * removes; the INSYTE() figures are Analyse's, read whole months from the same rows; an export evaluates the tab on
 * the server with the figures read again. `/v1` and MCP read the sheets of the key's member.
 */

const pad = (n: number) => String(n).padStart(2, "0")
const now = new Date()
const month = (back: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
/** Last month (whole) and the one before it. */
const B = month(1)
const C = month(2)
const at = (m: string, hour = 10) => `${m}-01T${pad(hour)}:00:00Z`
const id = (n: number) => `${run}${n}`

const order = (n: number, placedAt: string, totalMinor: number) => ({
  shopify_id: `gid://shopify/Order/${id(n)}`,
  number: `#S${id(n)}`,
  customer_shopify_id: null,
  customer_name: "Klant S",
  customer_email: null,
  status: "paid",
  payment_status: "paid",
  fulfillment_status: "unfulfilled",
  total_minor: totalMinor,
  subtotal_minor: totalMinor,
  shipping_minor: 0,
  tax_minor: 0,
  discounts_minor: 0,
  currency: "EUR",
  payment_gateway: null,
  card_last4: null,
  shipping_address: { country: "NL" },
  tags: [],
  note: null,
  channel: "web",
  referral_code: null,
  placed_at: placedAt,
  paid_at: placedAt,
  shipped_at: null,
  cancelled_at: null,
  refunded_at: null,
  external_updated_at: placedAt,
  raw: {}
})

const tab = (cells: Record<string, string>) => ({
  id: "tab_1",
  name: "Blad 1",
  cells: Object.fromEntries(Object.entries(cells).map(([a, v]) => [a, { v }])),
  widths: {}
})

describe("Rekenbladen", () => {
  const people = { owner: "", view: "", service: "" }
  let workspace = ""
  let viewId = ""
  let storeId = ""

  beforeAll(async () => {
    const owner = await person("sheets-owner", "Rekenbladen B.V.")
    people.owner = owner.cookie
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const colleagues = (["view", "service"] as const).map((role) => ({
      role,
      email: `sheets-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const c of colleagues) people[c.role] = await join(c.email)
    viewId = ok(await sessionMe(people.view)).principals[0]!.id
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    storeId = ((await seed.json()) as { storeId: string }).storeId
  }, 120_000)

  it("makes, saves, refuses a stale save, renames with undo, shares, removes and restores", async () => {
    // A new sheet from the profit template reads the workspace's last five months.
    const made = ok(await rpc("Sheets.create", { template: "profit" }, people.owner))
    expect(made.sheet).toMatchObject({ title: "Winst per maand", linked: true, archived: false })
    const sheet = made.sheet.id
    const opened = ok(await rpc("Sheets.get", { id: sheet }, people.owner))
    expect(opened.version).toBe(1)
    expect(JSON.stringify(opened.tabs[0]!.cells)).toContain(`INSYTE(\\"omzet\\"; \\"${month(0)}\\")`)

    // A save names its version; the next on the old one is refused as stale.
    const saved = ok(
      await rpc(
        "Sheets.saveTabs",
        { id: sheet, baseVersion: 1, tabs: [tab({ A1: "Hallo", B1: "=1+1" })] },
        people.owner
      )
    )
    expect(saved.version).toBe(2)
    expect(failure(await rpc("Sheets.saveTabs", { id: sheet, baseVersion: 1, tabs: [tab({})] }, people.owner)))
      .toMatchObject({ _tag: "Conflict", reason: "stale_version" })
    expect(ok(await rpc("Sheets.get", { id: sheet }, people.owner)).tabs[0]!.cells["A1"]).toEqual({ v: "Hallo" })
    const changed = (await outboxOf(workspace)).filter((e) => e.event === "sheet.changed")
    expect(changed.length).toBeGreaterThan(0)

    // A rename carries its undo.
    const renamed = ok(await rpc("Sheets.update", { ids: [sheet], title: "Mijn blad" }, people.owner))
    expect(renamed.sheets[0]!.title).toBe("Mijn blad")
    ok(await rpc("Shared.undo", { token: renamed.undo!.token }, people.owner))
    expect(ok(await rpc("Sheets.get", { id: sheet }, people.owner)).title).toBe("Winst per maand")

    // Not shared: a colleague cannot open it, and the answer does not say it exists.
    expect(failure(await rpc("Sheets.get", { id: sheet }, people.view))).toMatchObject({ _tag: "SheetNotFound" })
    ok(await rpc("Sheets.share", { id: sheet, memberId: viewId, on: true }, people.owner))
    const theirs = ok(await rpc("Sheets.list", { view: "shared" }, people.view))
    expect(theirs.rows.map((r) => r.id)).toEqual([sheet])
    expect(theirs.counts.shared).toBe(1)
    // The colleague may edit it, but not share or remove it.
    ok(await rpc("Sheets.saveTabs", { id: sheet, baseVersion: 2, tabs: [tab({ A1: "Samen" })] }, people.view))
    expect(failure(await rpc("Sheets.remove", { ids: [sheet] }, people.view))).toMatchObject({
      _tag: "NotSheetOwner"
    })
    // Rekenbladen are Data's: Klantenservice has no Data · Bekijken.
    expect(failure(await rpc("Sheets.list", {}, people.service))).toMatchObject({ _tag: "Forbidden" })

    // Pinned and opened are the reader's own.
    ok(await rpc("Sheets.update", { ids: [sheet], pinned: true }, people.view))
    ok(await rpc("Sheets.markOpened", { id: sheet }, people.view))
    expect(ok(await rpc("Sheets.list", { view: "pinned" }, people.view)).rows).toHaveLength(1)
    expect(ok(await rpc("Sheets.list", { view: "pinned" }, people.owner)).rows).toHaveLength(0)
    expect(ok(await rpc("Sheets.list", { view: "recent" }, people.view)).rows.map((r) => r.id)).toEqual([sheet])

    // A folder takes the sheet; a second by the same name is refused.
    const folder = ok(await rpc("Sheets.createFolder", { name: "Rapportages", moveSheetIds: [sheet] }, people.owner))
    expect(failure(await rpc("Sheets.createFolder", { name: "rapportages" }, people.owner))).toMatchObject({
      _tag: "FolderNameTaken"
    })
    expect(ok(await rpc("Sheets.folders", undefined, people.owner))).toEqual([
      { id: folder.folder.id, name: "Rapportages", count: 1 }
    ])

    // A copy is the copier's own, shared with no one.
    const copy = ok(await rpc("Sheets.duplicate", { id: sheet }, people.view))
    expect(copy.sheet).toMatchObject({ ownerId: viewId, sharedWith: [] })

    // Removed with undo; the undo puts it back for both.
    const removed = ok(await rpc("Sheets.remove", { ids: [sheet] }, people.owner))
    expect(ok(await rpc("Sheets.list", {}, people.view)).rows.map((r) => r.id)).not.toContain(sheet)
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, people.owner))
    expect(ok(await rpc("Sheets.list", {}, people.view)).rows.map((r) => r.id)).toContain(sheet)
  })

  it("reads the INSYTE() figures from Analyse's rows, and exports a tab evaluated on the server", async () => {
    const requests = [
      { metric: "omzet", month: B },
      { metric: "bestellingen", month: B },
      { metric: "nettowinst", month: B },
      { metric: "omzet_meta", month: B },
      { metric: "bestaatniet", month: B },
      { metric: "omzet", month: "2001-01" }
    ]
    // The seeded store's own orders are drained first, so the figures below move by this run's two orders only.
    await call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}`, { method: "POST" })
    const before = ok(await rpc("Analytics.figures", { requests }, people.owner))
    const overviewBefore = ok(await rpc("Analytics.overview", { a: B, b: C }, people.owner))

    // Two paid orders on the first of last month.
    const write = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${storeId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch: { orders: [order(1, at(B), 12_500), order(2, at(B, 11), 7500)] } })
    })
    expect(write.status).toBe(200)
    await call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}`, { method: "POST" })

    const after = ok(await rpc("Analytics.figures", { requests }, people.owner))
    const value = (f: typeof after, i: number) => f.figures[i]!.value ?? 0
    expect(value(after, 0) - value(before, 0)).toBeCloseTo(200, 6)
    expect(value(after, 1) - value(before, 1)).toBe(2)
    expect(after.figures[2]).toMatchObject({ value: null, error: "unavailable", waitsFor: "costs" })
    expect(after.figures[3]).toMatchObject({ value: null, error: "unavailable", waitsFor: "channels" })
    expect(after.figures[4]).toMatchObject({ error: "unknown_metric" })
    expect(after.figures[5]).toMatchObject({ error: "no_month" })
    expect(after.currency).toBe("EUR")

    // The same rows as Analyse's revenue for that month.
    const overview = ok(await rpc("Analytics.overview", { a: B, b: C }, people.owner))
    const revenue = (o: typeof overview) => o.figures.find((f) => f.id === "revenue")!.a ?? 0
    expect(revenue(overview) - revenue(overviewBefore)).toBe(20_000)

    // A month by its Dutch name is the most recent one.
    const named = ok(
      await rpc("Analytics.figures", {
        requests: [{
          metric: "bestellingen",
          month: [
            "januari",
            "februari",
            "maart",
            "april",
            "mei",
            "juni",
            "juli",
            "augustus",
            "september",
            "oktober",
            "november",
            "december"
          ][Number(B.slice(5)) - 1]!
        }]
      }, people.owner)
    )
    expect(named.figures[0]).toMatchObject({ resolved: B, value: value(after, 1) })

    // The export: the cells evaluated with the figures read again.
    const made = ok(
      await rpc("Sheets.create", {
        template: "blank",
        title: "Export",
        tabs: [tab({ A1: "Bestellingen", B1: `=INSYTE("bestellingen"; "${B}")`, C1: "=B1*2" })]
      }, people.owner)
    )
    const file = ok(await rpc("Sheets.export", { id: made.sheet.id, format: "csv" }, people.owner))
    expect(file.fileName).toBe("Export - Blad 1.csv")
    expect(file.content).toContain(`Bestellingen`)
    expect(file.content).toContain(String(value(after, 1)))
    expect(file.content).toContain(String(value(after, 1) * 2))
    // Alleen lezen sees the sheet's figures but has no Data · Exporteren.
    ok(await rpc("Sheets.share", { id: made.sheet.id, memberId: viewId, on: true }, people.owner))
    expect(failure(await rpc("Sheets.export", { id: made.sheet.id, format: "csv" }, people.view))).toMatchObject({
      _tag: "Forbidden"
    })
    expect(ok(await rpc("Analytics.figures", { requests }, people.view)).figures[1]!.value).toBe(value(after, 1))
  })

  it("lets a key read its member's sheets over /v1", async () => {
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Rekenbladen",
        access: { kind: "custom", scopes: { data: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, people.owner)
    ).secret
    const auth = { headers: { authorization: `Bearer ${key}` } }
    const list = await call("http://api.test/v1/sheets", auth)
    expect(list.status).toBe(200)
    const rows = ((await list.json()) as { data: Array<{ id: string; title: string; linked: boolean }> }).data
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const one = await call(`http://api.test/v1/sheets/${rows[0]!.id}`, auth)
    expect(one.status).toBe(200)
    const body = (await one.json()) as { id: string; version: number; tabs: Array<{ cells: Record<string, unknown> }> }
    expect(body.id).toBe(rows[0]!.id)
    expect(body.tabs.length).toBeGreaterThan(0)
    expect((await call("http://api.test/v1/sheets/sh_nope", auth)).status).toBe(404)

    const narrow = ok(
      await rpc("ApiKeys.create", {
        label: "Alleen bestellingen",
        access: { kind: "custom", scopes: { orders: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, people.owner)
    ).secret
    expect((await call("http://api.test/v1/sheets", { headers: { authorization: `Bearer ${narrow}` } })).status)
      .toBe(403)
  })
})
