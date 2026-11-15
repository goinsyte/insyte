import { CurrentApiKey } from "@insyte/api/http/Security"
import { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { AskService } from "@insyte/modules/ask/Ask"
import { type AskThread, type AskTurn, STALE_MS } from "@insyte/modules/ask/domain/Ask"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { KnowledgeService } from "@insyte/modules/knowledge/Knowledge"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { QueueService } from "@insyte/modules/queue/Queue"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { withAsk } from "../../../platform/Ask.ts"
import { takeQuestion } from "../../../platform/ask/AskLimits.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"
import { conflict, notFound, writeV1 } from "../shared/errors.ts"

/*
 * Vraag Insyte for a key (M15 step 3, W11.1): the same loop and tools as the console's, run as the key, answered once
 * it has settled. The conversations are the key's own. A key asks as often as a person may, in the same workspace
 * window as the console's questions (`AskLimits.ts`), each answer up to five model calls under the workspace's budget.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const turnV1 = (t: AskTurn) => ({
  id: t.id,
  role: t.role,
  state: t.state,
  failure: t.failure,
  text: t.text,
  figures: t.tokens.flatMap((k) => ("figure" in k ? [{ label: k.label, value: k.figure, path: k.to }] : [])),
  records: t.tokens.flatMap((k) => ("ref" in k ? [{ kind: k.kind, label: k.ref, path: k.to }] : [])),
  sources: t.sources.map((s) => ({ kind: s.kind, title: s.title, path: s.to })),
  follow_ups: t.followUps,
  withheld: t.withheld,
  created_at: iso(t.createdAt)
})

const threadV1 = (t: AskThread) => ({
  id: t.id,
  title: t.title,
  last_turn_at: iso(t.lastTurnAt),
  turns: t.turns.map(turnV1)
})

const make = Effect.gen(function*() {
  const ask = yield* AskService
  const limits = yield* RateLimits
  const slices = yield* Effect.context<
    | OrdersService
    | TicketsService
    | ChargebacksService
    | QueueService
    | AnalyticsService
    | CustomersService
    | KnowledgeService
  >()

  const limited = Effect.gen(function*() {
    const key = yield* CurrentApiKey
    const taken = yield* takeQuestion.pipe(Effect.provideService(RateLimits, limits))
    if (taken.ok) return
    return yield* Effect.fail({
      error: {
        code: "RateLimitedV1" as const,
        message: `Too many questions for this key or workspace. Retry after ${taken.retryAfterSeconds} s.`,
        request_id: key.requestId,
        retry_after: taken.retryAfterSeconds
      }
    })
  })

  const answer = (body: { readonly question: string; readonly thread_id?: string | undefined }) =>
    Effect.gen(function*() {
      const text = body.question.trim()
      if (text === "") return yield* writeV1({ _tag: "Invalid", fields: { question: "empty" } })
      yield* limited
      const frames = withAsk(({ Answer, askTools }) =>
        Answer.send({ text, ...(body.thread_id === undefined ? {} : { threadId: body.thread_id }) }, askTools)
      ).pipe(Stream.provideContext(slices))
      let started: { threadId: string; title: string; question: AskTurn } | undefined
      const last = yield* frames.pipe(
        Stream.tap((f) =>
          Effect.sync(() => {
            if (f._tag === "started") started = { threadId: f.threadId, title: f.title, question: f.question }
          })
        ),
        Stream.filter((f) => f._tag === "settled"),
        Stream.runLast
      )
      if (started === undefined || Option.isNone(last) || last.value._tag !== "settled") {
        return yield* conflict("not_answered")
      }
      return {
        thread_id: started.threadId,
        title: started.title,
        question: turnV1(started.question),
        answer: turnV1(last.value.turn)
      }
    }).pipe(
      Effect.catchTags({
        NotFound: (e) => notFound(e),
        AskBusy: () => conflict("answering"),
        ModelUnavailable: () => conflict("ai_unavailable")
      })
    )

  return {
    ask: (body: { readonly question: string; readonly thread_id?: string | undefined }, key?: string) =>
      // A turn ends inside `TURN_MS`; a claim older than `STALE_MS` held a run the Worker cut off.
      Idempotency.once(key, ["ask", body], answer(body), { inFlightMs: STALE_MS }).pipe(
        Effect.catchTags({
          IdempotencyKeyReused: (e) => writeV1(e),
          IdempotencyInFlight: (e) => writeV1(e)
        })
      ),
    threads: () =>
      ask.list(50).pipe(
        Effect.map((l) => ({
          data: l.rows.map((r) => ({ id: r.id, title: r.title, last_turn_at: iso(r.lastTurnAt) }))
        }))
      ),
    thread: (id: string) => ask.get(id).pipe(Effect.map(threadV1), Effect.catchTag("NotFound", (e) => notFound(e)))
  }
})

/**
 * Vraag Insyte, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class AskV1 extends Context.Service<AskV1, Effect.Success<typeof make>>()("api-worker/AskV1") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(
      Layer.mergeAll(
        AskService.layer,
        OrdersService.layer,
        TicketsService.layer,
        ChargebacksService.layer,
        QueueService.layer,
        AnalyticsService.layer,
        CustomersService.layer,
        KnowledgeService.layer
      )
    )
  )
}
