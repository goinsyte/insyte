import { describe, expect, it } from "vitest"
import {
  crosses,
  DEFAULT_THRESHOLD,
  fill,
  grantsOf,
  handlingOf,
  holds,
  lookbackDays,
  mailMatches,
  missingIn,
  RUNNABLE,
  scheduleDue,
  scheduleOf,
  startedBy,
  timelineOf,
  TRIGGER_EVENTS
} from "../src/automations/Engine.ts"
import { accountScopes, SCOPE_GRANTS, SCOPE_IDS } from "../src/automations/Scopes.ts"
import { STEPS, STEPS_BY_ID } from "../src/automations/Steps.ts"

const order = {
  "order.number": "#1042",
  "order.total": "129,95",
  "order.country": "Nederland",
  "customer.first_name": "Sam",
  "customer.email": "sam@example.com"
}

describe("what starts a run", () => {
  it("maps the events Insyte writes today to their triggers, with the records they name", () => {
    expect(startedBy({ type: "order.delayed", orderIds: ["o1", "o2"] })).toMatchObject([{
      trigger: "trigger.shipping_delay",
      recordKind: "order",
      recordIds: ["o1", "o2"]
    }])
    expect(startedBy({ type: "refund.requested", orderIds: ["o1"] })[0]?.trigger).toBe("trigger.refund_requested")
    expect(startedBy({ type: "order.updated", change: "fulfil", orderIds: ["o1"] })[0]?.trigger).toBe(
      "trigger.order_shipped"
    )
    expect(startedBy({ type: "order.fulfilled", orderIds: ["o1"] })[0]?.trigger).toBe("trigger.order_shipped")
    expect(startedBy({ type: "order.placed", orderIds: ["o1"] })[0]?.trigger).toBe("trigger.order_placed")
    expect(startedBy({ type: "chargeback.opened", chargebackId: "cb1" })).toMatchObject([{
      trigger: "trigger.chargeback",
      recordKind: "chargeback",
      recordIds: ["cb1"]
    }])
  })

  it("runs a flow once per record for what happens once to it, and per event for what can happen again", () => {
    const once = (event: { type: string } & Record<string, unknown>) => startedBy(event).map((s) => s.once === true)
    expect(once({ type: "order.placed", orderIds: ["o1"] })).toEqual([true])
    expect(once({ type: "order.fulfilled", orderIds: ["o1"] })).toEqual([true])
    expect(once({ type: "order.updated", change: "fulfil", orderIds: ["o1"] })).toEqual([true])
    expect(once({ type: "chargeback.opened", chargebackId: "cb1" })).toEqual([true])
    expect(once({ type: "order.delayed", orderIds: ["o1"] })).toEqual([false])
    expect(once({ type: "refund.requested", orderIds: ["o1"] })).toEqual([false])
  })

  it("starts Klant antwoordt beside E-mail ontvangen only for a reply on a known thread", () => {
    expect(startedBy({ type: "thread.received", threadId: "t1", reply: false }).map((s) => s.trigger)).toEqual([
      "trigger.email_received"
    ])
    expect(startedBy({ type: "thread.received", threadId: "t1", reply: true }).map((s) => s.trigger)).toEqual([
      "trigger.email_received",
      "trigger.customer_reply"
    ])
  })

  it("carries each variant's stock before and after for Lage voorraad", () => {
    const [low] = startedBy({ type: "inventory.dropped", levels: [{ variantId: "v1", before: 12, after: 8 }] })
    expect(low).toMatchObject({ trigger: "trigger.inventory_low", recordKind: "product", recordIds: ["v1"] })
    expect(low?.levels?.["v1"]).toEqual({ before: 12, after: 8 })
  })

  it("starts nothing for other changes or events, nor for what a flow's own account did", () => {
    expect(startedBy({ type: "order.updated", change: "tag", orderIds: ["o1"] })).toEqual([])
    expect(startedBy({ type: "ticket.created" })).toEqual([])
    expect(startedBy({ type: "refund.requested", orderIds: ["o1"], userId: "sa_01" })).toEqual([])
  })

  it("asks the relay only for events it reads, and names only triggers in the catalogue", () => {
    for (const type of TRIGGER_EVENTS) {
      const started = startedBy({
        type,
        change: "fulfil",
        orderIds: ["o1"],
        chargebackId: "cb1",
        threadId: "t1",
        levels: [{ variantId: "v1", before: 2, after: 1 }]
      })
      expect(started.length).toBeGreaterThan(0)
      for (const s of started) expect(STEPS_BY_ID[s.trigger]?.kind).toBe("trigger")
    }
  })
})

