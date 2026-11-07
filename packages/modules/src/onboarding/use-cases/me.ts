import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { next } from "../domain/Steps.ts"
import { factsOf, loadProgress, saveProgress, stateOf } from "./progress.ts"

/**
 * `Onboarding.me`: where this person is. A step the facts have overtaken (a stored `verify` for an address since
 * verified) moves on and is saved, so every device and every reload agree.
 */
export const me = Effect.fn("Onboarding.me")(function*() {
  const user = yield* CurrentUser
  const row = yield* loadProgress()
  const step = row.step === "account" || row.step === "verify"
    ? next(row.track, row.step, factsOf(user, row))
    : row.step
  if (step === row.step) return stateOf(row)
  const moved = { ...row, step }
  yield* saveProgress(moved)
  return stateOf(moved)
})
