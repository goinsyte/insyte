import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * What the quality slice needs of another slice (architecture.md: never its use-cases/), implemented where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`).
 */

/**
 * "Ticket met {leverancier} openen" on a rejection: a ticket on the board, in the product's store, on the verdict's
 * transaction, and taken away again by the verdict's Undo.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class QualityTickets extends Context.Service<QualityTickets, {
  readonly make: (sql: SqlClient.SqlClient, input: {
    readonly title: string
    readonly description: string
    readonly storeId: string
  }) => Effect.Effect<{ readonly id: string; readonly number: number }, SqlError.SqlError, CurrentPrincipal>
  readonly remove: (
    sql: SqlClient.SqlClient,
    ticketId: string
  ) => Effect.Effect<void, SqlError.SqlError, CurrentPrincipal>
}>()("quality/QualityTickets") {}
