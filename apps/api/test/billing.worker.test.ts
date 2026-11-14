import { testSignature } from "@insyte/integrations-stripe/Sdk"
import { describe, expect, it } from "vitest"
import { failure, ok, outboxOf, person, productEventsOf, relay } from "./journeys.ts"
import { call, onboarding, rpc, rpcWith, sessionMe } from "./support.ts"

/*
 * Facturatie (M13 step 1), against Stripe's fake (`BILLING_ADAPTER=fake`) and a signing secret made up for the tests.
 * A trial's first paid action subscribes and is counted; seats are bought and given up with the prorated amount
 * previewed first, and the team's seats follow; Stripe's signed webhooks keep the cache right, once per event, read
 * again from "Stripe" and never rolled back by an older one; only people change billing, never a key or an agent; and
 * one workspace never reads or changes another's billing.
 */

const SECRET = "whsec_test_insyte_worker_tests"

const stripe = async (event: unknown, signature?: string) => {
  const body = JSON.stringify(event)
  return call("http://api.public.test/hooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature ?? await testSignature(SECRET, body)
    },
    body
  })
}

const price = (plan: string, interval: "month" | "year", amount: number) => ({
  id: `price_fake_${plan}_${interval === "month" ? "monthly" : "annual"}`,
  active: true,
  currency: "eur",
  unit_amount: amount,
  recurring: { interval },
  metadata: { insyte_plan: plan }
})

/** A `customer.subscription.updated` (or another `type`) as Stripe sends it, at Stripe's `created` time. */
const subscriptionEvent = (
  id: string,
  workspace: string,
  created: number,
  fields: { status: string; seats: number; plan?: string; sub?: string; type?: string; metadata?: boolean }
) => ({
  id,
  object: "event",
  type: fields.type ?? "customer.subscription.updated",
  created,
  data: {
    object: {
      id: fields.sub ?? `sub_fake_${workspace}`,
      object: "subscription",
      customer: `cus_fake_${workspace}`,
      status: fields.status,
      currency: "eur",
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: fields.metadata === false ? {} : { insyte_workspace: workspace },
      items: {
        data: [
          {
            id: "si_base",
            quantity: 1,
            current_period_end: created + 30 * 86_400,
            price: price(fields.plan ?? "growth", "month", 29_900)
          },
          ...(fields.seats > 0
            ? [{
              id: "si_seat",
              quantity: fields.seats,
              current_period_end: created + 30 * 86_400,
              price: price("seat", "month", 1_900)
            }]
            : [])
        ]
      }
    }
  }
})

const invoiceEvent = (id: string, workspace: string, created: number, status: "paid" | "open" = "paid") => ({
  id,
  object: "event",
  type: status === "paid" ? "invoice.paid" : "invoice.finalized",
  created,
  data: {
    object: {
      id: `in_hook_${workspace}`,
      object: "invoice",
      customer: `cus_fake_${workspace}`,
      number: "INS-0002",
      status,
      total: 35_600,
      currency: "eur",
      created,
      status_transitions: { finalized_at: created },
      hosted_invoice_url: "https://invoice.stripe.test/hosted",
      invoice_pdf: "https://invoice.stripe.test/in_hook.pdf"
    }
  }
})

/** Stripe's Checkout page a change answered with. */
const page = (exit: Awaited<ReturnType<typeof rpc<"Billing.changePlan">>>) => {
  const value = ok(exit)
  expect(value._tag).toBe("checkout")
  return value._tag === "checkout" ? value.url : ""
}

const now = () => Math.floor(Date.now() / 1000)

const founder = async (tag: string) => {
  const owner = await person(`billing-${tag}`, `Facturatie ${tag} B.V.`)
  ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, owner.cookie))
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  return { ...owner, workspace }
}

