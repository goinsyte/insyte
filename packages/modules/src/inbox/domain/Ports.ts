import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * What the inbox needs of another slice (architecture.md: never its use-cases/), implemented where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`).
 */

/**
 * "Aan ticket koppelen": a ticket made from a thread, on the inbox's transaction, and taken away again on Undo.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class ThreadTickets extends Context.Service<ThreadTickets, {
  readonly make: (sql: SqlClient.SqlClient, input: {
    readonly title: string
    readonly description: string
    readonly threadId: string
    readonly customerId: string | null
  }) => Effect.Effect<{ readonly id: string; readonly number: number }, SqlError.SqlError, CurrentPrincipal>
  readonly remove: (
    sql: SqlClient.SqlClient,
    ticketId: string
  ) => Effect.Effect<void, SqlError.SqlError, CurrentPrincipal>
  /** The ticket's number, where it exists and the caller may see it. */
  readonly numberOf: (
    sql: SqlClient.SqlClient,
    ticketId: string
  ) => Effect.Effect<number | undefined, SqlError.SqlError, CurrentPrincipal>
}>()("inbox/ThreadTickets") {}
