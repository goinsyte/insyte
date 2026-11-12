import { describe, expect, it } from "vitest"
import {
  accountScopes,
  fill,
  grantsOf,
  handlingOf,
  holds,
  missingIn,
  RUNNABLE,
  SCOPE_GRANTS,
  startedBy,
  TRIGGER_EVENTS
} from "../src/automations/Engine.ts"
import { SCOPE_IDS } from "../src/automations/Scopes.ts"
import { STEPS, STEPS_BY_ID } from "../src/automations/Steps.ts"

const order = {
  "order.number": "#1042",
  "order.total": "129,95",
  "order.country": "Nederland",
  "customer.first_name": "Sam",
  "customer.email": "sam@example.com"
}

describe("what starts a run", () => {
  it("maps the events Insyte writes today to their triggers, with the orders they name", () => {
    expect(startedBy({ type: "order.delayed", orderIds: ["o1", "o2"] })).toMatchObject({
      trigger: "trigger.shipping_delay",
      recordKind: "order",
      recordIds: ["o1", "o2"]
    })
    expect(startedBy({ type: "refund.requested", orderIds: ["o1"] })?.trigger).toBe("trigger.refund_requested")
    expect(startedBy({ type: "order.updated", change: "fulfil", orderIds: ["o1"] })?.trigger).toBe(
      "trigger.order_shipped"
    )
  })

  it("starts nothing for other changes or events", () => {
    expect(startedBy({ type: "order.updated", change: "tag", orderIds: ["o1"] })).toBeUndefined()
    expect(startedBy({ type: "ticket.created" })).toBeUndefined()
  })

  it("asks the relay only for events it reads, and names only triggers in the catalogue", () => {
    for (const type of TRIGGER_EVENTS) {
      const started = startedBy({ type, change: "fulfil", orderIds: ["o1"] })
      expect(started).toBeDefined()
      expect(STEPS_BY_ID[started?.trigger ?? ""]?.kind).toBe("trigger")
    }
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
