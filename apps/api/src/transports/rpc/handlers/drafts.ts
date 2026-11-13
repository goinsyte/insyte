import { DraftsRpcs } from "@insyte/api/rpc/DraftsRpcs"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { AiRateLimited, AiStatus } from "@insyte/modules/ai/domain/Ai"
import { Effect } from "effect"
import { withAi } from "../../../platform/Ai.ts"
import { aiMode } from "../../../platform/AiSettings.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"

/*
 * Insyte AI's drafts (M15 step 2). The slice and `effect/ai` load with the first of these calls (`withAi`), not with
 * the RPC layer: no other RPC waits on them or fails with them. A call that asks the model is limited per person and
 * per workspace (the `RateLimiter` Durable Object, fixed windows of a minute), on top of the month's budget: a tab
 * left open on a busy inbox cannot spend a month in an afternoon. `Drafts.status` reads only the stage's settings: the
 * console asks it before it offers anything, and it loads nothing.
 */

/** Model calls a minute: one person's, and the whole workspace's. */
const AI_CALLS_PER_MINUTE = { member: 20, workspace: 60 } as const

export const DraftsHandlers = DraftsRpcs.toLayer(Effect.gen(function*() {
  const limits = yield* RateLimits
  const limited = Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    for (
      const [key, limit] of [
        [`ai:${p.workspaceId}:${p.id}`, AI_CALLS_PER_MINUTE.member],
        [`ai:${p.workspaceId}`, AI_CALLS_PER_MINUTE.workspace]
      ] as const
    ) {
      const taken = yield* limits.take(key, "model_calls", limit, 60)
      if (!taken.ok) return yield* new AiRateLimited({ retryAfterSeconds: taken.retryAfterSeconds })
    }
  })
  return DraftsRpcs.of({
    "Drafts.status": () =>
      aiMode.pipe(
        Effect.map((mode) => new AiStatus({ enabled: mode !== "off" })),
        Effect.orDie
      ),
    "Drafts.reply": (input) =>
      Effect.andThen(limited, withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.reply(input)))),
    "Drafts.use": ({ id }) => withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.use(id))),
    "Drafts.forSubject": ({ subject }) => withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.forSubject(subject))),
    "Drafts.summarizeTicket": ({ ticketId }) =>
      Effect.andThen(limited, withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.summarizeTicket(ticketId)))),
    "Drafts.summarizeThread": ({ threadId }) =>
      Effect.andThen(limited, withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.summarizeThread(threadId)))),
    "Drafts.knowledgeAnswer": () => withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.knowledgeAnswer))
  })
}))
