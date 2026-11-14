import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, onboarding, rpc, sessionMe } from "./support.ts"

/*
 * A store's first analysis (step 8.5, M6.5), against Shopify's recorded twin: started after the import, the Workflow
 * reads the mirror's orders and product pages and Shopify's countries and policies, and gives the early read. Every
 * prediction stands on a fact read (the policy's 7 to 12 working days, a refund policy without a rule for damage);
 * the watches count the store's own parcels and refund reasons. Starting again finds the same reading. A store whose
 * Shopify cannot be read gets no predictions, not guesses.
 *
 * Made real (M15 step 5): "Klaarzetten" makes the delivery update as a draft automation (never published) and the
 * "Levertijd per land" sheet, once; "Afronden" writes the offline plan into Zelfstandigheid as one version, refuses a
 * locked action at Zelf doen and anything the step does not list, and its undo puts the policy back. With the team's
 * mail in Insyte and enough history, the reading names the finding.
 */

describe("a store's first analysis", () => {
  it("reads the store after its import and gives the early read", async () => {
    const store = await importedStore("analysis")
    expect(ok(await rpc("FirstAnalysis.get", undefined, store.cookie)).state).toBe("none")

    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    expect(ok(await rpc("FirstAnalysis.start", undefined, store.cookie)).state).toBe("reading")
    const [instance] = await workflows.get()
    expect(instance).toBeDefined()
    await instance!.waitForStatus("complete")

    const view = ok(await rpc("FirstAnalysis.get", undefined, store.cookie))
    expect(view).toMatchObject({
      state: "early",
      history: "young",
      store: { products: 3, customers: 3, orders: 5 },
      chosen: null
    })
    expect(view.reads.map((r) => [r.id, r.done])).toEqual([["orders", true], ["products", true], ["policies", true]])
    expect(view.predictions.map((p) => p.read)).toEqual([
      "7 tot 12 werkdagen levertijd",
      "Retourbeleid zonder regel voor beschadigde artikelen"
    ])
    expect(view.predictions[0]).toMatchObject({ prepares: "automation" })
    expect(view.watch.map((w) => [w.label, w.have, w.need])).toEqual([
      ["Levertijd per land", 1, 30],
      ["Retourredenen", 1, 10]
    ])
    expect(view.prepared.automation.title).toBe("Levertijd-update op dag 5")

    // Asked again, the same analysis: no second reading.
    expect(ok(await rpc("FirstAnalysis.start", undefined, store.cookie)).state).toBe("early")
    expect(await workflows.get()).toHaveLength(1)

    const chosen = ok(
      await rpc("FirstAnalysis.prepare", {
        ids: ["automation", "agent"],
        answers: { fulfilment: "many", reply: "auto" }
      }, store.cookie)
    )
    expect(chosen.chosen).toEqual({
      ids: ["automation", "agent"],
      answers: { fulfilment: "many", reply: "auto" }
    })

    // The update is a draft in Automatiseringen, on the store's day; nothing published, nothing switched on.
    const automationId = chosen.made.automationId!
    expect(chosen.made.sheetId).toBeNull()
    const draft = ok(await rpc("Automations.get", { id: automationId }, store.cookie))
    expect(draft.automation).toMatchObject({ name: "Levertijd-update op dag 5", status: "draft", liveVersion: 0 })
    expect(draft.liveNodes).toBeNull()
    expect(draft.automation.nodes.map((n) => n.variantId)).toEqual([
      "trigger.schedule",
      "action.check_eta",
      "action.send_email"
    ])
    expect(draft.automation.nodes[0]!.config).toMatchObject({ records: "orders_open", days: 5 })

    // Again, with the sheet: the draft is not made twice.
    const again = ok(
      await rpc("FirstAnalysis.prepare", {
        ids: ["automation", "agent", "sheet"],
        answers: { fulfilment: "many", reply: "auto" }
      }, store.cookie)
    )
    expect(again.made.automationId).toBe(automationId)
    const sheet = ok(await rpc("Sheets.get", { id: again.made.sheetId! }, store.cookie))
    expect(sheet.title).toBe("Levertijd per land")
    expect(sheet.tabs.map((t) => t.name)).toEqual(["Per land"])
    expect(sheet.tabs[0]!.cells["A1"]).toMatchObject({ v: "Land" })
    expect(ok(await rpc("Automations.list", {}, store.cookie)).rows.filter((r) => r.id === automationId)).toHaveLength(
      1
    )

    // The offline plan is agreed on the offline step only: before it, refused.
    const start = ok(await rpc("Autonomy.get", {}, store.cookie))
    const plan = (levels: Record<string, "auto" | "ask">, baseVersion: number) =>
      rpc("FirstAnalysis.agreeOffline", { window: "late", levels, baseVersion }, store.cookie)
    expect(failure(await plan({ SendReply: "auto" }, start.version))).toMatchObject({ _tag: "OfflineClosed" })
    ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, store.cookie))
    ok(await onboarding.advance({ step: "store", choice: "connected" }, store.cookie))
    ok(await onboarding.advance({ step: "sync" }, store.cookie))
    expect(ok(await onboarding.advance({ step: "analysis" }, store.cookie)).step).toBe("offline")

    // Refused for a locked action at Zelf doen, and for what the step does not list.
    expect(failure(await plan({ RefundOrder: "auto" }, start.version))).toMatchObject({
      _tag: "AutonomyLocked",
      id: "RefundOrder"
    })
    expect(failure(await plan({ AddNote: "auto" }, start.version))).toMatchObject({ _tag: "Invalid" })

    // Someone saves Zelfstandigheid while the step is open: the plan made on what it showed is refused, not laid over.
    ok(await rpc("Autonomy.set", { levels: { AddNote: "auto" }, baseVersion: start.version }, store.cookie))
    const levels = {
      ForwardOrder: "auto",
      ApplyLabel: "auto",
      SendReply: "auto",
      ApproveReturn: "ask",
      RefundOrder: "ask"
    } as const
    expect(failure(await plan(levels, start.version))).toMatchObject({ _tag: "AutonomyStale" })
    const before = ok(await rpc("Autonomy.get", {}, store.cookie))
    expect(before.levels.AddNote).toBe("auto")

    const agreed = ok(await plan(levels, before.version))
    expect(agreed.analysis.offline).toMatchObject({
      window: "late",
      levels: { ForwardOrder: "auto", SendReply: "auto", RefundOrder: "ask" },
      version: before.version + 1
    })
    expect(agreed.analysis.offline!.hours.filter((d) => d.open)).toHaveLength(6)
    const after = ok(await rpc("Autonomy.get", {}, store.cookie))
    expect(after.version).toBe(before.version + 1)
    expect(after.levels).toMatchObject({
      ForwardOrder: "auto",
      ApplyLabel: "auto",
      SendReply: "auto",
      RefundOrder: "ask",
      AddNote: "auto"
    })
    expect(after.history[0]!.changes.map((c) => c.id).toSorted()).toEqual(["ApplyLabel", "ForwardOrder", "SendReply"])

    // Undone like any save on Zelfstandigheid: the previous levels again, as a version of their own.
    ok(await rpc("Shared.undo", { token: agreed.undo!.token }, store.cookie))
    const undone = ok(await rpc("Autonomy.get", {}, store.cookie))
    expect(undone.version).toBe(before.version + 2)
    expect(undone.levels).toEqual(before.levels)
  })

  it("drops forwarding from the plan of a store that ships itself", async () => {
    const store = await importedStore("analysis-self")
    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    ok(await rpc("FirstAnalysis.start", undefined, store.cookie))
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    ok(await rpc("FirstAnalysis.prepare", { ids: [], answers: { fulfilment: "self", reply: "ask" } }, store.cookie))
    ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, store.cookie))
    ok(await onboarding.advance({ step: "store", choice: "connected" }, store.cookie))
    ok(await onboarding.advance({ step: "sync" }, store.cookie))
    ok(await onboarding.advance({ step: "analysis" }, store.cookie))
    const policy = ok(await rpc("Autonomy.get", {}, store.cookie))
    const agreed = ok(
      await rpc("FirstAnalysis.agreeOffline", {
        window: "evening",
        levels: { ForwardOrder: "auto", ApplyLabel: "auto" },
        baseVersion: policy.version
      }, store.cookie)
    )
    expect(agreed.analysis.offline!.levels).toEqual({ ApplyLabel: "auto" })
    expect(ok(await rpc("Autonomy.get", {}, store.cookie)).levels.ForwardOrder).toBe(policy.levels.ForwardOrder)
  })

  it("shows no analysis to someone held to another store, and lets them prepare none", async () => {
    const a = await importedStore("analysis-fence")
    // The newest store is the one the analysis reads: B.
    const b = (await anotherStore(a, "analysis-fence-b")).storeId
    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    ok(await rpc("FirstAnalysis.start", undefined, a.cookie))
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    expect(ok(await rpc("FirstAnalysis.get", undefined, a.cookie)).state).toBe("early")

    const email = `analysis-${run}-fence@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: [a.storeId] }] }, a.cookie))
    await pastUndo(a.workspace)
    await relay(a.workspace)
    const held = await join(email)
    expect(b).not.toBe(a.storeId)
    const theirs = ok(await rpc("FirstAnalysis.get", undefined, held))
    expect(theirs).toMatchObject({ state: "none", finding: null, predictions: [], watch: [] })
    expect(theirs.store).toEqual({ products: 0, customers: 0, orders: 0, days: 0, mails: 0 })
    expect(
      failure(
        await rpc("FirstAnalysis.prepare", { ids: ["automation"], answers: { fulfilment: "one", reply: "ask" } }, held)
      )
    ).toMatchObject({ _tag: "AnalysisNotReady" })
    expect(ok(await rpc("FirstAnalysis.start", undefined, held)).state).toBe("none")
  })

  it("says nothing it could not read for a store Shopify does not answer for", async () => {
    const owner = await person("analysis-seed", "Analysis Seed B.V.")
    // The recorded store without credentials: the mirror reads, Shopify's countries and policies do not.
    expect(
      (await call("http://api.test/api/__dev/stores/seed", { method: "POST", headers: { cookie: owner.cookie } }))
        .status
    ).toBe(200)
    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    ok(await rpc("FirstAnalysis.start", undefined, owner.cookie))
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    const view = ok(await rpc("FirstAnalysis.get", undefined, owner.cookie))
    expect(view.state).toBe("early")
    expect(view.predictions).toEqual([])
    expect(view.watch.map((w) => w.have)).toEqual([1, 1])
  })

  it("names the finding from the team's mail and the store's own orders", async () => {
    const owner = await person("analysis-mail", "Analysis Mail B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seeded = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    const { storeId } = await seeded.json() as { storeId: string }
    const box = ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: "support@analysis-mail.nl", label: "Mail" },
        owner.cookie
      )
    )

    // A quarter's history: a hundred orders to the US over forty days, none delivered yet.
    const day = 86_400_000
    const email = (i: number) => `klant${i}-${run}@voorbeeld.nl`
    const orders = Array.from({ length: 100 }, (_, i) => {
      const placed = new Date(Date.now() - (5 + (i % 36)) * day).toISOString()
      return {
        shopify_id: `gid://shopify/Order/fa${i}`,
        number: `#FA${i}`,
        customer_shopify_id: null,
        customer_name: "Klant",
        customer_email: email(i),
        status: "paid",
        payment_status: "paid",
        fulfillment_status: "fulfilled",
        total_minor: 4000,
        subtotal_minor: 4000,
        shipping_minor: 0,
        tax_minor: 0,
        discounts_minor: 0,
        currency: "EUR",
        payment_gateway: null,
        card_last4: null,
        shipping_address: { country: "US" },
        tags: [],
        note: null,
        channel: "web",
        referral_code: null,
        placed_at: placed,
        paid_at: placed,
        shipped_at: placed,
        cancelled_at: null,
        refunded_at: null,
        external_updated_at: placed,
        raw: {}
      }
    })
    const written = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${storeId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch: { orders } })
    })
    expect(written.status).toBe(200)

    // Forty conversations of the store's customers: thirty ask where their order is, ten ask something else. Three
    // more are no customer's: a system sender, someone who never ordered here, and the team's own mailbox.
    const senders = [
      ...Array.from({ length: 40 }, (_, i) => email(i)),
      "noreply@meldingen.voorbeeld.nl",
      `vreemde-${run}@elders.nl`,
      "support@analysis-mail.nl"
    ]
    for (const [i, sender] of senders.entries()) {
      const raw = [
        `From: <${sender}>`,
        "To: <support@analysis-mail.nl>",
        `Subject: ${i < 30 || i >= 40 ? "Waar is mijn bestelling?" : "Vraag over de maat"}`,
        `Message-ID: <fa-${i}-${run}@voorbeeld.nl>`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        i < 30 || i >= 40 ? "Hoi, mijn pakket is nog niet binnen." : "Valt deze jas klein?"
      ].join("\r\n")
      const delivered = await call("http://api.test/api/__dev/mail/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: box.forwardingAddress, raw })
      })
      expect(delivered.status).toBe(200)
    }

    await using workflows = await introspectWorkflow(env.FIRST_ANALYSIS)
    expect(ok(await rpc("FirstAnalysis.start", undefined, owner.cookie)).reads.map((r) => r.id)).toEqual([
      "orders",
      "mail",
      "products",
      "policies"
    ])
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    const view = ok(await rpc("FirstAnalysis.get", undefined, owner.cookie))
    expect(view.state).toBe("found")
    expect(view.store.mails).toBe(40)
    expect(view.predictions).toEqual([])
    // Nothing is delivered yet: an order counts as still on its way for a month, so the five placed 31 to 34 days
    // before their mail do not count as asked early (25 of 30, ~25 of the 30 status mails spared).
    expect(view.finding).toMatchObject({
      headline: "Meer dan de helft van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        { figure: "30 van 40", basis: "Inbox, laatste 90 dagen" },
        { figure: "83%", basis: "Moment van de mail naast de bezorgdatum" }
      ],
      effect: { figure: "~25 mails minder per kwartaal" }
    })
  })

  it("has nothing to prepare before there is a reading", async () => {
    const owner = await person("analysis-none", "Analysis None B.V.")
    expect(ok(await rpc("FirstAnalysis.start", undefined, owner.cookie)).state).toBe("none")
    expect(
      failure(
        await rpc(
          "FirstAnalysis.prepare",
          { ids: ["agent"], answers: { fulfilment: "one", reply: "ask" } },
          owner.cookie
        )
      )
    ).toMatchObject({ _tag: "AnalysisNotReady" })
  })
})
