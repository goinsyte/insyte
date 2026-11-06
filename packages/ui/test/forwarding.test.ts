import { describe, expect, it } from "vitest"
import {
  cancel,
  confirm,
  effective,
  fail,
  forward,
  forwardSentence,
  HOUR,
  IllegalMove,
  inView,
  type Leg,
  overdue,
  reroute,
  waitedLabel
} from "../src/app/lib/forwarding.ts"

const T0 = Date.parse("2026-11-01T09:00:00Z")
const leg: Leg = { orderId: "ord_5003", supplierId: "sup_dpc", state: "to_forward", since: new Date(T0).toISOString() }

describe("a forwarding leg", () => {
  it("goes to forward, waits out the window, then awaits confirmation", () => {
    const sent = forward(leg, T0, { via: "portal", by: "Elena Hart", window: 6000 })
    expect(sent.state).toBe("sending")
    expect(effective(sent, undefined, T0 + 1000)).toBe("sending")
    expect(effective(sent, undefined, T0 + 6000)).toBe("awaiting")
    expect(inView(effective(sent, undefined, T0 + 6000), "awaiting")).toBe(true)
  })

  it("is confirmed by the supplier's acceptance, whatever the leg says", () => {
    expect(effective({ ...leg, state: "awaiting" }, { accepted: true }, T0)).toBe("confirmed")
    expect(confirm({ ...leg, state: "awaiting" }, T0, "Marco Rossi").state).toBe("confirmed")
  })

  it("is in error when the supplier reports it out of stock, with that reason", () => {
    const s = effective({ ...leg, state: "awaiting" }, { problem: "stock" }, T0)
    expect(s).toBe("error")
    expect(inView(s, "forward_error")).toBe(true)
  })

  it("can be rerouted from an error to another supplier, to be forwarded again", () => {
    const failed = fail({ ...leg, state: "awaiting" }, T0, "stock", "DPC Apparel")
    const moved = reroute(failed, T0 + HOUR, "sup_allure", "Elena Hart")
    expect(moved).toMatchObject({ supplierId: "sup_allure", from: "sup_dpc", state: "to_forward" })
    expect(moved.reason).toBeUndefined()
  })

  it("refuses moves that make no sense", () => {
    expect(() => confirm(leg, T0, "x")).toThrow(IllegalMove)
    expect(() => forward({ ...leg, state: "confirmed" }, T0, { via: "email", by: "x", window: 0 })).toThrow(IllegalMove)
    expect(() => cancel({ ...leg, state: "confirmed" }, T0, "x")).toThrow(IllegalMove)
  })
})

describe("waiting", () => {
  it("is overdue after 24 hours without confirmation, not before", () => {
    const since = new Date(T0).toISOString()
    expect(overdue("awaiting", since, T0 + 23 * HOUR)).toBe(false)
    expect(overdue("awaiting", since, T0 + 25 * HOUR)).toBe(true)
    expect(overdue("to_forward", since, T0 + 48 * HOUR)).toBe(false)
  })

  it("says how long in hours and days", () => {
    const since = new Date(T0).toISOString()
    expect(waitedLabel(since, T0 + 10 * 60_000)).toBe("zojuist")
    expect(waitedLabel(since, T0 + 5 * HOUR)).toBe("5 u")
    expect(waitedLabel(since, T0 + 31 * HOUR)).toBe("1 d 7 u")
  })

  it("counts orders and suppliers for the button", () => {
    expect(forwardSentence([
      { orderId: "a", supplierId: "x" },
      { orderId: "a", supplierId: "y" },
      { orderId: "b", supplierId: "x" }
    ])).toBe("2 bestellingen naar 2 leveranciers doorsturen")
  })
})
