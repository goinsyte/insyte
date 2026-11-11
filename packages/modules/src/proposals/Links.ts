import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import type { ProposalAction } from "./domain/Proposals.ts"

/** What a filed plate's command answered: its undo, whether it still has to leave (a mail in line), and whether its
 * queue row's condition ends with it (an approval) or stands (a mail sent, a ticket opened: the row is decided). */
export interface Ran {
  readonly undo: UndoTicket | null
  readonly pending: boolean
  readonly settles: boolean
}

/**
 * What filing a proposal asks of the rest of the app (ADR-0014): the command a person's button runs, as that person,
 * with their permissions checked by the command itself; and the queue brought in line on the same transaction, so the
 * row settles as the plate is filed. The proposals slice names no other slice; this is composed where the app is put
 * together (`SliceLinks`). A command refused because its record moved on answers `stale`.
 */
export class ProposalLinks extends Context.Service<ProposalLinks, {
  readonly run: (
    action: ProposalAction
  ) => Effect.Effect<Ran | "stale", Forbidden | NotFound | SqlError.SqlError, Db | CurrentPrincipal | Relay>
  readonly refreshQueue: (sql: SqlClient.SqlClient) => Effect.Effect<boolean, SqlError.SqlError>
  /** The row decided by the filer, where the command leaves its condition standing. */
  readonly decideRow: (
    sql: SqlClient.SqlClient,
    queueItemId: string
  ) => Effect.Effect<void, SqlError.SqlError, CurrentPrincipal>
}>()("proposals/ProposalLinks") {}