describe("a trigger's own settings", () => {
  it("passes Lage voorraad once, when stock goes from above the threshold to at or under it", () => {
    expect(crosses({ threshold: 10 }, { before: 11, after: 10 })).toBe(true)
    expect(crosses({ threshold: 10 }, { before: 10, after: 9 })).toBe(false)
    expect(crosses({}, { before: DEFAULT_THRESHOLD + 5, after: 0 })).toBe(true)
  })

  it("matches E-mail ontvangen on the subject or the message, case aside", () => {
    expect(mailMatches({ contains: "Retour" }, { subject: "Vraag over mijn retour", body: "" })).toBe(true)
    expect(mailMatches({ contains: "retour" }, { subject: "Hoi", body: "Waar is mijn pakket?" })).toBe(false)
    expect(mailMatches({}, { subject: "Hoi", body: "" })).toBe(true)
  })

  it("reads Op een vast moment to its defaults, and is due at its hour on its day", () => {
    expect(scheduleOf({})).toEqual({ every: "day", hour: 9, records: "orders_open", days: 5 })
    expect(scheduleOf({ every: "week", hour: 30, days: 0 })).toMatchObject({ every: "week", hour: 9, days: 1 })
    const daily = scheduleOf({ hour: 8 })
    expect(scheduleDue(daily, { hour: 8, weekday: 3, day: 14 })).toBe(true)
    expect(scheduleDue(daily, { hour: 9, weekday: 3, day: 14 })).toBe(false)
    const weekly = scheduleOf({ every: "week" })
    expect(scheduleDue(weekly, { hour: 9, weekday: 1, day: 14 })).toBe(true)
    expect(scheduleDue(weekly, { hour: 9, weekday: 2, day: 14 })).toBe(false)
    expect(scheduleDue(scheduleOf({ every: "month" }), { hour: 9, weekday: 4, day: 1 })).toBe(true)
    expect(lookbackDays(weekly)).toBe(8)
  })
})

describe("a run's fields", () => {
  it("fills {{field}} from the record and leaves what it does not have empty", () => {
    expect(fill("Hoi {{customer.first_name}}, bestelling {{ order.number }}", order)).toBe("Hoi Sam, bestelling #1042")
    expect(fill("{{order.tracking_url}}", order)).toBe("")
  })

  it("names the fields a step reads that the record does not have", () => {
    expect(missingIn({ title: "{{order.number}} {{order.tracking_url}}", n: 3 }, order)).toEqual(["order.tracking_url"])
  })
})

describe("a condition's expression", () => {
  it("compares numbers as numbers, in Dutch notation too", () => {
    expect(holds("{{order.total}} > 100", order)).toBe(true)
    expect(holds("{{order.total}} >= 129,95", order)).toBe(true)
    expect(holds("{{order.total}} < 100", order)).toBe(false)
    expect(holds("€ 1.240,00 > 1000", {})).toBe(true)
  })

  it("compares text case aside, and reads bevat", () => {
    expect(holds("{{order.country}} = nederland", order)).toBe(true)
    expect(holds("{{order.country}} != Nederland", order)).toBe(false)
    expect(holds("{{customer.email}} bevat EXAMPLE", order)).toBe(true)
  })

  it("takes a bare value as true unless it is empty, 0 or false", () => {
    expect(holds("{{order.number}}", order)).toBe(true)
    expect(holds("{{order.tracking_url}}", order)).toBe(false)
    expect(holds("0", {})).toBe(false)
  })
})

