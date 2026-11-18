import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The affiliate programme (M16 steps 3–5). A person applies on the brand's page and waits; the brand turns them down
 * with a reason, they apply again, and the brand approves them with a code that becomes a Shopify discount once the
 * undo window has passed. As an affiliate they make a link; a click goes through `/r/:slug` to the store's own page
 * with `insyte_ref`, never elsewhere. Orders through the link or with the code become conversions (never naming the
 * shopper); a refund inside the return window takes its share back, one after it changes nothing. The month's close
 * makes payouts (the running month has none), promotes the tier, and the brand approves and marks them paid, each with
 * Undo; no money moves. A member held to some stores sees no money and approves nothing.
 */

const dev = (path: string, query: Record<string, string>) =>
  call(`http://api.test/api/__dev/affiliates/${path}?${new URLSearchParams(query)}`, { method: "POST" })

const month = (at: Date) => at.toISOString().slice(0, 7)

const click = (slug: string, ip = "203.0.113.7", extra = "") =>
  call(`http://api.public.test/r/${slug}${extra}`, { redirect: "manual", headers: { "cf-connecting-ip": ip } })

describe("the affiliate programme", () => {
  it("takes an application, a rejection and a new one, and an approval with its Shopify discount", async () => {
    const store = await importedStore("aff")
    const program = ok(await rpc("Affiliates.program", undefined, store.cookie))
    expect(program).toMatchObject({ enabled: true, returnDays: 14, payoutDay: 15, storeConnected: true })
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
    const slug = ok(await rpc("Affiliates.program", undefined, store.cookie)).applyPath.split("/").pop()!
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
    const slugOfProgram = ok(await rpc("Affiliates.program", undefined, store.cookie)).applyPath.split("/").pop()!
    const cas = await person("aff-cas")
    const { applicationId } = ok(
      await rpc("AffiliateApply.apply", { program: slugOfProgram, name: "Cas de Boer" }, cas.cookie)
    )
    const affiliateId = ok(
      await rpc("Affiliates.applications.approve", { applicationId, tier: "bronze", code: "CAS" }, store.cookie)
    ).ids[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)

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

    // The running month does not close: it "loopt nog".
    const running = await (await dev("close", { workspace: store.workspace, month: month(now) })).json()
    expect(running).toMatchObject({ ended: false, payouts: [] })
    expect(ok(await rpc("Affiliates.payouts.list", { month: month(now) }, store.cookie))).toMatchObject({
      closed: false
    })
  })

  it("closes a month into payouts once, promotes the tier, and approves and pays them with Undo, moving no money", async () => {
    const store = await importedStore("aff-close")
    const slug = ok(await rpc("Affiliates.program", undefined, store.cookie)).applyPath.split("/").pop()!
    const dee = await person("aff-dee")
    const { applicationId } = ok(await rpc("AffiliateApply.apply", { program: slug, name: "Dee Bakker" }, dee.cookie))
    const affiliateId = ok(
      await rpc("Affiliates.applications.approve", { applicationId, tier: "bronze", code: "DEE" }, store.cookie)
    ).ids[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)

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
    const slug = ok(await rpc("Affiliates.program", undefined, store.cookie)).applyPath.split("/").pop()!
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
  })

  it("serves the brand's material to its affiliates, to preview or download, and nothing to anyone else", async () => {
    const store = await importedStore("aff-res")
    const slug = ok(await rpc("Affiliates.program", undefined, store.cookie)).applyPath.split("/").pop()!
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
})
