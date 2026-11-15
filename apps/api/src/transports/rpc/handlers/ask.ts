import { AskRpcs } from "@insyte/api/rpc/AskRpcs"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { AiRateLimited } from "@insyte/modules/ai/domain/Ai"
import type { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { AskService } from "@insyte/modules/ask/Ask"
import type { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import type { CustomersService } from "@insyte/modules/customers/Customers"
import type { OrdersService } from "@insyte/modules/orders/Orders"
import type { QueueService } from "@insyte/modules/queue/Queue"
import type { TicketsService } from "@insyte/modules/tickets/Tickets"
import { Effect, Stream } from "effect"
import { withAsk } from "../../../platform/Ask.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"

/*
 * Vraag Insyte (M15 step 3). The conversations load with the RPC layer; a question loads the loop, its tools and the
 * model with it (`withAsk`), so no other RPC waits on them. A question is limited per person and per workspace in the
 * same windows as the drafts (each step of its answer is a model call, all of them under the month's budget), and its
 * tools read through the same slices the console does, as the person asking.
 */

/** Questions a minute: one person's, and the whole workspace's. Each answer is up to five model calls. */
const QUESTIONS_PER_MINUTE = { member: 6, workspace: 20 } as const

export const AskHandlers = AskRpcs.toLayer(Effect.gen(function*() {
  const ask = yield* AskService
  const limits = yield* RateLimits
  // The slices the tools read through, provided to each answer.
  const slices = yield* Effect.context<
    OrdersService | TicketsService | ChargebacksService | QueueService | AnalyticsService | CustomersService
  >()
  const limited = Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    for (
      const [key, limit] of [
        [`ask:${p.workspaceId}:${p.id}`, QUESTIONS_PER_MINUTE.member],
        [`ask:${p.workspaceId}`, QUESTIONS_PER_MINUTE.workspace]
      ] as const
    ) {
      const taken = yield* limits.take(key, "questions", limit, 60)
      if (!taken.ok) return yield* new AiRateLimited({ retryAfterSeconds: taken.retryAfterSeconds })
    }
  })
  return AskRpcs.of({
    "Ask.list": ({ limit }) => ask.list(limit),
    "Ask.get": ({ id }) => ask.get(id),
    "Ask.remove": ({ id }) => ask.remove(id),
    "Ask.send": (input) =>
      Stream.unwrap(Effect.as(limited, withAsk(({ Answer, askTools }) => Answer.send(input, askTools)))).pipe(
        Stream.provideContext(slices)
      ),
    "Ask.retry": ({ turnId }) =>
      Stream.unwrap(Effect.as(limited, withAsk(({ Answer, askTools }) => Answer.retry(turnId, askTools)))).pipe(
        Stream.provideContext(slices)
      )
  })
}))
