import { Db } from "@insyte/database/Db"
import type { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { factsOf, isCurrentRun } from "../../chargebacks/Chargebacks.ts"
import { type CaseFacts, narrativeOf } from "../../chargebacks/domain/Pack.ts"
import { PROVIDER_NAME } from "../../chargebacks/domain/Rules.ts"
import { AiModel, type BudgetExceeded, type ModelUnavailable } from "../domain/Ai.ts"
import { untracedFigures } from "../domain/Guards.ts"
import { narrativePrompt } from "../prompts/narrative.ts"
import { topicPrompt } from "../prompts/topic.ts"
import { call, type InTx } from "./call.ts"

/*
 * What Insyte AI does in the background, without a person (M15 step 2): a new or retitled ticket's topic, and an
 * evidence pack's account. Both have a deterministic answer already (the keyword rules, the facts' sentences), so a
 * model that is not set up, a budget that is spent, or an answer that fails its checks leaves that answer standing.
 * Their calls count against the workspace's budget, as the background's (`member_id` null).
 */

const background = (subject: { readonly type: string; readonly id: string }) => ({
  memberId: null,
  principalKind: "system",
  subject
})

/** A failure that leaves the deterministic answer standing, said in the logs. */
const kept = (what: string) => (error: BudgetExceeded | ModelUnavailable) =>
  Effect.as(Effect.logInfo(`${what}: the rules' answer stands`, { reason: error._tag }), undefined)

/**
 * A ticket's topic by the model, where one is set up; the keyword rules' stays otherwise. On the fake (tests, local
 * runs) the call is made and metered, and its answer, the rules' own, changes nothing.
 */
export const classifyTicket = Effect.fn("Ai.classifyTicket")(function*(ticketId: string) {
  const model = yield* AiModel
  if (!model.ready) return "skipped" as const
  const db = yield* Db
  const inTx: InTx<CurrentWorkspace> = db.scopedFor
  const [t] = yield* inTx((sql) =>
    sql<{ title: string; description: string }>`
      select title, description from tickets where id = ${ticketId} and deleted_at is null`
  )
  if (t === undefined) return "skipped" as const
  const called = yield* call(inTx, background({ type: "ticket", id: ticketId }), topicPrompt, t).pipe(
    Effect.catchTags({ BudgetExceeded: kept("ticket topic"), ModelUnavailable: kept("ticket topic") })
  )
  if (called === undefined || model.provider === "fake") return "kept" as const
  // Only while the ticket still says what was classified: a newer title is classified by its own event.
  yield* inTx((sql) =>
    sql`update tickets set topic = ${called.value.topic}, topic_source = 'model'
        where id = ${ticketId} and title = ${t.title} and description = ${t.description}
          and (topic is distinct from ${called.value.topic} or topic_source <> 'model')`
  )
  return "classified" as const
})

/** The facts as the model reads them: no address, no card, the customer as "de klant" (ai.md §6.4). */
const redacted = (f: CaseFacts): CaseFacts => ({
  ...f,
  customerName: "De klant",
  customerEmail: null,
  order: f.order === null ? null : { ...f.order, cardLast4: null, address: [] }
})

/**
 * An evidence pack's account by the model (`EvidencePackWorkflow`'s `narrative` step, after the plan): the facts'
 * sentences rewritten for the reviewer. Every figure must be in the facts, or the facts' sentences stand.
 */
export const writeNarrative = Effect.fn("Ai.writeNarrative")(function*(chargebackId: string, runId: string) {
  const model = yield* AiModel
  // The fake's account is the facts' own sentences: the pack has them already.
  if (!model.ready || model.provider === "fake") return "skipped" as const
  const db = yield* Db
  const inTx: InTx<CurrentWorkspace> = db.scopedFor
  const input = yield* inTx((sql: SqlClient.SqlClient) =>
    Effect.gen(function*() {
      if (!(yield* isCurrentRun(sql, chargebackId, runId))) return undefined
      const facts = yield* factsOf(sql, chargebackId)
      if (facts === undefined) return undefined
      return {
        provider: PROVIDER_NAME[facts.provider],
        reasonLabel: facts.reasonLabel,
        facts: narrativeOf(redacted(facts))
      }
    })
  )
  if (input === undefined) return "skipped" as const
  const given = `${input.provider} ${input.reasonLabel} ${input.facts}`
  const called = yield* call(inTx, background({ type: "chargeback", id: chargebackId }), narrativePrompt, input, {
    guard: (o) => o.text.trim() !== "" && untracedFigures(o.text, given).length === 0
  }).pipe(
    Effect.catchTags({ BudgetExceeded: kept("evidence narrative"), ModelUnavailable: kept("evidence narrative") })
  )
  if (called === undefined) return "kept" as const
  yield* inTx((sql) =>
    Effect.gen(function*() {
      if (!(yield* isCurrentRun(sql, chargebackId, runId))) return
      yield* sql`update evidence_packs set narrative_text = ${called.value.text.trim()}
                 where chargeback_id = ${chargebackId} and run_id = ${runId}`
    })
  )
  return "written" as const
})
