import {
  drainIn,
  drainWorkspace,
  markRecentWorkspace,
  sweepWorkspaces as factsWorkspaces
} from "@insyte/modules/facts/Facts"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { subscriber } from "../Subscriber.ts"

/** The record kinds whose change may touch a day's facts (M10.4): orders and what hangs off them, a store's import. */
const FACTED = new Set(["order", "refund", "fulfilment", "delivery", "store"])

/**
 * The facts sink (M10.4): one batch of the days the change marked recomputed on this transaction; a long first import's
 * remainder is the sweep's.
 */
const facts = (sql: SqlClient.SqlClient) =>
  drainIn(sql).pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Relay.facts"))

/** Batches of days one workspace gets per sweep: a first import of years drains over a few turns, not one. */
const FACTS_BATCHES_PER_SWEEP = 12

/**
 * Every 15 minutes: the days no change drained yet, per workspace; at night (`nightly`) every store's last three days
 * are marked first, which absorbs what no trigger saw (domain.md §10).
 */
export const factsSweep = Effect.fn("Relay.factsSweep")(function*(nightly: boolean) {
  if (nightly) { for (const workspaceId of yield* factsWorkspaces(true)) yield* markRecentWorkspace(workspaceId) }
  for (const workspaceId of yield* factsWorkspaces(false)) yield* drainWorkspace(workspaceId, FACTS_BATCHES_PER_SWEEP)
}, Effect.orDie)

export const Facts = subscriber("facts", {
  "records.changed": (_id, event, sql) => FACTED.has(event.kind) ? facts(sql) : undefined
})
