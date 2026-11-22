import { Frame } from "@insyte/api/Frames"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AUTOMATIONS, RUNS } from "../src/data/automations.ts"
import { refetchOf } from "../src/data/realtime.ts"

/*
 * A `records.changed` frame refetches the queries that show its kind (M5.1). An automation's run tells the tabs when it
 * is in, wrote a step and finished (`AutomationRun`), so the Runs tab shows it without a reload (M12).
 */

describe("what a records.changed frame refetches", () => {
  it("refetches a flow's runs, the run's drawer and the flows' counts when a run changed", () => {
    const frame = Schema.decodeUnknownSync(Frame)({
      v: 1,
      type: "records.changed",
      kind: "automation_run",
      ids: ["run_1"]
    })
    expect(frame.type).toBe("records.changed")
    const keys = refetchOf("automation_run")
    for (const key of [...RUNS, ...AUTOMATIONS]) expect(keys).toContain(key)
  })

  it("refetches the flows when one changed", () => {
    expect(refetchOf("automation")).toEqual(expect.arrayContaining([...AUTOMATIONS]))
  })

  it("refetches nothing for a kind no screen shows", () => {
    expect(refetchOf("no_such_kind")).toEqual([])
  })
})
