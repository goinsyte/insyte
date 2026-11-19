import { Db } from "@insyte/database/Db"
import {
  holdRecordedDiscount,
  namelessRecordedDiscount,
  recordedDiscount,
  seedRecordedDiscount
} from "@insyte/integrations-shopify/ShopifyRecorded"
import { discountFailed } from "@insyte/modules/affiliates/use-cases/discount"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The affiliate programme (M16 steps 3–5). A person applies on the brand's page and waits; the brand turns them down
 * with a reason, they apply again, and the brand approves them with a code that becomes a Shopify discount once the
 * undo window has passed. As an affiliate they make a link; a click goes through `/r/:slug` to the store's own page
 * with `insyte_ref`, never elsewhere. Orders through the link or with the code become conversions (never naming the
 * shopper); a refund inside the return window takes its share back, one after it changes nothing. The month's close
 * makes payouts (the running month has none), promotes the tier, and the brand approves and marks them paid, each with
 * Undo; no money moves. A member held to some stores sees no money and approves nothing.
 *
 * A workspace has no programme until the brand starts one; a code attributes only once its Shopify discount is
 * Insyte's own (never a code the store already had); an order that looks like the affiliate's own waits for the brand.
 */

const dev = async (path: string, query: Record<string, string>) => {
  const res = await call(`http://api.test/api/__dev/affiliates/${path}?${new URLSearchParams(query)}`, {
    method: "POST"
  })
  expect([path, res.status]).toEqual([path, 200])
  return res
}

const month = (at: Date) => at.toISOString().slice(0, 7)

const click = (slug: string, ip = "203.0.113.7", extra = "") =>
  call(`http://api.public.test/r/${slug}${extra}`, { redirect: "manual", headers: { "cf-connecting-ip": ip } })

type Store = Awaited<ReturnType<typeof importedStore>>

/** Waits until \`done\` holds (a step in a Workflow got that far), or fails the test. */
const until = async (done: () => Promise<boolean> | boolean, ms = 20_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await done()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("timed out")
}

/** The brand starts its programme ("Opslaan" on its settings): its apply page's slug. */
const start = async (store: Store) =>
  ok(await rpc("Affiliates.program.update", {}, store.cookie)).applyPath.split("/").pop()!

/** An application approved with `code`, past its undo window, its Shopify discount's write run to its end. */
const approveMade = async (store: Store, applicationId: string, code: string, tier: "bronze" | "silver" = "bronze") => {
  await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
  const affiliateId = ok(
    await rpc("Affiliates.applications.approve", { applicationId, tier, code }, store.cookie)
  ).ids[0]!
  await pastUndo(store.workspace)
  await relay(store.workspace)
  for (const instance of await writes.get()) await instance.waitForStatus("complete")
  return affiliateId
}

/** An approved affiliate of the brand, signed in, with its code made in Shopify. */
const affiliateOf = async (store: Store, tag: string, name: string, code: string) => {
  const slug = await start(store)
  const who = await person(tag)
  const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name }, who.cookie))
  return { ...who, affiliateId: await approveMade(store, applicationId, code) }
}

