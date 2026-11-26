import { NotCurrentStep, type StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

/*
 * What Start makes of `Onboarding.start` (M4.1). Its refusal (`NotCurrentStep`: the workspace is not one this person
 * founded) means Start shows without a checklist. Any other failure is no such answer: Start waits as it does while
 * the checklist is read. Pure, so tested without a browser.
 */

const isRefusal = Schema.is(NotCurrentStep)

/** The checklist; `null` when there is none for this person; `undefined` while it is read or could not be read. */
export const checklistOf = (
  result: AsyncResult.AsyncResult<StartChecklist, unknown>
): StartChecklist | null | undefined => {
  if (AsyncResult.isSuccess(result)) return result.value
  if (!AsyncResult.isFailure(result)) return undefined
  const failed = result.cause.reasons.find((r) => r._tag === "Fail")
  return failed !== undefined && failed._tag === "Fail" && isRefusal(failed.error) ? null : undefined
}
