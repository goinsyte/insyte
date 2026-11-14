import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  BaseVersion,
  FIRST_POLICY_VERSION,
  ResetAutonomyInput,
  SetAutonomyInput
} from "../src/agent/domain/Autonomy.ts"
import { AgreeOfflineInput } from "../src/first-analysis/domain/FirstAnalysis.ts"

/*
 * The version a save of Zelfstandigheid is made on (ADR-0027): a policy never saved is at `FIRST_POLICY_VERSION`, the
 * server answers that, and a save names only a version the server answered. A guess below it (the 0 of a policy not
 * read yet) or no version at all is refused by the schema itself, so the console cannot even send it.
 */

const accepts = <S extends Schema.Top>(schema: S, value: unknown) =>
  Schema.decodeUnknownExit(schema as never)(value)._tag === "Success"

describe("the version a save is made on", () => {
  it("starts at one: a policy nobody saved", () => {
    expect(FIRST_POLICY_VERSION).toBe(1)
    expect(accepts(BaseVersion, FIRST_POLICY_VERSION)).toBe(true)
    expect(accepts(BaseVersion, 7)).toBe(true)
  })

  it("is never below the first, nor missing, on any save", () => {
    for (const version of [0, -1, 1.5]) expect(accepts(BaseVersion, version)).toBe(false)
    expect(accepts(SetAutonomyInput, { levels: { AddNote: "auto" }, baseVersion: 0 })).toBe(false)
    expect(accepts(SetAutonomyInput, { levels: { AddNote: "auto" } })).toBe(false)
    expect(accepts(ResetAutonomyInput, { baseVersion: 0 })).toBe(false)
    expect(accepts(AgreeOfflineInput, { window: "evening", levels: {}, baseVersion: 0 })).toBe(false)
    expect(accepts(AgreeOfflineInput, { window: "evening", levels: {} })).toBe(false)
    expect(accepts(AgreeOfflineInput, { window: "evening", levels: {}, baseVersion: FIRST_POLICY_VERSION })).toBe(true)
  })
})
