import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { ProposalAction } from "../proposals/domain/Proposals.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { AgentEffect } from "./domain/AgentLog.ts"

type Refusal = Forbidden | NotFound | Conflict | SqlError.SqlError

/**
 * Where the agent log meets the slices that own what an agent did (M15 step 6). Each runs as the person in the
 * request, with their permissions and audit: the action's own compensation inside the window, the catalogue's
 * compensation after it, and the action itself again ("Toch laten staan"). Put together where the app is composed.
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class AgentLinks extends Context.Service<AgentLinks, {
  /** The compensation the action's undo token holds, by the command it was issued under, on the undo's transaction. */
  readonly takeBack: (
    sql: SqlClient.SqlClient,
    command: string,
    compensation: unknown
  ) => Effect.Effect<void, Refusal, CurrentPrincipal>
  /** What a person runs by hand once the window is over: the opposite command, as theirs. */
  readonly compensate: (effect: AgentEffect) => Effect.Effect<void, Refusal, Db | CurrentPrincipal | Relay>
  /** The action again, as the person: "Toch laten staan" after taking it back. */
  readonly rerun: (action: ProposalAction) => Effect.Effect<void, Refusal, Db | CurrentPrincipal | Relay>
}>()("agent/AgentLinks") {}