describe("billing", () => {
  it("subscribes a trial, buys and gives up seats at the previewed price, and the team's seats follow", async () => {
    const owner = await founder("flow")

    const trial = ok(await rpc("Billing.get", undefined, owner.cookie))
    expect(trial).toMatchObject({
      configured: true,
      plan: "growth",
      status: "trial",
      card: null,
      seats: { included: 6, extra: 0, total: 6, used: 1 }
    })
    expect(trial.trialEndsAt).toBeGreaterThan(Date.now())

    // The prices are Stripe's (here the fake's fixtures); what a plan includes is Insyte's.
    const plans = ok(await rpc("Billing.plans", undefined, owner.cookie))
    expect(plans.currency).toBe("eur")
    expect(plans.plans.find((p) => p.plan === "growth")).toMatchObject({ seats: 6, stores: 3, monthlyMinor: 29_900 })

    // Nothing paid yet: the first period, paid on Stripe's page (the fake pays at once).
    const first = ok(
      await rpc("Billing.previewChange", { _tag: "plan", plan: "growth", cycle: "monthly" }, owner.cookie)
    )
    expect(first).toMatchObject({ kind: "checkout", amountDueMinor: 29_900, prorationMinor: 0 })
    // There are no bought seats to give up on a trial.
    expect(failure(await rpc("Billing.removeSeats", { n: 1 }, owner.cookie))).toMatchObject({
      _tag: "NoExtraSeats",
      extra: 0
    })
    const paid = ok(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))
    expect(paid._tag).toBe("changed")
    const active = paid._tag === "changed" ? paid.overview : undefined
    expect(active).toMatchObject({ status: "active", plan: "growth", card: { brand: "Visa", last4: "4242" } })
    expect(active!.currentPeriodEnd).toBeGreaterThan(Date.now())
    const invoices = ok(await rpc("Billing.invoices", {}, owner.cookie)).rows
    expect(invoices).toMatchObject([{ status: "paid", amountMinor: 29_900, currency: "eur" }])
    expect(ok(await rpc("Billing.invoiceUrl", { id: invoices[0]!.id }, owner.cookie)).url).toMatch(/^https:\/\//)

    // The trial turned into a paid subscription: told, and counted once.
    await relay(owner.workspace)
    expect((await productEventsOf(owner.workspace)).filter((e) => e.event === "subscription_started")).toHaveLength(1)

    // Two seats: previewed, prorated for the rest of the period, then bought at that preview's second.
    const preview = ok(await rpc("Billing.previewChange", { _tag: "seats", delta: 2 }, owner.cookie))
    expect(preview.kind).toBe("change")
    expect(preview.prorationMinor).toBeGreaterThan(0)
    expect(preview.prorationMinor).toBeLessThanOrEqual(2 * 1_900)
    expect(preview.nextInvoiceMinor).toBe(29_900 + 2 * 1_900 + preview.prorationMinor)
    const bought = ok(await rpc("Billing.addSeats", { n: 2, prorationDate: preview.prorationDate }, owner.cookie))
    expect(bought._tag === "changed" && bought.overview.seats).toMatchObject({ included: 6, extra: 2, total: 8 })
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).seats).toMatchObject({ total: 8, extra: 2, used: 1 })

    // More than were bought cannot be given up; one can, and the seats go with it.
    expect(failure(await rpc("Billing.removeSeats", { n: 3 }, owner.cookie))).toMatchObject({
      _tag: "NoExtraSeats",
      extra: 2
    })
    ok(await rpc("Billing.removeSeats", { n: 1 }, owner.cookie))
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).seats).toMatchObject({ total: 7, extra: 1 })

    // Another plan: previewed against the subscription, then made; the workspace's plan follows.
    expect(ok(await rpc("Billing.previewChange", { _tag: "plan", plan: "scale", cycle: "monthly" }, owner.cookie)))
      .toMatchObject({ kind: "change" })
    const scaled = ok(await rpc("Billing.changePlan", { plan: "scale", cycle: "monthly" }, owner.cookie))
    expect(scaled._tag === "changed" && scaled.overview).toMatchObject({
      plan: "scale",
      seats: { included: 12, extra: 1 }
    })

    // Another cycle starts a new period now: invoiced at once, less what is left of this one.
    const annual = ok(
      await rpc("Billing.previewChange", { _tag: "plan", plan: "scale", cycle: "annual" }, owner.cookie)
    )
    expect(annual).toMatchObject({ kind: "change", immediate: true })
    expect(annual.amountDueMinor).toBe(annual.nextInvoiceMinor)
    expect(ok(await rpc("Billing.previewChange", { _tag: "seats", delta: 1 }, owner.cookie)).immediate).toBe(false)

    // Opzeggen and hervatten: until the end of the period, then not after all.
    const cancelled = ok(await rpc("Billing.cancel", { reason: "too_expensive" }, owner.cookie))
    expect(cancelled.cancelAt).toBe(cancelled.currentPeriodEnd)
    expect(ok(await rpc("Billing.resume", undefined, owner.cookie)).cancelAt).toBeNull()
    expect(ok(await rpc("Billing.portalSession", undefined, owner.cookie)).url).toMatch(/\/settings\/billing$/)

    // Each change was audited and told.
    const told = (await outboxOf(owner.workspace)).filter((e) => e.event === "billing.changed")
    expect(told.map((e) => e.payload["started"])).toEqual([true, false, false, false, false, false])
  })

  it("applies Stripe's signed webhooks once, never rolls back to an older one, and refuses a forged one", async () => {
    const owner = await founder("hooks")
    ok(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))
    const ws = owner.workspace
    const later = now() + 5

    // Unsigned, forged, or signed long ago: refused, and nothing changes.
    const event = subscriptionEvent(`evt_${ws}_1`, ws, later, { status: "past_due", seats: 3 })
    expect((await stripe(event, "t=1,v1=00")).status).toBe(400)
    expect((await stripe(event, "")).status).toBe(400)
    const body = JSON.stringify(event)
    expect((await stripe(event, await testSignature(SECRET, body, new Date(Date.now() - 3_600_000)))).status).toBe(400)
    // Signed just now, but not with this secret's HMAC.
    expect((await stripe(event, `t=${now()},v1=${"0".repeat(64)}`)).status).toBe(400)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).status).toBe("active")

    // Signed: the subscription as Stripe says it, its seats the team's.
    const before = (await outboxOf(ws)).filter((e) => e.event === "billing.changed").length
    expect((await stripe(event)).status).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie))).toMatchObject({
      status: "past_due",
      seats: { extra: 3, total: 9 }
    })
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).seats.total).toBe(9)
    // The same event again: acknowledged, applied once.
    expect((await stripe(event)).status).toBe(200)
    expect((await outboxOf(ws)).filter((e) => e.event === "billing.changed")).toHaveLength(before + 1)

    // An older event that arrives late does not roll the row back.
    expect((await stripe(subscriptionEvent(`evt_${ws}_0`, ws, now() - 3_600, { status: "active", seats: 0 }))).status)
      .toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie))).toMatchObject({
      status: "past_due",
      seats: { extra: 3 }
    })

    // An invoice: in the list, newest first, with Stripe's PDF.
    expect((await stripe(invoiceEvent(`evt_${ws}_inv`, ws, later))).status).toBe(200)
    const rows = ok(await rpc("Billing.invoices", {}, owner.cookie)).rows
    expect(rows[0]).toMatchObject({ id: `in_hook_${ws}`, number: "INS-0002", amountMinor: 35_600, status: "paid" })
    expect(ok(await rpc("Billing.invoiceUrl", { id: `in_hook_${ws}` }, owner.cookie)).url).toBe(
      "https://invoice.stripe.test/in_hook.pdf"
    )
    // Stripe's `invoice.finalized` may arrive after `invoice.paid`, even with a later time: a paid invoice stays paid.
    expect((await stripe(invoiceEvent(`evt_${ws}_inv_open`, ws, later + 5, "open"))).status).toBe(200)
    expect(ok(await rpc("Billing.invoices", {}, owner.cookie)).rows[0]).toMatchObject({
      id: `in_hook_${ws}`,
      status: "paid"
    })

    // A customer Insyte does not know, and an event it does not act on: acknowledged, nothing kept.
    expect(
      (await stripe(subscriptionEvent("evt_unknown", "ws_00000000000000000000000000", later, {
        status: "active",
        seats: 0
      }))).status
    ).toBe(200)
    expect(
      (await stripe({
        id: "evt_other",
        object: "event",
        type: "customer.created",
        created: later,
        data: { object: {} }
      })).status
    )
      .toBe(200)
  })

  it("reads Stripe again, keeps the subscription that bills, and picks up one it had not heard of", async () => {
    const owner = await founder("sync")
    ok(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))
    const ws = owner.workspace
    const invoicesBefore = ok(await rpc("Billing.invoices", {}, owner.cookie)).rows.length

    // A newer event, then an older one that arrives after it: Stripe is read again, so the older one's copy is not
    // what is kept, even though the cache was written before it was sent.
    expect((await stripe(subscriptionEvent(`evt_${ws}_new`, ws, now() + 100, { status: "active", seats: 3 }))).status)
      .toBe(200)
    expect((await stripe(subscriptionEvent(`evt_${ws}_old`, ws, now() + 50, { status: "active", seats: 1 }))).status)
      .toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).seats.extra).toBe(3)

    // Another subscription at the same customer, while this one still bills: not taken over, but shown, since the
    // workspace may be paying twice.
    const other = `sub_other_${ws}`
    expect(
      (await stripe(subscriptionEvent(`evt_${ws}_other`, ws, now() + 150, { status: "active", seats: 1, sub: other })))
        .status
    ).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie))).toMatchObject({
      status: "active",
      secondSubscription: true,
      seats: { extra: 3 }
    })

    // The one that billed ends: its plan and bought seats go, and the workspace has Starter's limits until it pays
    // again.
    expect(
      (await stripe(
        subscriptionEvent(`evt_${ws}_deleted`, ws, now() + 200, {
          status: "canceled",
          seats: 3,
          type: "customer.subscription.deleted"
        })
      )).status
    ).toBe(200)
    const lapsed = ok(await rpc("Billing.get", undefined, owner.cookie))
    expect(lapsed).toMatchObject({ status: "canceled", seats: { included: 3, extra: 0, total: 3 } })
    expect(lapsed.usage.stores.max).toBe(1)
    expect(lapsed.usage.aiReplies.max).toBe(1_000)
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).seats).toMatchObject({ extra: 0, total: 3 })

    // The next change finds the other subscription at Stripe and changes it: no second first payment, and the paid
    // start is not counted again.
    const scaled = ok(await rpc("Billing.changePlan", { plan: "scale", cycle: "monthly" }, owner.cookie))
    expect(scaled._tag === "changed" && scaled.overview).toMatchObject({
      status: "active",
      plan: "scale",
      secondSubscription: false,
      seats: { extra: 1 }
    })
    expect(ok(await rpc("Billing.invoices", {}, owner.cookie)).rows).toHaveLength(invoicesBefore)
    await relay(ws)
    expect((await productEventsOf(ws)).filter((e) => e.event === "subscription_started")).toHaveLength(1)
  })

  it("holds Starter's limits while a subscription is not paid for, and the paid plan's again once it is", async () => {
    const owner = await founder("unpaid")
    ok(await rpc("Billing.changePlan", { plan: "scale", cycle: "monthly" }, owner.cookie))
    const ws = owner.workspace
    const event = (id: string, at: number, status: string) =>
      stripe(subscriptionEvent(`evt_${ws}_${id}`, ws, now() + at, { status, seats: 2, plan: "scale" }))
    expect((await event("seats", 10, "active")).status).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).seats).toMatchObject({ included: 12, extra: 2 })

    for (const [at, status] of [[20, "unpaid"], [21, "paused"]] as const) {
      expect((await event(status, at, status)).status).toBe(200)
      const held = ok(await rpc("Billing.get", undefined, owner.cookie))
      expect(held).toMatchObject({ status, seats: { included: 3, extra: 0, total: 3 } })
      expect(held.usage.stores.max).toBe(1)
      expect(ok(await rpc("Team.get", undefined, owner.cookie)).seats.total).toBe(3)
    }

    expect((await event("paid", 30, "active")).status).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).seats).toMatchObject({ included: 12, extra: 2 })
  })

  it("keeps one payable Checkout page per workspace: reused, expired, claimed once, and waited on once paid", async () => {
    const owner = await person("billing-page", "Betaalpagina [betaalpagina] B.V.")
    ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, owner.cookie))
    const ws = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const open = async () =>
      ((await (await call(`http://api.test/api/__dev/billing/checkouts?workspace=${ws}`)).json()) as {
        checkouts: Array<{ id: string; status: string; key: string }>
      }).checkouts.filter((p) => p.status === "open")

    // The first payment is on Stripe's page; the same change again is the same page.
    const growth = page(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))
    expect(page(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))).toBe(growth)
    expect(await open()).toHaveLength(1)

    // Another change: the open page is expired first, so only the new one can be paid.
    const scale = page(await rpc("Billing.changePlan", { plan: "scale", cycle: "monthly" }, owner.cookie))
    expect(scale).not.toBe(growth)
    expect((await open()).map((p) => p.key)).toEqual(["scale-monthly-0"])

    // Two tabs at once, for two plans: however they interleave, one page is left to pay.
    await Promise.all([
      rpc("Billing.changePlan", { plan: "starter", cycle: "monthly" }, owner.cookie),
      rpc("Billing.changePlan", { plan: "growth", cycle: "annual" }, owner.cookie)
    ])
    const [current] = await open()
    expect(await open()).toHaveLength(1)

    // An ended subscription's late webhook does not let go of the page.
    expect(
      (await stripe(
        subscriptionEvent(`evt_${ws}_old_end`, ws, now() + 5, {
          status: "canceled",
          seats: 0,
          sub: `sub_long_gone_${ws}`,
          type: "customer.subscription.deleted"
        })
      )).status
    ).toBe(200)
    const [plan, cycle] = current!.key.split("-") as ["starter" | "growth", "monthly" | "annual"]
    expect(page(await rpc("Billing.changePlan", { plan, cycle }, owner.cookie))).toBe(
      `https://checkout.stripe.test/${current!.id}`
    )

    // Paid on the page, its subscription not heard of yet: the next change waits for it, with no second page.
    const sub = `sub_page_${ws}`
    expect(
      (await stripe({
        id: `evt_${ws}_paid_page`,
        object: "event",
        type: "checkout.session.completed",
        created: now() + 6,
        data: {
          object: {
            id: current!.id,
            object: "checkout.session",
            mode: "subscription",
            customer: `cus_fake_${ws}`,
            subscription: sub,
            client_reference_id: ws
          }
        }
      })).status
    ).toBe(200)
    expect(failure(await rpc("Billing.changePlan", { plan: "scale", cycle: "monthly" }, owner.cookie)))
      .toMatchObject({ _tag: "CheckoutPending" })
    expect(await open()).toHaveLength(0)

    // Its subscription arrives: the workspace is subscribed, and the next change is a change.
    expect(
      (await stripe(
        subscriptionEvent(`evt_${ws}_page_sub`, ws, now() + 7, {
          status: "active",
          seats: 0,
          plan,
          sub,
          type: "customer.subscription.created"
        })
      )).status
    ).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).status).toBe("active")
    expect(ok(await rpc("Billing.changePlan", { plan: "scale", cycle }, owner.cookie))._tag).toBe("changed")
  })

  it("starts the subscription when Stripe's Checkout completes, whatever order its events arrive in", async () => {
    const owner = await founder("checkout")
    const ws = owner.workspace
    const sub = `sub_checkout_${ws}`

    // Stripe's subscription event first, for a customer Insyte has not stored yet and without Insyte's metadata:
    // acknowledged, nothing kept.
    expect(
      (await stripe(
        subscriptionEvent(`evt_${ws}_created`, ws, now() + 5, {
          status: "active",
          seats: 0,
          sub,
          type: "customer.subscription.created",
          metadata: false
        })
      )).status
    ).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).status).toBe("trial")

    // Then Checkout's own event, which names the workspace: the subscription, read from Stripe, is the workspace's.
    expect(
      (await stripe({
        id: `evt_${ws}_checkout`,
        object: "event",
        type: "checkout.session.completed",
        created: now() + 6,
        data: {
          object: {
            id: `cs_${ws}`,
            object: "checkout.session",
            mode: "subscription",
            customer: `cus_fake_${ws}`,
            subscription: sub,
            client_reference_id: ws
          }
        }
      })).status
    ).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, owner.cookie))).toMatchObject({ status: "active", plan: "growth" })
  })

  it("refuses a preview too old to hold, and more seats than may be bought", async () => {
    const owner = await founder("limits")
    ok(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, owner.cookie))
    expect(failure(await rpc("Billing.addSeats", { n: 1, prorationDate: now() - 7_200 }, owner.cookie)))
      .toMatchObject({ _tag: "PreviewExpired" })
    expect(failure(await rpc("Billing.addSeats", { n: 1, prorationDate: now() + 600 }, owner.cookie)))
      .toMatchObject({ _tag: "PreviewExpired" })
    for (let i = 0; i < 10; i++) ok(await rpc("Billing.addSeats", { n: 50 }, owner.cookie))
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).seats.extra).toBe(500)
    expect(failure(await rpc("Billing.previewChange", { _tag: "seats", delta: 1 }, owner.cookie)))
      .toMatchObject({ _tag: "TooManySeats", max: 500 })
    expect(failure(await rpc("Billing.addSeats", { n: 1 }, owner.cookie))).toMatchObject({ _tag: "TooManySeats" })
  }, 120_000)

  it("is changed by people only: an API key or an agent's key is refused", async () => {
    const owner = await founder("keys")
    const key = async (agent: boolean) =>
      ok(
        await rpc("ApiKeys.create", {
          label: agent ? "Agent" : "Sleutel",
          access: { kind: "role", roleId: "admin" } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent
        }, owner.cookie)
      ).secret
    for (const token of [await key(false), await key(true)]) {
      const headers = { authorization: `Bearer ${token}` }
      expect((await rpcWith("Billing.changePlan", { plan: "scale", cycle: "monthly" }, headers))._tag).toBe("Failure")
      expect((await rpcWith("Billing.get", undefined, headers))._tag).toBe("Failure")
      // Nor is billing on the public API.
      expect((await call("http://api.public.test/v1/billing", { headers })).status).toBe(404)
    }
    expect(ok(await rpc("Billing.get", undefined, owner.cookie)).status).toBe("trial")
  })

  it("keeps each workspace's billing its own", async () => {
    const a = await founder("fence-a")
    const b = await founder("fence-b")
    ok(await rpc("Billing.changePlan", { plan: "growth", cycle: "monthly" }, a.cookie))
    const invoice = ok(await rpc("Billing.invoices", {}, a.cookie)).rows[0]!

    // B is still on its trial and sees none of A's invoices, nor can it open one by its id.
    expect(ok(await rpc("Billing.get", undefined, b.cookie)).status).toBe("trial")
    expect(ok(await rpc("Billing.invoices", {}, b.cookie)).rows).toEqual([])
    expect(failure(await rpc("Billing.invoiceUrl", { id: invoice.id }, b.cookie))).toMatchObject({ _tag: "NotFound" })

    // A webhook for A's customer that names B in its metadata still lands on A: the customer decides.
    const event = subscriptionEvent(`evt_${a.workspace}_fence`, a.workspace, now() + 5, { status: "active", seats: 2 })
    ;(event.data.object.metadata as { insyte_workspace: string }).insyte_workspace = b.workspace
    expect((await stripe(event)).status).toBe(200)
    expect(ok(await rpc("Billing.get", undefined, a.cookie)).seats.extra).toBe(2)
    expect(ok(await rpc("Billing.get", undefined, b.cookie))).toMatchObject({ status: "trial", seats: { extra: 0 } })
  })
})
