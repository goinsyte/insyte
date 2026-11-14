import { describe, expect, it } from "vitest"
import type { Group, Rule } from "../src/app/lib/filter.ts"
import { firstQuery, serverInput, type ServerList } from "../src/app/lib/server-query.ts"

/*
 * A table that pages on the server asks in its own words; `serverInput` says it in the list's (W3.1): fields renamed,
 * values renamed, the value that stands for nothing as the server's empty, the host's own rules, unfinished and unknown
 * rules left out, and the same query always the same input, so a read is shared and not repeated.
 */

const LIST: ServerList = {
  fields: {
    cut: "state",
    flag: { field: "return_high", values: { ja: "yes", nee: "no" } },
    supplier: { field: "supplier_name", blank: "—" },
    status: (rule) => ({ kind: "rule", id: rule.id, field: "orders", op: "gt", value: "2" })
  },
  sorts: { placed: "placed_at", total: "total" }
}

const rule = (field: string, op: Rule["op"], value: Rule["value"], id = "r"): Rule => ({
  kind: "rule",
  id,
  field,
  op,
  value
})
const group = (...children: Array<Rule | Group>): Group => ({ kind: "group", id: "root", join: "and", children })

describe("serverInput", () => {
  it("asks for the first page with the list's order and nothing else", () => {
    expect(serverInput(firstQuery({ id: "placed", desc: true }, 12), LIST)).toEqual({
      sort: { field: "placed_at", desc: true },
      limit: 12
    })
    expect(JSON.stringify(serverInput(firstQuery(null, 12), LIST))).toBe(`{"limit":12}`)
  })

  it("renames fields and values, and writes the value for nothing as the server's empty", () => {
    const input = serverInput({
      ...firstQuery(null, 12),
      filter: group(
        rule("cut", "any", ["delayed"], "a"),
        rule("flag", "any", ["ja"], "b"),
        rule("supplier", "any", ["Atelier", "—"], "c"),
        rule("supplier", "none", ["—"], "d")
      ),
      q: "  trui ",
      cursor: "abc"
    }, LIST)
    expect(input).toEqual({
      filter: group(
        rule("state", "any", ["delayed"], "a"),
        rule("return_high", "any", ["yes"], "b"),
        {
          kind: "group",
          id: "c-or",
          join: "or",
          children: [rule("supplier_name", "any", ["Atelier"], "c"), rule("supplier_name", "empty", "", "c-blank")]
        },
        rule("supplier_name", "not_empty", "", "d-blank")
      ),
      q: "trui",
      cursor: "abc",
      limit: 12
    })
  })

  it("leaves out what says nothing yet and what the server does not know; the host writes its own rules", () => {
    const input = serverInput({
      ...firstQuery({ id: "delivery", desc: false }, 12),
      filter: group(
        rule("cut", "any", []),
        rule("delivery", "contains", "4"),
        { kind: "group", id: "g", join: "or", children: [rule("cut", "contains", " ")] },
        rule("status", "any", ["loyal"], "s")
      )
    }, LIST)
    expect(input).toEqual({ filter: group(rule("orders", "gt", "2", "s")), limit: 12 })
    expect(serverInput({ ...firstQuery(null, 12), filter: group(rule("cut", "any", [])) }, LIST)).toEqual({ limit: 12 })
  })
})
