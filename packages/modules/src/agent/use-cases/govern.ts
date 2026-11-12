import { Db } from "@insyte/database/Db"
import { AGENT_ACTION, AGENT_UNDO_SECONDS, type AgentActionId } from "@insyte/domain/AgentActions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlError } from "effect/sql"
import type { ProposalAction } from "../../proposals/domain/Proposals.ts"
import { proposeIn } from "../../proposals/Proposals.ts"
import { IssuedUndo } from "../../shared/domain/Undo.ts"
import { ActionNotAllowed, type AgentEffect } from "../domain/AgentLog.ts"
import { decide } from "./autonomy.ts"
import { record, seen } from "./log.ts"

/*
 * An agent's action under the workspace's autonomy rules (M15 step 6; ADR-0027): `Autonomy.decide` first, then one
 * of three. Nooit (or outside the catalogue): nothing happens, the refusal is logged, and the agent hears why. Eerst
 * vragen (or a locked action, a limit reached, the agent switched off): a proposal a person files, with their own
 * permissions. Zelf doen: the command runs as the agent, and the log keeps what it changed with its undo token for
 * five minutes. A principal that is no agent (an integration's key) acts as before, ungoverned.
 */

export interface Governed<A, E, R> {
  readonly action: AgentActionId
  /** What the action moves, in minor units, where it moves money (a refund): held against the action's limit. */
  readonly amountMinor: number | null
  readonly storeId: string | null
  readonly subject: { readonly type: string; readonly id: string; readonly label: string } | null
  /** One line in Dutch, as the log and the proposal say it ("Status van T-12 op Opgelost gezet"). */
  readonly sentence: string
  readonly reason: string
  readonly before: string | null
  readonly after: string | null
  /** The command a person files, where it asks first; also what "Toch laten staan" runs again. */
  readonly ask: ProposalAction | null
  readonly trigger: { readonly kind: string; readonly label: string }
  /** The touchpoint: a retried call with the same key is recorded once. */
  readonly dedupeKey: string | null
  readonly run: Effect.Effect<{ readonly value: A; readonly effect: AgentEffect }, E, R>
}

export type Outcome<A> =
  | { readonly _tag: "Ran"; readonly value: A }
  | {
    readonly _tag: "Proposed"
    readonly proposalId: string
    readonly agentActionId: string
    readonly reason: string | null
  }

const PROPOSAL_DAYS = 7

const why = (reason: string | null) => {
  switch (reason) {
    case "locked":
      return "Deze actie kan niet worden teruggedraaid en vraagt daarom altijd eerst."
    case "limit":
      return "De limiet voor Zelf doen is bereikt; daarom vraagt de agent het eerst."
    case "budget":
      return "Het AI-budget van deze maand is op; daarom vraagt de agent het eerst."
    case "disabled":
      return "De agent staat uit; daarom vraagt hij het eerst."
    default:
      return "Zelfstandigheid staat voor deze actie op Eerst vragen."
  }
}

const tagOf = (e: unknown) =>
  typeof e === "object" && e !== null && "_tag" in e && typeof e._tag === "string" ? e._tag : "failed"

