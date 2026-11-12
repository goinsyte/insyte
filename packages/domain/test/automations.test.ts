import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { fieldsOf, referencesIn } from "../src/automations/Fields.ts"
import { type Flow, type FlowNode, scopesRequired, triggerOf, validate } from "../src/automations/Graph.ts"
import { SCOPE_IDS } from "../src/automations/Scopes.ts"
import { configSchemaOf, STEPS, STEPS_BY_ID } from "../src/automations/Steps.ts"
import { nodesOfTemplate, TEMPLATES } from "../src/automations/Templates.ts"

let seq = 0
const id = () => `n${++seq}`
const node = (variantId: string, config: Record<string, unknown> = {}): FlowNode => ({
  id: id(),
  variantId,
  config: { ...STEPS_BY_ID[variantId]?.defaultConfig, ...config }
})
const codes = (flow: Flow, ctx = {}) => validate(flow, ctx).map((i) => `${i.nodeId === null ? "-" : "n"}:${i.code}`)

describe("the step catalogue", () => {
  it("holds the design's 68 steps, once each", () => {
    expect(STEPS).toHaveLength(68)
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(68)
    expect(STEPS.filter((s) => s.kind === "trigger")).toHaveLength(11)
  })

  it("names only rights the settings list", () => {
    for (const s of STEPS) if (s.scope !== undefined) expect(SCOPE_IDS).toContain(s.scope)
  })

  it("accepts every step's own defaults", () => {
    for (const s of STEPS) expect(Schema.is(configSchemaOf(s))(s.defaultConfig)).toBe(true)
  })

  it("marks the review trigger Binnenkort", () => {
    expect(STEPS_BY_ID["trigger.review_received"]?.soon).toBe(true)
  })
})

describe("fields", () => {
  it("are what the trigger's record carries", () => {
    expect(fieldsOf("trigger.order_shipped").map((f) => f.path)).toContain("order.number")
    expect(fieldsOf("trigger.inventory_low").map((f) => f.path)).not.toContain("order.number")
    expect(fieldsOf("action.send_email")).toEqual([])
  })

  it("are read from a text", () => {
    expect(referencesIn("Hoi {{customer.first_name}}, {{ order.number }}")).toEqual([
      "customer.first_name",
      "order.number"
    ])
  })
})

describe("validate", () => {
  it("passes a whole flow", () => {
    const flow = [node("trigger.order_shipped"), node("action.send_email"), node("delay.wait")]
    expect(validate(flow)).toEqual([])
  })

  it("passes every template but the one that is Binnenkort, with its own steps", () => {
    for (const t of TEMPLATES) {
      const errors = validate(nodesOfTemplate(t, id)).filter((i) => i.severity === "error")
      if (t.id === "tpl_review") expect(errors.map((i) => i.code)).toEqual(["soon"])
      else if (t.id === "tpl_stock") expect(errors.map((i) => i.code)).toEqual(["unresolved_reference"])
      else expect(errors).toEqual([])
    }
  })

  it("asks for a trigger at the head", () => {
    expect(codes([])).toEqual(["-:missing_trigger"])
    expect(codes([node("action.track_event")])).toEqual(["-:missing_trigger", "n:unreachable"])
    expect(codes([node("trigger.order_placed"), node("trigger.chargeback")])).toEqual(["n:unreachable"])
  })

  it("finds a step twice and a flow that starts itself", () => {
    const t = node("trigger.order_placed")
    const a = node("action.track_event")
    expect(codes([t, a, a])).toEqual(["n:cycle"])
    expect(codes([t, node("action.run_workflow", { workflow_id: "auto_1" })], { selfId: "auto_1" })).toEqual([
      "n:cycle"
    ])
  })

  it("finds a missing field, an out-of-range wait and a bad option", () => {
    expect(validate([node("trigger.order_placed"), node("action.tag_customer", { tag: " " })])).toMatchObject([
      { code: "missing_field", field: "tag", message: "Label is leeg." }
    ])
    expect(codes([node("trigger.order_placed"), node("delay.wait", { minutes: 50_000 })])).toEqual(["n:out_of_range"])
    expect(codes([node("trigger.order_placed"), node("action.create_ticket", { priority: "urgent" })])).toEqual([
      "n:invalid_value"
    ])
  })

  it("finds a reference the trigger cannot fill", () => {
    const flow = [node("trigger.inventory_low"), node("action.send_email")]
    expect(validate(flow)).toMatchObject([
      { code: "unresolved_reference", field: "to", message: "{{customer.email}} bestaat niet bij deze trigger." },
      { code: "unresolved_reference", field: "body" }
    ])
  })

  it("keeps lanes on the main line and not empty", () => {
    const branch = { ...node("condition.branch"), branches: { yes: [], no: [] } }
    expect(codes([node("trigger.order_placed"), branch])).toEqual(["n:empty_branch"])
    const nested = {
      ...node("condition.branch"),
      branches: { yes: [node("condition.branch")], no: [node("action.track_event")] }
    }
    expect(codes([node("trigger.order_placed"), nested])).toEqual(["n:nested_branch"])
  })

  it("refuses a Binnenkort step and a right switched off, and warns about a service not connected", () => {
    expect(codes([node("trigger.review_received")])).toEqual(["n:soon"])
    const flow = [node("trigger.order_placed"), node("action.klaviyo_send")]
    expect(codes(flow, { scopesOff: ["customers.email"] })).toEqual(["n:scope_off"])
    expect(validate(flow, { connected: new Set(["shopify"]) })).toMatchObject([
      { code: "connection_missing", severity: "warning", message: "Koppel Klaviyo" }
    ])
  })

  it("reads the trigger and the rights a flow needs", () => {
    const flow = [node("trigger.order_placed"), node("action.refund"), node("action.send_email")]
    expect(triggerOf(flow)?.variantId).toBe("trigger.order_placed")
    expect(scopesRequired(flow)).toEqual(["customers.email", "refunds.write"])
  })
})
