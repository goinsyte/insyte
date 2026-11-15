import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { RateLimits } from "../RateLimits.ts"

/*
 * How often Vraag Insyte is asked (M15 step 3): per person or key, and per workspace, the same windows wherever the
 * question comes from (the console, `/v1`, MCP). Each answer is up to five model calls under the month's budget, so a
 * workspace's keys together ask no more than its people may.
 */

/** Questions a minute: one asker's, and the whole workspace's. */
const QUESTIONS_PER_MINUTE = { asker: 6, workspace: 20 } as const

/** Takes one question from the asker's window and the workspace's: the seconds to wait where either is full. */
export const takeQuestion = Effect.gen(function*() {
  const limits = yield* RateLimits
  const p = yield* CurrentPrincipal
  for (
    const [key, limit] of [
      [`ask:${p.workspaceId}:${p.id}`, QUESTIONS_PER_MINUTE.asker],
      [`ask:${p.workspaceId}`, QUESTIONS_PER_MINUTE.workspace]
    ] as const
  ) {
    const taken = yield* limits.take(key, "questions", limit, 60)
    if (!taken.ok) return { ok: false as const, retryAfterSeconds: taken.retryAfterSeconds }
  }
  return { ok: true as const }
})