describe("the affiliate programme", () => {
  it("takes an application, a rejection and a new one, and an approval with its Shopify discount", async () => {
    const store = await importedStore("aff")
    // Read before the brand starts it: the defaults, no page to apply on, and reading starts nothing.
    expect(ok(await rpc("Affiliates.program", undefined, store.cookie))).toMatchObject({
      started: false,
      applyPath: ""
    })
    expect(ok(await rpc("Affiliates.inviteLink", undefined, store.cookie))).toEqual({ url: "" })
    expect(ok(await rpc("Affiliates.program", undefined, store.cookie)).started).toBe(false)
    ok(await rpc("Affiliates.program.update", {}, store.cookie))
    const program = ok(await rpc("Affiliates.program", undefined, store.cookie))
    expect(program).toMatchObject({ started: true, enabled: true, returnDays: 14, payoutDay: 15, storeConnected: true })
    const slug = program.applyPath.split("/").pop()!
    expect(program.applyPath).toBe(`/partners/${slug}`)

    // Applying needs an account; the page names the brand.
    const anna = await person("aff-anna")
    expect(ok(await rpc("AffiliateApply.landing", { program: slug }, anna.cookie))).toMatchObject({ open: true })
    expect(failure(await rpc("AffiliateApply.me", undefined, anna.cookie))).toMatchObject({ _tag: "NotAffiliate" })
    const applied = ok(
      await rpc(
        "AffiliateApply.apply",
        { program: slug, name: "Anna Jansen", motivation: "Ik maak reels" },
        anna.cookie
      )
    )
    expect(ok(await rpc("AffiliateApply.me", undefined, anna.cookie))).toMatchObject({ state: "pending" })
    expect(ok(await sessionMe(anna.cookie)).landing).toBe("/affiliate/dashboard")
    // Twice is the same wait; the portal is not theirs yet, nor any of the console's calls.
    expect(failure(await rpc("AffiliateApply.apply", { program: slug, name: "Anna" }, anna.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    expect(failure(await rpc("AffiliatePortal.dashboard", undefined, anna.cookie))).toMatchObject({
      _tag: "NotAffiliate"
    })
    expect(failure(await rpc("Affiliates.list", {}, anna.cookie))).toMatchObject({ _tag: "NoWorkspace" })
    await relay(store.workspace)
    expect((await outboxOf(store.workspace)).some((e) => e.event === "affiliate.applied")).toBe(true)

    // Turned down with a reason, undone, turned down again: they read why, and apply again.
    const pending = ok(await rpc("Affiliates.applications.list", { status: "pending" }, store.cookie))
    expect(pending.rows.map((r) => [r.id, r.name, r.status])).toEqual([[
      applied.applicationId,
      "Anna Jansen",
      "pending"
    ]])
    const rejected = ok(
      await rpc(
        "Affiliates.applications.reject",
        { applicationId: applied.applicationId, reason: "Te klein bereik" },
        store.cookie
      )
    )
    ok(await rpc("Shared.undo", { token: rejected.undo!.token }, store.cookie))
    expect(ok(await rpc("AffiliateApply.me", undefined, anna.cookie))).toMatchObject({ state: "pending" })
    ok(
      await rpc(
        "Affiliates.applications.reject",
        { applicationId: applied.applicationId, reason: "Te klein bereik" },
        store.cookie
      )
    )
    expect(ok(await rpc("AffiliateApply.me", undefined, anna.cookie))).toMatchObject({
      state: "rejected",
      application: { reason: "Te klein bereik" }
    })
    const again = ok(
      await rpc(
        "AffiliateApply.reapply",
        { applicationId: applied.applicationId, audience: "12k volgers" },
        anna.cookie
      )
    )
    expect(again.applicationId).not.toBe(applied.applicationId)

    // Approved with the code proposed from the name; undone and approved again.
    const { code } = ok(await rpc("Affiliates.proposeCode", { name: "Anna Jansen" }, store.cookie))
    expect(code).toBe("ANNA")
    const approvedOnce = ok(
      await rpc(
        "Affiliates.applications.approve",
        { applicationId: again.applicationId, tier: "bronze", code },
        store.cookie
      )
    )
    ok(await rpc("Shared.undo", { token: approvedOnce.undo!.token }, store.cookie))
    expect(failure(await rpc("AffiliatePortal.dashboard", undefined, anna.cookie))).toMatchObject({
      _tag: "NotAffiliate"
    })
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const approved = ok(
      await rpc(
        "Affiliates.applications.approve",
        { applicationId: again.applicationId, tier: "bronze", code },
        store.cookie
      )
    )
    const affiliateId = approved.ids[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      code: "ANNA",
      tier: "bronze",
      discount: "made",
      discountError: null
    })
    const me = ok(await sessionMe(anna.cookie))
    expect(me.landing).toBe("/affiliate/dashboard")
    expect(me.principals).toContainEqual(expect.objectContaining({ kind: "affiliate", id: affiliateId }))
    expect(ok(await rpc("AffiliateApply.me", undefined, anna.cookie))).toMatchObject({
      state: "approved",
      affiliate: { code: "ANNA", tier: "bronze", rate: 10 }
    })
    // The approval reached the portal's notifications once the window had passed.
    expect(ok(await rpc("AffiliatePortal.notifications", undefined, anna.cookie)).rows.length).toBeGreaterThan(0)
  })

  it("keeps the approval when the store has not granted write_discounts, and says so", async () => {
    const store = await importedStore("aff-scope", "noscope")
    const bram = await person("aff-bram")
    const slug = await start(store)
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Bram Visser" }, bram.cookie))
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const approved = ok(
      await rpc("Affiliates.applications.approve", { applicationId, tier: "silver", code: "BRAM" }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(ok(await rpc("Affiliates.get", { affiliateId: approved.ids[0]! }, store.cookie)).affiliate).toMatchObject({
      status: "active",
      discount: "failed",
      discountError: "Insyte mag nog geen kortingscodes maken in deze winkel"
    })
    expect(ok(await rpc("AffiliateApply.me", undefined, bram.cookie))).toMatchObject({ state: "approved" })
  })

  it("redirects a click to the store's own page with insyte_ref, attributes by link and by code, and follows returns", async () => {
    const store = await importedStore("aff-flow")
    const cas = await affiliateOf(store, "aff-cas", "Cas de Boer", "CAS")
    const affiliateId = cas.affiliateId

    // A link to the front page, with Undo.
    expect(ok(await rpc("AffiliatePortal.links.destinations", undefined, cas.cookie)).map((d) => d.id)).toContain(
      "home"
    )
    const made = ok(
      await rpc("AffiliatePortal.links.create", {
        label: "Instagram bio",
        destinationId: "home",
        medium: "social",
        campaign: "zomer"
      }, cas.cookie)
    )
    const slug = made.link.url.split("/r/")[1]!
    expect(slug).toMatch(/^[a-z0-9]{10}$/)
    expect(made.link.storefrontUrl).toContain(`insyte_ref=${slug}`)
    // A link to a product of another brand is refused.
    expect(failure(
      await rpc("AffiliatePortal.links.create", {
        label: "x",
        destinationId: "prd_elsewhere",
        medium: "social",
        campaign: "x"
      }, cas.cookie)
    )).toBeDefined()

    // The click: a 302 to the store, its tags and the ref; never anywhere the request names.
    const landed = await click(slug)
    expect(landed.status).toBe(302)
    const location = new URL(landed.headers.get("location")!)
    expect(location.origin).toBe(`https://${store.shop}`)
    expect(location.pathname).toBe("/")
    expect(Object.fromEntries(location.searchParams)).toEqual({
      utm_source: "insyte",
      utm_medium: "social",
      utm_campaign: "zomer",
      insyte_ref: slug
    })
    for (const extra of ["?to=https://evil.example", "?redirect=//evil.example", "/..%2F..%2Fevil"]) {
      const tried = await click(slug, "203.0.113.8", extra)
      if (tried.status === 302) expect(new URL(tried.headers.get("location")!).origin).toBe(`https://${store.shop}`)
      else expect(tried.status).toBe(404)
    }
    for (const unknown of ["zzzzzzzzzz", "evil.example", "..%2F..%2Fx", "a"]) {
      expect((await click(unknown, "203.0.113.9")).status).toBe(404)
    }
    expect(ok(await rpc("AffiliatePortal.links.get", { linkId: made.link.id }, cas.cookie)).link.clicks)
      .toBeGreaterThan(0)

    // #1001 through the link, #1002 with the code, #1003 with a code nobody holds.
    const now = new Date()
    for (
      const [number, query] of [["#1001", { ref: slug }], ["#1002", { code: "cas" }], ["#1003", {
        code: "NIEMAND"
      }]] as const
    ) {
      await dev("order", { workspace: store.workspace, number, placed: "1", ...query })
    }
    await relay(store.workspace)
    const conversions = ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie))
    expect(conversions.rows.map((c) => [c.orderNumber, c.attributedBy, c.linkLabel, c.status]).toSorted()).toEqual([
      ["#1001", "link", "Instagram bio", "pending"],
      ["#1002", "code", null, "pending"]
    ])
    for (const c of conversions.rows) expect(c.commissionMinor).toBe(Math.round((c.amountMinor * 10) / 100))
    // Never the shopper.
    expect(JSON.stringify(conversions)).not.toMatch(/klant\d?@example\.com/)
    // Told again, an order is still one conversion.
    await dev("order", { workspace: store.workspace, number: "#1001", placed: "1", ref: slug })
    await relay(store.workspace)
    expect(ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie)).rows).toHaveLength(2)

    // #1001 delivered now, half refunded inside its window: half its commission goes back, still pending.
    const one = conversions.rows.find((c) => c.orderNumber === "#1001")!
    await dev("order", {
      workspace: store.workspace,
      number: "#1001",
      shipped: now.toISOString(),
      refund: String(Math.floor(one.amountMinor / 2))
    })
    await relay(store.workspace)
    const halved = ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie)).rows.find((c) => c.id === one.id)!
    expect(halved.status).toBe("pending")
    expect(halved.commissionMinor).toBeLessThan(one.commissionMinor)
    // #1002 delivered 20 days ago: past its 14 days, approved at the daily run; a refund after that changes nothing.
    const two = conversions.rows.find((c) => c.orderNumber === "#1002")!
    const longAgo = new Date(now.getTime() - 20 * 86_400_000)
    await dev("order", { workspace: store.workspace, number: "#1002", shipped: longAgo.toISOString() })
    await relay(store.workspace)
    await dev("settle", { workspace: store.workspace })
    await dev("order", { workspace: store.workspace, number: "#1002", refund: "100" })
    await relay(store.workspace)
    await dev("settle", { workspace: store.workspace })
    const approvedTwo = ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie)).rows.find((c) =>
      c.id === two.id
    )!
    expect(approvedTwo).toMatchObject({ status: "approved", commissionMinor: two.commissionMinor })

    // Paused: a new order with the code earns nothing.
    ok(await rpc("Affiliates.setPaused", { affiliateId, paused: true }, store.cookie))
    await dev("order", { workspace: store.workspace, number: "#1004", placed: "1", code: "CAS" })
    await relay(store.workspace)
    expect(ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie)).rows).toHaveLength(2)
    ok(await rpc("Affiliates.setPaused", { affiliateId, paused: false }, store.cookie))

    // Archived, the link sends nobody anywhere and earns nothing.
    ok(await rpc("AffiliatePortal.links.archive", { linkId: made.link.id }, cas.cookie))
    expect((await click(slug, "203.0.113.10")).status).toBe(404)
    await dev("order", { workspace: store.workspace, number: "#1005", placed: "1", ref: slug })
    await relay(store.workspace)
    expect(ok(await rpc("AffiliatePortal.conversions.list", {}, cas.cookie)).rows).toHaveLength(2)

    // The running month does not close: it "loopt nog".
    const running = await (await dev("close", { workspace: store.workspace, month: month(now) })).json()
    expect(running).toMatchObject({ ended: false, payouts: [] })
    expect(ok(await rpc("Affiliates.payouts.list", { month: month(now) }, store.cookie))).toMatchObject({
      closed: false
    })
  })

  it("closes a month into payouts once, promotes the tier, and approves and pays them with Undo, moving no money", async () => {
    const store = await importedStore("aff-close")
    const dee = await affiliateOf(store, "aff-dee", "Dee Bakker", "DEE")
    const affiliateId = dee.affiliateId

    // Two orders with the code last month, #1001 delivered the day after (past its window by now).
    const now = new Date()
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10))
    const lastMonth = month(last)
    for (const number of ["#1001", "#1002"]) {
      await dev("order", { workspace: store.workspace, number, placed: last.toISOString(), code: "DEE" })
    }
    await relay(store.workspace)
    await dev("order", {
      workspace: store.workspace,
      number: "#1001",
      shipped: new Date(last.getTime() + 86_400_000).toISOString()
    })
    await relay(store.workspace)
    await dev("tiers", { workspace: store.workspace, silver: "1", gold: "99" })

    const closed = await (await dev("close", { workspace: store.workspace, month: lastMonth })).json() as {
      ended: boolean
      payouts: Array<string>
      promoted: Array<{ id: string; to: string }>
    }
    expect(closed.ended).toBe(true)
    expect(closed.payouts).toHaveLength(1)
    // Run again (a retried step), nothing new: no second payout, no second promotion, the same sums.
    const before = ok(await rpc("Affiliates.payouts.list", { month: lastMonth }, store.cookie))
    const twice = await (await dev("close", { workspace: store.workspace, month: lastMonth })).json() as typeof closed
    expect(twice.payouts).toEqual([])
    expect(twice.promoted).toEqual([])
    expect(ok(await rpc("Affiliates.payouts.list", { month: lastMonth }, store.cookie)).lines).toEqual(before.lines)
    expect(before.lines.map((l) => l.payoutId)).toEqual(closed.payouts)

    // Promoted at the close: one approved order in the quarter reaches silver (threshold 1 here).
    expect(closed.promoted).toEqual([expect.objectContaining({ id: affiliateId, to: "silver" })])
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      tier: "silver",
      rate: 12
    })

    const view = ok(await rpc("Affiliates.payouts.list", { month: lastMonth }, store.cookie))
    expect(view.closed).toBe(true)
    const line = view.lines.find((l) => l.affiliateId === affiliateId)!
    expect(line.approvableMinor).toBeGreaterThan(0)
    expect(line.approvableMinor + line.inWindowMinor).toBe(line.totalMinor)

    // Approve with Undo, then for good: the part past its window; the rest rolls on. Then marked paid, with Undo.
    const approval = ok(
      await rpc("Affiliates.approvePayouts", { month: lastMonth, affiliateIds: [affiliateId] }, store.cookie)
    )
    ok(await rpc("Shared.undo", { token: approval.undo!.token }, store.cookie))
    expect(ok(await rpc("Affiliates.payouts.list", { month: lastMonth }, store.cookie)).lines[0]!.status).toBe(
      "approvable"
    )
    ok(await rpc("Affiliates.approvePayouts", { month: lastMonth, affiliateIds: [affiliateId] }, store.cookie))
    expect(
      failure(await rpc("Affiliates.approvePayouts", { month: month(now), affiliateIds: [affiliateId] }, store.cookie))
    )
      .toMatchObject({ _tag: "Conflict" })
    const paid = ok(
      await rpc(
        "Affiliates.markPaid",
        { month: lastMonth, affiliateIds: [affiliateId], reference: "Batch 7" },
        store.cookie
      )
    )
    ok(await rpc("Shared.undo", { token: paid.undo!.token }, store.cookie))
    ok(await rpc("Affiliates.markPaid", { month: lastMonth, affiliateIds: [affiliateId] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const mine = ok(await rpc("AffiliatePortal.payouts.list", undefined, dee.cookie))
    expect(mine.months.find((m) => m.month === lastMonth)).toMatchObject({ status: "paid" })
    expect(ok(await rpc("AffiliatePortal.notifications", undefined, dee.cookie)).rows.length).toBeGreaterThan(0)
  })

  it("keeps the money from a member held to some stores, and seals the affiliate's payment details", async () => {
    const store = await importedStore("aff-fence")
    const slug = await start(store)
    const eva = await person("aff-eva")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Eva Smit" }, eva.cookie))
    const affiliateId = ok(
      await rpc("Affiliates.applications.approve", { applicationId, tier: "bronze", code: "EVA" }, store.cookie)
    ).ids[0]!

    // Payment details: an IBAN checked and sealed; only its hint ever comes back, to her or to the brand.
    const iban = "NL91ABNA0417164300"
    expect(failure(await rpc("AffiliatePortal.payment.update", { method: "bank", account: "NL00 FOUT" }, eva.cookie)))
      .toMatchObject({ _tag: "Invalid" })
    const payment = ok(await rpc("AffiliatePortal.payment.update", { method: "bank", account: iban }, eva.cookie))
    expect(payment.accountHint).toMatch(/4300$/)
    expect(JSON.stringify(payment)).not.toContain(iban)
    expect(JSON.stringify(ok(await rpc("AffiliatePortal.payment", undefined, eva.cookie)))).not.toContain(iban)
    const brandSide = ok(await rpc("Affiliates.get", { affiliateId }, store.cookie))
    expect(brandSide.payment).toMatchObject({ method: "bank" })
    expect(JSON.stringify(brandSide)).not.toContain(iban)
    // Her name she changes; her code and tier are not hers to change.
    expect(ok(await rpc("AffiliatePortal.profile.update", { name: "Eva Smit-de Wit" }, eva.cookie))).toMatchObject({
      name: "Eva Smit-de Wit",
      code: "EVA"
    })

    // A colleague held to another store: no money, no payouts, no programme settings.
    const heldEmail = `aff-held-${run}@invited.test`
    ok(
      await rpc(
        "Invitations.send",
        { rows: [{ email: heldEmail, roleId: "admin", stores: ["sto_elsewhere"] }] },
        store.cookie
      )
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const held = await join(heldEmail)
    const list = ok(await rpc("Affiliates.list", {}, held))
    expect(list.toApproveMinor).toBe(0)
    expect(list.rows.every((r) => r.earnedMinor === 0)).toBe(true)
    expect(ok(await rpc("Affiliates.payouts.list", {}, held)).lines).toEqual([])
    expect(failure(await rpc("Affiliates.program.update", { returnDays: 30 }, held))).toMatchObject({
      _tag: "Invalid",
      fields: { stores: "forbidden" }
    })
    expect(failure(await rpc("Affiliates.approvePayouts", { month: "2026-01", affiliateIds: [affiliateId] }, held)))
      .toBeDefined()
    // Nor how she is paid, nor any change to an affiliate, an application, an invitation or the material.
    expect(ok(await rpc("Affiliates.get", { affiliateId }, held)).payment).toBeNull()
    const other = await person("aff-other")
    const pendingApp = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Olaf" }, other.cookie))
    const forbidden = { _tag: "Invalid", fields: { stores: "forbidden" } }
    for (
      const [name, payload] of [
        ["Affiliates.setTier", { affiliateId, tier: "gold" }],
        ["Affiliates.setPaused", { affiliateId, paused: true }],
        ["Affiliates.setCode", { affiliateId, code: "HELD" }],
        ["Affiliates.retryDiscount", { affiliateId }],
        ["Affiliates.applications.approve", { applicationId: pendingApp.applicationId, tier: "gold", code: "OLAF" }],
        ["Affiliates.applications.reject", { applicationId: pendingApp.applicationId, reason: "x" }],
        ["Affiliates.invite", { email: `aff-held-invite-${run}@example.com`, tier: "gold" }],
        ["Affiliates.resources.remove", { resourceId: "ars_none" }],
        ["Affiliates.erase", { affiliateId }],
        ["Affiliates.conversions.review", { conversionId: "acv_none", accept: true }]
      ] as const
    ) {
      expect([name, failure(await rpc(name as never, payload as never, held))]).toMatchObject([name, forbidden])
    }
    expect(ok(await rpc("Affiliates.conversions.flagged", undefined, held))).toEqual([])
  })

  it("serves the brand's material to its affiliates, to preview or download, and nothing to anyone else", async () => {
    const store = await importedStore("aff-res")
    const slug = await start(store)
    const fien = await person("aff-fien")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Fien Mol" }, fien.cookie))
    ok(await rpc("Affiliates.applications.approve", { applicationId, tier: "bronze", code: "FIEN" }, store.cookie))

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const put = (headers: Record<string, string>, body: BodyInit = png) =>
      call("http://api.test/api/affiliates/resources", {
        method: "PUT",
        headers: {
          cookie: store.cookie,
          "content-type": "image/png",
          "x-file-name": "logo.png",
          "x-resource-title": "Logo",
          "x-resource-kind": "logo",
          ...headers
        },
        body
      })
    expect((await put({ "content-type": "text/html", "x-file-name": "x.html" }, "<script>")).status).toBe(415)
    expect((await put({ "x-resource-kind": "malware" })).status).toBe(422)
    // Sent as a PNG, but not one: its own first bytes decide.
    expect((await put({}, "<html><script>alert(1)</script></html>")).status).toBe(415)
    // Past 25 MB without a length to say so (a chunked body): cut off while it streams.
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) controller.enqueue(png)
        sent += 1
        if (sent > 27) controller.close()
        else controller.enqueue(chunk)
      }
    })
    expect((await put({}, endless)).status).toBe(413)
    const uploaded = await put({})
    expect(uploaded.status).toBe(201)

    const { resources } = ok(await rpc("AffiliatePortal.resources", undefined, fien.cookie))
    expect(resources.map((r) => [r.title, r.kind, r.mime])).toEqual([["Logo", "logo", "image/png"]])
    const preview = await call(`http://api.test${resources[0]!.path}`, { headers: { cookie: fien.cookie } })
    expect(preview.status).toBe(200)
    expect(preview.headers.get("content-disposition")).toMatch(/^inline/)
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png)
    const download = await call(`http://api.test${resources[0]!.path}?download=1`, { headers: { cookie: fien.cookie } })
    expect(download.headers.get("content-disposition")).toMatch(/^attachment/)
    // Someone who is not its affiliate, or nobody signed in, gets nothing.
    const stranger = await person("aff-stranger")
    expect((await call(`http://api.test${resources[0]!.path}`, { headers: { cookie: stranger.cookie } })).status).toBe(
      404
    )
    expect((await call(`http://api.test${resources[0]!.path}`)).status).toBe(401)
  })

  it("rate-limits the clicks of one address", async () => {
    let last = 0
    for (let i = 0; i < 61; i++) last = (await click("yyyyyyyyyy", "198.51.100.23")).status
    expect(last).toBe(429)
  })

  it("keys an IPv4 address mapped into IPv6 as the IPv4 address", async () => {
    for (let i = 0; i < 60; i++) await click("wwwwwwwwww", "::ffff:198.51.100.77")
    expect((await click("wwwwwwwwww", "198.51.100.77")).status).toBe(429)
  })

  it("settles only the code a step made, and ends a discount Shopify made for a code changed under it", async () => {
    const store = await importedStore("aff-race")
    const slug = await start(store)
    const lea = await person("aff-lea")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Lea" }, lea.cookie))
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const before = holdRecordedDiscount(store.shop, "LEAOUD")
    const after = holdRecordedDiscount(store.shop, "LEANIEUW")
    const affiliateId = ok(
      await rpc("Affiliates.applications.approve", { applicationId, tier: "bronze", code: "LEAOUD" }, store.cookie)
    ).ids[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    // The step has read LEAOUD and is making it when the brand changes the code; the new code's step starts too.
    await before.reached
    ok(await rpc("Affiliates.setCode", { affiliateId, code: "LEANIEUW" }, store.cookie))
    await relay(store.workspace)
    await after.reached
    // The old code's step ends first: Shopify made LEAOUD, but it is not Lea's code any more.
    before.release()
    await until(async () =>
      recordedDiscount(store.shop, "LEAOUD")?.ended === true ||
      ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate.discount === "made"
    )
    after.release()
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(recordedDiscount(store.shop, "LEAOUD")).toMatchObject({ ended: true })
    expect(recordedDiscount(store.shop, "LEANIEUW")).toMatchObject({ ended: false })
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      code: "LEANIEUW",
      discount: "made"
    })
    // Erasing her now ends the discount Insyte holds for her, the new one: so it held the new one's id.
    ok(await rpc("Affiliates.erase", { affiliateId }, store.cookie))
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(recordedDiscount(store.shop, "LEANIEUW")).toMatchObject({ ended: true })
  })

  it("refuses a code another affiliate still has, ended or not, with a clear error", async () => {
    const store = await importedStore("aff-codes")
    const slug = await start(store)
    const [mo, noor] = [await person("aff-mo"), await person("aff-noor")]
    const moApp = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Mo" }, mo.cookie))
    const noorApp = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Noor" }, noor.cookie))
    const moId = ok(
      await rpc("Affiliates.applications.approve", {
        applicationId: moApp.applicationId,
        tier: "bronze",
        code: "ALPHA"
      }, store.cookie)
    ).ids[0]!
    // Mo's code changes: ALPHA has ended, and stays his for 90 days (a shopper may still hold it).
    ok(await rpc("Affiliates.setCode", { affiliateId: moId, code: "ALPHA2" }, store.cookie))
    const taken = { _tag: "Invalid", fields: { code: "taken" } }
    expect(
      failure(
        await rpc("Affiliates.applications.approve", {
          applicationId: noorApp.applicationId,
          tier: "bronze",
          code: "ALPHA"
        }, store.cookie)
      )
    ).toMatchObject(taken)
    const noorId = ok(
      await rpc("Affiliates.applications.approve", {
        applicationId: noorApp.applicationId,
        tier: "bronze",
        code: "BETA"
      }, store.cookie)
    ).ids[0]!
    expect(failure(await rpc("Affiliates.setCode", { affiliateId: noorId, code: "ALPHA" }, store.cookie)))
      .toMatchObject(taken)
    expect(ok(await rpc("Affiliates.get", { affiliateId: noorId }, store.cookie)).affiliate.code).toBe("BETA")
    // His own again, though: it was his.
    ok(await rpc("Affiliates.setCode", { affiliateId: moId, code: "ALPHA" }, store.cookie))
    expect(ok(await rpc("Affiliates.get", { affiliateId: moId }, store.cookie)).affiliate.code).toBe("ALPHA")
  })

  it("never takes a brand's discount for an affiliate's by a name the affiliate chose", async () => {
    const store = await importedStore("aff-title")
    // The brand's own discount, titled as Insyte's once were: "Affiliate <name> (<code>)".
    seedRecordedDiscount(store.shop, "ZOMER25", "Affiliate Pim (ZOMER25)")
    const slug = await start(store)
    const pim = await person("aff-pim")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Pim" }, pim.cookie))
    const affiliateId = await approveMade(store, applicationId, "ZOMER25")
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      discount: "failed",
      discountError: "Code bestaat al in Shopify"
    })
    // What Insyte makes is known by the affiliate's id, which nobody picks, and names nobody.
    {
      await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
      ok(await rpc("Affiliates.setCode", { affiliateId, code: "PIM" }, store.cookie))
      await relay(store.workspace)
      for (const instance of await writes.get()) await instance.waitForStatus("complete")
    }
    expect(recordedDiscount(store.shop, "PIM")!.title).toBe(`Insyte affiliate PIM (${affiliateId})`)
  })

  it("rate-limits an IPv6 /64 however its addresses are written", async () => {
    for (let i = 0; i < 60; i++) await click("xxxxxxxxxx", "2001:db8:7::1")
    expect((await click("xxxxxxxxxx", "2001:db8:7:0:abcd::2")).status).toBe(429)
  })

  it("has no programme until the brand starts one: no page, no conversions, and a read starts nothing", async () => {
    const store = await importedStore("aff-none")
    expect(ok(await rpc("Affiliates.payouts.list", {}, store.cookie)).lines).toEqual([])
    await dev("order", { workspace: store.workspace, number: "#1001", placed: "1", code: "IEMAND" })
    await relay(store.workspace)
    await dev("settle", { workspace: store.workspace })
    expect(ok(await rpc("Affiliates.program", undefined, store.cookie))).toMatchObject({ started: false })
    expect(ok(await rpc("Affiliates.inviteLink", undefined, store.cookie)).url).toBe("")
  })

  it("never lets an affiliate's code take one the store already has in Shopify", async () => {
    const store = await importedStore("aff-taken")
    // The brand's own code, made in Shopify's admin long before.
    seedRecordedDiscount(store.shop, "WELKOM10", "Welkomstkorting")
    const slug = await start(store)
    const gina = await person("aff-gina")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Gina" }, gina.cookie))
    const affiliateId = await approveMade(store, applicationId, "WELKOM10")
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      code: "WELKOM10",
      discount: "failed",
      discountError: "Code bestaat al in Shopify"
    })
    // A shopper using the brand's code earns Gina nothing.
    await dev("order", { workspace: store.workspace, number: "#1001", placed: "1", code: "WELKOM10" })
    await relay(store.workspace)
    expect(ok(await rpc("AffiliatePortal.conversions.list", {}, gina.cookie)).rows).toEqual([])

    // The brand gives her another; Shopify makes it, and it earns.
    {
      await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
      ok(await rpc("Affiliates.setCode", { affiliateId, code: "GINA" }, store.cookie))
      await relay(store.workspace)
      for (const instance of await writes.get()) await instance.waitForStatus("complete")
    }
    expect(ok(await rpc("Affiliates.get", { affiliateId }, store.cookie)).affiliate).toMatchObject({
      code: "GINA",
      discount: "made"
    })
    expect(failure(await rpc("Affiliates.setCode", { affiliateId, code: "GINA2" }, store.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    await dev("order", { workspace: store.workspace, number: "#1002", placed: "1", code: "GINA" })
    await relay(store.workspace)
    expect(ok(await rpc("AffiliatePortal.conversions.list", {}, gina.cookie)).rows.map((r) => r.orderNumber)).toEqual([
      "#1002"
    ])

    // Taking up an invitation proposes a code of the name and a random part, never the name alone.
    const invited = `welkom10-${run}@invited.test`
    ok(await rpc("Affiliates.invite", { email: invited, name: "WELKOM10", tier: "bronze" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const joined = await join(invited)
    const code = ok(await rpc("AffiliateApply.me", undefined, joined)).affiliate!.code
    expect(code).toMatch(/^WELKOM10[A-Z2-9]{4}$/)
  })

  it("holds an order that looks like the affiliate's own for the brand, without commission", async () => {
    const store = await importedStore("aff-self")
    const hana = await affiliateOf(store, "aff-hana", "Hana", "HANA")
    // Her own address, written otherwise (capitals and a +tag), and later her Shopify customer under another address.
    const [local, domain] = hana.email.split("@") as [string, string]
    await dev("order", {
      workspace: store.workspace,
      number: "#1001",
      placed: "1",
      code: "HANA",
      email: `${local.toUpperCase()}+korting@${domain}`,
      customer: "gid://shopify/Customer/hana"
    })
    await dev("order", {
      workspace: store.workspace,
      number: "#1002",
      placed: "1",
      code: "HANA",
      email: `iemand-anders-${run}@example.com`,
      customer: "gid://shopify/Customer/hana"
    })
    await relay(store.workspace)
    // She sees them waiting, earning nothing yet; the brand sees why.
    const mine = ok(await rpc("AffiliatePortal.conversions.list", {}, hana.cookie)).rows
    expect(mine.map((r) => [r.orderNumber, r.status, r.commissionMinor]).toSorted()).toEqual([
      ["#1001", "pending", 0],
      ["#1002", "pending", 0]
    ])
    const flagged = ok(await rpc("Affiliates.conversions.flagged", undefined, store.cookie))
    expect(flagged.map((f) => [f.orderNumber, f.reason]).toSorted()).toEqual([["#1001", "self"], ["#1002", "self"]])
    expect(JSON.stringify(flagged)).not.toContain("iemand-anders")
    // Accepted, one earns; turned down, the other never does.
    const accept = flagged.find((f) => f.orderNumber === "#1002")!
    const refuse = flagged.find((f) => f.orderNumber === "#1001")!
    ok(await rpc("Affiliates.conversions.review", { conversionId: accept.id, accept: true }, store.cookie))
    ok(await rpc("Affiliates.conversions.review", { conversionId: refuse.id, accept: false }, store.cookie))
    const after = ok(await rpc("AffiliatePortal.conversions.list", {}, hana.cookie)).rows
    expect(after.find((r) => r.orderNumber === "#1002")).toMatchObject({
      status: "pending",
      commissionMinor: accept.commissionMinor
    })
    expect(accept.commissionMinor).toBeGreaterThan(0)
    expect(after.find((r) => r.orderNumber === "#1001")).toMatchObject({ status: "reversed" })
    expect(ok(await rpc("Affiliates.conversions.flagged", undefined, store.cookie))).toEqual([])
  })

  it("purges rejected applications and old clicks, and erases a person on request", async () => {
    const store = await importedStore("aff-keep")
    const ivo = await affiliateOf(store, "aff-ivo", "Ivo", "IVO")
    const slug = await start(store)
    const jet = await person("aff-jet")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Jet" }, jet.cookie))
    ok(await rpc("Affiliates.applications.reject", { applicationId, reason: "Niet passend" }, store.cookie))
    const link = ok(
      await rpc("AffiliatePortal.links.create", {
        label: "Bio",
        destinationId: "home",
        medium: "social",
        campaign: "x"
      }, ivo.cookie)
    ).link
    expect((await click(link.url.split("/r/")[1]!, "203.0.113.40")).status).toBe(302)

    // 181 days on, the rejection is gone; 14 months on, the click too.
    const day = 86_400_000
    await dev("settle", { workspace: store.workspace, at: new Date(Date.now() + 181 * day).toISOString() })
    expect(ok(await rpc("Affiliates.applications.list", {}, store.cookie)).rows.map((r) => r.id)).not.toContain(
      applicationId
    )
    expect(ok(await rpc("AffiliatePortal.links.get", { linkId: link.id }, ivo.cookie)).link.clicks).toBe(1)
    await dev("settle", { workspace: store.workspace, at: new Date(Date.now() + 426 * day).toISOString() })
    expect(ok(await rpc("AffiliatePortal.links.get", { linkId: link.id }, ivo.cookie)).link.clicks).toBe(0)

    // Erased on request: nothing names or reaches him any more; his portal is closed.
    ok(await rpc("AffiliatePortal.payment.update", { method: "bank", account: "NL91ABNA0417164300" }, ivo.cookie))
    {
      await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
      ok(await rpc("Affiliates.erase", { affiliateId: ivo.affiliateId }, store.cookie))
      await relay(store.workspace)
      for (const instance of await writes.get()) await instance.waitForStatus("complete")
    }
    // His discount ends in Shopify too: nothing earns under his code, and its title never named him.
    expect(recordedDiscount(store.shop, "IVO")).toMatchObject({ ended: true })
    expect(recordedDiscount(store.shop, "IVO")!.title).not.toContain("Ivo")
    const erased = ok(await rpc("Affiliates.get", { affiliateId: ivo.affiliateId }, store.cookie))
    expect(erased.affiliate).toMatchObject({ name: "Gewiste affiliate", status: "paused" })
    expect(erased.affiliate.email).toMatch(/@erased\.invalid$/)
    expect(erased.payment).toBeNull()
    expect(failure(await rpc("AffiliatePortal.dashboard", undefined, ivo.cookie))).toMatchObject({
      _tag: "NotAffiliate"
    })
    // Someone who only applied, too.
    const kim = await person("aff-kim")
    const kimApp = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Kim" }, kim.cookie))
    ok(await rpc("Affiliates.erase", { applicationId: kimApp.applicationId }, store.cookie))
    const rows = ok(await rpc("Affiliates.applications.list", {}, store.cookie)).rows
    expect(rows.find((r) => r.id === kimApp.applicationId)).toMatchObject({
      name: "Gewiste aanvrager",
      motivation: null
    })
    expect(JSON.stringify(rows)).not.toContain(kim.email)
  })

  it("keeps a discount Shopify made without naming it, found by its code, so it can be ended later (W13.6)", async () => {
    const store = await importedStore("aff-nameless")
    namelessRecordedDiscount(store.shop, "NINA")
    const nina = await affiliateOf(store, "aff-nina", "Nina", "NINA")
    expect(ok(await rpc("Affiliates.get", { affiliateId: nina.affiliateId }, store.cookie)).affiliate.discount).toBe(
      "made"
    )
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Affiliates.erase", { affiliateId: nina.affiliateId }, store.cookie))
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(recordedDiscount(store.shop, "NINA")).toMatchObject({ ended: true })
  })

  it("ends an erased affiliate's discount once the store is back, never leaving it live (W13.6)", async () => {
    const store = await importedStore("aff-gone")
    const sam = await affiliateOf(store, "aff-sam", "Sam", "SAMGONE")
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    {
      await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
      ok(await rpc("Affiliates.erase", { affiliateId: sam.affiliateId }, store.cookie))
      await relay(store.workspace)
      for (const instance of await writes.get()) await instance.waitForStatus("complete")
    }
    // No store to end it in: Shopify still has it live, and Insyte still knows which one it is.
    expect(recordedDiscount(store.shop, "SAMGONE")).toMatchObject({ ended: false })
    // The store reconnects; the daily settle asks again, and it ends.
    await anotherStore(store, "aff-gone")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    await dev("settle", { workspace: store.workspace })
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(recordedDiscount(store.shop, "SAMGONE")).toMatchObject({ ended: true })
  })

  it("fails only the code the Workflow read when Shopify stays unreachable (W13.6)", async () => {
    const seen: Array<{ text: string; values: ReadonlyArray<unknown> }> = []
    const sql = ((strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => {
      seen.push({ text: strings.join("?"), values })
      return Effect.succeed([])
    }) as unknown as SqlClient.SqlClient
    const db = { scopedFor: <A, E, R>(f: (s: SqlClient.SqlClient) => Effect.Effect<A, E, R>) => f(sql) }
    await Effect.runPromise(
      discountFailed("aff_x", "OLDCODE").pipe(Effect.provideService(Db, db as unknown as Db["Service"]))
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]!.text).toMatch(/and code = \?/)
    expect(seen[0]!.values).toContain("OLDCODE")
  })
})
