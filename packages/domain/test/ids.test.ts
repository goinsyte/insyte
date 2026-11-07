import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { OrderId, WorkspaceId } from "../src/Ids.ts"

const decode = Schema.decodeUnknownSync(OrderId)
const valid = "ord_01jc5x3k8m9n0p1q2r3s4t5v6w"

describe("Ids", () => {
  it("accepts a prefixed TypeID and round-trips it unchanged", () => {
    expect(Schema.encodeSync(OrderId)(decode(valid))).toBe(valid)
  })

  it.each([
    ["another prefix", "ws_01jc5x3k8m9n0p1q2r3s4t5v6w"],
    ["no prefix", "01jc5x3k8m9n0p1q2r3s4t5v6w"],
    ["too short", "ord_01jc5x3k8m"],
    ["a letter outside Crockford base32", "ord_01jc5x3k8m9n0p1q2r3s4t5v6u"],
    ["upper case", "ord_01JC5X3K8M9N0P1Q2R3S4T5V6W"]
  ])("rejects %s", (_, id) => {
    expect(() => decode(id)).toThrow()
  })

  it("keeps each prefix to its own id", () => {
    expect(() => Schema.decodeSync(WorkspaceId)(valid)).toThrow()
  })
})
