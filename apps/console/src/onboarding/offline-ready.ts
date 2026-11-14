import { AsyncResult } from "effect/reactivity"

/*
 * Whether the offline step's "Afronden" may make the plan yet (M15 step 5, ADR-0027). The plan is a save of
 * Zelfstandigheid made on the version the step showed, so it waits until the server has moved the person onto the
 * offline step (after "Klaarzetten" the screen draws it before `Onboarding.me` is read again) and the policy is read.
 * A read that fails, or takes too long, is said and read again. (A role that may not change Zelfstandigheid learns so
 * from the save itself, `Forbidden`, and goes on without a plan: onboarding runs outside the frame that knows the
 * role.) Pure, so the window between the two reads is tested without a browser.
 */

/** How long "Afronden" waits for the reads before it says so and offers to read again. */
export const OFFLINE_WAIT_MS = 10_000

export type OfflineReady =
  /** Still reading: "Afronden" waits in its busy state. */
  | { readonly kind: "wait" }
  /** The plan is made on this version, one the server answered. */
  | { readonly kind: "ready"; readonly version: number }
  /** A read failed or took too long: the step says so, and "Afronden" reads again. */
  | { readonly kind: "failed" }

export const offlineReady = (input: {
  /** The step the server has the person on, as last read. */
  readonly serverStep: string | undefined
  /** The autonomy policy's read. */
  readonly policy: AsyncResult.AsyncResult<{ readonly version: number }, unknown>
  /** The reads took longer than `OFFLINE_WAIT_MS`. */
  readonly timedOut: boolean
}): OfflineReady => {
  const { policy } = input
  if (AsyncResult.isFailure(policy) && !policy.waiting) return { kind: "failed" }
  const read = AsyncResult.isSuccess(policy) && !policy.waiting
  if (input.serverStep !== "offline" || !read) return input.timedOut ? { kind: "failed" } : { kind: "wait" }
  return { kind: "ready", version: policy.value.version }
}