describe("how the engine meets each step", () => {
  it("knows every step in the catalogue", () => {
    for (const step of STEPS) {
      const handling = handlingOf(step.id)
      if (step.kind === "trigger") expect(handling).toBe("trigger")
      if (step.kind === "condition") expect(handling).toBe("condition")
      if (step.kind === "branch") expect(handling).toBe("branch")
    }
    expect(handlingOf("delay.wait")).toBe("wait")
    expect(handlingOf("delay.wait_no_reply")).toBe("wait_no_reply")
    expect(handlingOf("action.require_approval")).toBe("approval")
    expect(handlingOf("action.create_ticket")).toBe("action")
    expect(handlingOf("action.send_email")).toBe("unsupported")
    expect(handlingOf("nope")).toBe("unsupported")
  })

  it("runs only actions in the catalogue, none of them through a connected service", () => {
    for (const id of RUNNABLE) {
      expect(STEPS_BY_ID[id]?.kind).toBe("action")
      expect(STEPS_BY_ID[id]?.brand).toBeUndefined()
    }
  })
})

describe("the flow's service account", () => {
  it("holds what the version needs, less what was switched off, plus what was added, in catalogue order", () => {
    expect(
      accountScopes(["tickets.write", "customers.write", "team.notify"], {
        scopesOff: ["customers.write"],
        scopesExtra: ["orders.read"]
      })
    ).toEqual(SCOPE_IDS.filter((s) => ["tickets.write", "team.notify", "orders.read"].includes(s)))
  })

  it("maps every right in the catalogue to the permission vocabulary", () => {
    for (const scope of SCOPE_IDS) expect(SCOPE_GRANTS[scope]?.length ?? 0).toBeGreaterThan(0)
  })

  it("adds rights up to levels, and money and disputes to their specials", () => {
    expect(grantsOf(["orders.read", "refunds.write", "tickets.write"])).toEqual({
      levels: { orders: 2, support: 2 },
      specials: { "refunds.write": true }
    })
    expect(grantsOf([])).toEqual({ levels: {}, specials: {} })
  })
})

const row = (nodeId: string, status: "succeeded" | "failed" | "waiting", attempt = 1, lane?: "yes" | "no") => ({
  nodeId,
  status,
  attempt,
  ms: 5,
  explanation: null,
  lane
})

describe("a run's steps in the Runs drawer", () => {
  const nodes = [
    { id: "t", variantId: "trigger.shipping_delay", config: {} },
    {
      id: "s",
      variantId: "condition.branch",
      config: {},
      branches: {
        yes: [{ id: "y", variantId: "action.tag_customer", config: {} }],
        no: [{ id: "n", variantId: "action.track_event", config: {} }]
      }
    },
    { id: "a", variantId: "action.require_approval", config: {} },
    { id: "k", variantId: "action.create_ticket", config: {} }
  ]
  it("skips the lane not taken, and shows what a waiting run has not reached as pending", () => {
    const steps = timelineOf(nodes, [
      row("t", "succeeded"),
      row("s", "succeeded", 1, "no"),
      row("n", "succeeded"),
      row(
        "a",
        "waiting"
      )
    ], true)
    expect(steps.map((s) => [s.nodeId, s.lane, s.status])).toEqual([
      ["t", null, "ok"],
      ["s", null, "ok"],
      ["y", "yes", "skipped"],
      ["n", "no", "ok"],
      ["a", null, "waiting"],
      ["k", null, "pending"]
    ])
  })

  it("reads a step's latest attempt, and what a finished run never reached as skipped", () => {
    const steps = timelineOf(nodes, [row("t", "succeeded"), row("s", "failed"), row("s", "succeeded", 2, "yes")], false)
    expect(steps.find((s) => s.nodeId === "s")).toMatchObject({ status: "ok", attempt: 2 })
    expect(steps.find((s) => s.nodeId === "k")?.status).toBe("skipped")
  })
})
