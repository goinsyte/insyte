import { describe, expect, it } from "vitest"
import { activeMs, budgetFor, checkStartup, median } from "../lib/startup-rules.ts"

describe("startup:check", () => {
  it("counts every sample but idle, garbage collection included", () => {
    const profile = {
      nodes: [
        { id: 1, callFrame: { functionName: "(root)" } },
        { id: 2, callFrame: { functionName: "(idle)" } },
        { id: 3, callFrame: { functionName: "(garbage collector)" } }
      ],
      samples: [1, 2, 3, 1],
      timeDeltas: [1000, 50_000, 2000, 500]
    }
    expect(activeMs(profile)).toBe(3.5)
  })

  it("passes at the budget and fails one millisecond over it, on the fastest run", () => {
    expect(checkStartup("api", [300, 250, 280], 250)).toEqual([])
    expect(checkStartup("api", [300, 251, 280], 250)).toEqual([
      "api: startup takes 251 ms of CPU (fastest of 3), over its 250 ms budget"
    ])
  })

  it("takes the median of an odd and an even count", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it("takes the CPU's own budget, and the highest for a CPU with none", () => {
    const budget = { budgetMs: { "AMD EPYC 7763": 480, "AMD EPYC 9V74": 360 }, wranglerConfig: "wrangler.jsonc" }
    expect(budgetFor(budget, "AMD EPYC 9V74 80-Core Processor")).toEqual({ cpu: "AMD EPYC 9V74", ms: 360 })
    expect(budgetFor(budget, "Apple M1 Pro")).toEqual({ ms: 480 })
  })
})
