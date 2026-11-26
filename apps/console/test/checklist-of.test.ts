import { NotCurrentStep, StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { Cause } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { checklistOf } from "../src/start/checklist-of.ts"

/*
 * Start's reading of `Onboarding.start`: only its refusal means "no checklist for this person". A failure of any other
 * kind (the network, the session) must not pass for it, or Start would hide the founder's setup steps.
 */

const checklist = new StartChecklist({ workspaceName: "Atelier", done: [] })
const failed = (error: unknown) => AsyncResult.failure<StartChecklist, unknown>(Cause.fail(error))

describe("Start's checklist", () => {
  it("is the checklist once it is read", () => {
    expect(checklistOf(AsyncResult.success(checklist))).toBe(checklist)
  })

  it("is none when Start refuses it: the person joined the workspace", () => {
    expect(checklistOf(failed(new NotCurrentStep({ step: "ready", current: "ready" })))).toBeNull()
  })

  it("waits while it is read, and when the read failed for another reason", () => {
    expect(checklistOf(AsyncResult.initial())).toBeUndefined()
    expect(checklistOf(failed(new Error("offline")))).toBeUndefined()
    expect(checklistOf(AsyncResult.failure(Cause.die("boom")))).toBeUndefined()
  })
})