export const govern = <A, E, R>(
  g: Governed<A, E, R>
): Effect.Effect<Outcome<A>, E | ActionNotAllowed | SqlError.SqlError, R | Db | CurrentPrincipal> =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    if (principal.kind !== "agent") return { _tag: "Ran" as const, value: (yield* g.run).value }
    const db = yield* Db

    const base = {
      action: g.action,
      input: g.ask,
      storeId: g.storeId,
      subject: g.subject,
      trigger: g.trigger,
      reason: g.reason,
      sentence: g.sentence,
      before: g.before,
      after: g.after,
      dedupeKey: g.dedupeKey
    }

    const first = yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const earlier = g.dedupeKey === null ? undefined : yield* seen(sql, g.dedupeKey)
        return { earlier, decision: earlier === undefined ? yield* decide(sql, g.action, g.amountMinor) : null }
      })
    )
    // The same call again: what it answered the first time. A run repeats through the command's own idempotency.
    if (first.earlier !== undefined) {
      const e = first.earlier
      if (e.outcome === "proposed" && e.proposalId !== null) {
        return { _tag: "Proposed" as const, proposalId: e.proposalId, agentActionId: e.id, reason: e.refuseReason }
      }
      if (e.outcome === "refused") {
        return yield* new ActionNotAllowed({ action: g.action, reason: e.refuseReason ?? "policy" })
      }
      return { _tag: "Ran" as const, value: (yield* g.run).value }
    }
    const d = first.decision!

    if (d.decision === "refuse") {
      yield* db.scoped((sql) =>
        record(sql, {
          ...base,
          policyVersion: d.policyVersion,
          level: d.level,
          decision: "refuse",
          refuseReason: d.reason,
          effect: null,
          outcome: "refused",
          error: null,
          proposalId: null,
          undo: null
        })
      )
      return yield* new ActionNotAllowed({ action: g.action, reason: d.reason ?? "policy" })
    }

    if (d.decision === "propose") {
      if (g.ask === null || g.subject === null) {
        return yield* new ActionNotAllowed({ action: g.action, reason: d.reason ?? "policy" })
      }
      const ask = g.ask
      const subject = g.subject
      return yield* db.scoped((sql) =>
        Effect.gen(function*() {
          const proposalId = yield* proposeIn(sql, {
            number: subject.label,
            storeId: g.storeId,
            area: AGENT_ACTION[g.action].area,
            subjectType: subject.type,
            subjectId: subject.id,
            action: ask,
            dedupeKey: `agent:${g.action}:${subject.id}:${JSON.stringify(ask)}`,
            expiresAt: new Date(Date.now() + PROPOSAL_DAYS * 86_400_000),
            heading: g.sentence,
            body: `${g.trigger.label} vraagt dit. ${why(d.reason)}`,
            dimension: "",
            before: { label: "Nu", value: g.before ?? "—" },
            after: { label: "Daarna", value: g.after ?? g.sentence },
            change: g.sentence,
            witness: g.trigger.label,
            confidence: 0,
            confidenceBasis: "Gevraagd door een agent; Insyte heeft het niet zelf beoordeeld.",
            fileLabel: "Uitvoeren",
            why: g.reason,
            evidence: []
          })
          const agentActionId = yield* record(sql, {
            ...base,
            policyVersion: d.policyVersion,
            level: d.level,
            decision: "propose",
            refuseReason: d.reason,
            effect: null,
            outcome: "proposed",
            error: null,
            proposalId,
            undo: null
          })
          return { _tag: "Proposed" as const, proposalId, agentActionId, reason: d.reason }
        })
      )
    }

    // Zelf doen: the command as the agent, its undo token kept for the log.
    const issued: Array<{ readonly hash: string; readonly command: string }> = []
    const ran = yield* g.run.pipe(
      Effect.provideService(IssuedUndo, { add: (t) => void issued.push(t) }),
      Effect.tapError((e) =>
        db.scoped((sql) =>
          record(sql, {
            ...base,
            policyVersion: d.policyVersion,
            level: d.level,
            decision: "run",
            refuseReason: null,
            effect: null,
            outcome: "failed",
            error: tagOf(e),
            proposalId: null,
            undo: null
          })
        ).pipe(Effect.orDie)
      )
    )
    const token = issued[0]
    yield* db.scoped((sql) =>
      record(sql, {
        ...base,
        policyVersion: d.policyVersion,
        level: d.level,
        decision: "run",
        refuseReason: null,
        effect: ran.effect,
        outcome: "done",
        error: null,
        proposalId: null,
        undo: token === undefined ? null : { hash: token.hash, until: new Date(Date.now() + AGENT_UNDO_SECONDS * 1000) }
      })
    )
    return { _tag: "Ran" as const, value: ran.value }
  })
