import { CurrentApiKey } from "@insyte/api/http/Security"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { govern } from "@insyte/modules/agent/Agent"
import { ActionNotAllowed, type AgentEffect } from "@insyte/modules/agent/domain/AgentLog"
import type { ProposalAction } from "@insyte/modules/proposals/domain/Proposals"
import { Effect } from "effect"
import { SqlError } from "effect/sql"

/*
 * An agent's key (M15 step 6, ADR-0027) writes over MCP only within the workspace's autonomy rules: Zelf doen runs and
 * is logged with its way back, Eerst vragen becomes a proposal a person files, Nooit refuses. Each slice's write tools
 * name what they do in a `Plan`; `governed` does the rest.
 */

/** What a write tool needs to go through the autonomy rules, read before it runs (as the agent, with its scopes). */
export interface Plan<A> {
  readonly action: AgentActionId
  readonly amountMinor?: number
  readonly storeId?: string | null
  readonly subject: { readonly type: string; readonly id: string; readonly label: string } | null
  readonly sentence: string
  readonly before?: string | null
  readonly after?: string | null
  readonly ask: ProposalAction | null
  /** What it changed, from what it answered, for the way back after the window. */
  readonly effect: (value: A) => AgentEffect
}

const message = (reason: string | null) =>
  reason === "locked"
    ? "This action always asks first: a person files the proposal in Insyte."
    : "The workspace asks first for this action: a person files the proposal in Insyte."

/**
 * A write tool for an agent's key (M15 step 6, ADR-0027): planned, then run, proposed or refused as the workspace's
 * autonomy rules say, and logged. Any other key runs the tool as before, with nothing read first.
 */
export const governed = <A, E, R, E2, R2>(
  tool: string,
  key: string | undefined,
  plan: Effect.Effect<Plan<A>, E2, R2>,
  run: Effect.Effect<A, E, R>
) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    if (principal.kind !== "agent") return yield* run
    const apiKey = yield* CurrentApiKey
    const p = yield* plan
    const outcome = yield* govern({
      action: p.action,
      amountMinor: p.amountMinor ?? null,
      storeId: p.storeId ?? null,
      subject: p.subject,
      sentence: p.sentence,
      reason: `Gevraagd via MCP met de sleutel ${apiKey.label}.`,
      before: p.before ?? null,
      after: p.after ?? null,
      ask: p.ask,
      trigger: { kind: "mcp", label: `Via MCP · ${apiKey.label}` },
      dedupeKey: key === undefined ? null : `mcp:${apiKey.id}:${tool}:${key}`,
      run: Effect.map(run, (value) => ({ value, effect: p.effect(value) }))
    }).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die),
      Effect.catchIf(
        (e): e is ActionNotAllowed => e instanceof ActionNotAllowed,
        (e) =>
          Effect.fail({
            error: {
              code: "ActionNotAllowedV1" as const,
              message: e.reason === "unknown"
                ? "This action is outside what an agent may do in Insyte."
                : "The workspace does not allow an agent to do this (Nooit).",
              request_id: apiKey.requestId,
              action: e.action,
              reason: e.reason
            }
          })
      )
    )
    if (outcome._tag === "Ran") return outcome.value
    return {
      object: "agent_proposal" as const,
      proposal_id: outcome.proposalId,
      agent_action_id: outcome.agentActionId,
      reason: outcome.reason,
      message: message(outcome.reason)
    }
  })

export const token = (): AgentEffect => ({ kind: "token" })

/**
 * A write tool no agent action names yet (the autonomy catalogue has no entry for it): an agent's key is refused, as an
 * action outside what an agent may do, until the catalogue has one; any other key runs it as before.
 */
export const notForAgents = <A, E, R>(tool: string, run: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    if (principal.kind !== "agent") return yield* run
    const apiKey = yield* CurrentApiKey
    return yield* Effect.fail({
      error: {
        code: "ActionNotAllowedV1" as const,
        message: "This action is outside what an agent may do in Insyte.",
        request_id: apiKey.requestId,
        action: tool,
        reason: "unknown"
      }
    })
  })
