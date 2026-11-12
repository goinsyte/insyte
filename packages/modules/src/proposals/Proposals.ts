import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { SqlClient } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { ProposalChange, ProposalClosed, ProposalStale, ProposalView } from "./domain/Proposals.ts"
import { ProposalLinks } from "./Links.ts"
import * as Proposals from "./use-cases/proposals.ts"
import * as Proposer from "./use-cases/proposer.ts"

type R = Db | CurrentPrincipal

/**
 * Plates and proposals (M10.2; ADR-0014): what Insyte drew for a queue row, and the person's decision on it. Filing
 * runs the command the plate carries as that person (`ProposalLinks`); setting it aside and filing both have Undo;
 * drawing again adds a revision. The plates themselves are drawn by `drawIn` on the queue's refresh.
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class ProposalsService extends Context.Service<ProposalsService, {
  readonly get: (id: string) => Effect.Effect<ProposalView, NotFound, R>
  readonly file: (
    id: string
  ) => Effect.Effect<ProposalChange, NotFound | Forbidden | ProposalClosed | ProposalStale, R | Relay>
  readonly discard: (id: string) => Effect.Effect<ProposalChange, NotFound | ProposalClosed, R>
  readonly redraw: (id: string) => Effect.Effect<ProposalChange, NotFound | ProposalClosed | ProposalStale, R>
}>()("modules/ProposalsService") {
  // A database that does not answer is a defect, as everywhere. The links are the app's, fixed when it is composed.
  static readonly layer = Layer.effect(
    ProposalsService,
    Effect.map(Effect.service(ProposalLinks), (links) => ({
      get: (id) => Proposals.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      file: (id) =>
        Proposals.file(id).pipe(
          Effect.provideService(ProposalLinks, links),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        ),
      discard: (id) => Proposals.discard(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
      redraw: (id) => Proposals.redraw(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
    }))
  )
}

/** The plates brought in line with the queue's live rows, on its refresh transaction; whether anything changed. */
export const drawIn: (
  sql: SqlClient.SqlClient,
  rows: ReadonlyArray<Proposer.Drawable>
) => Effect.Effect<boolean, SqlError.SqlError> = Proposer.drawIn

/** The open plates for these queue rows, by row. */
export const openFor: (
  sql: SqlClient.SqlClient,
  queueItemIds: ReadonlyArray<string>
) => Effect.Effect<ReadonlyMap<string, ProposalView>, SqlError.SqlError> = Proposals.openFor

/** A queue row seen: its open plate set aside with it; the plate's id, or `null`. */
export const discardIn: (
  sql: SqlClient.SqlClient,
  queueItemId: string
) => Effect.Effect<string | null, SqlError.SqlError, CurrentPrincipal> = Proposals.discardIn

/** A queue row opened again: the plate its "seen" set aside, open again. */
export const reopenIn: (sql: SqlClient.SqlClient, queueItemId: string) => Effect.Effect<void, SqlError.SqlError> =
  Proposals.reopenIn

/** The relay's word on a filed plate whose command sent later: executed, or failed with why; the failed plates' rows. */
export const settleSent: (
  sql: SqlClient.SqlClient,
  subject: { readonly type: string; readonly id: string; readonly action: ProposalView["action"]["_tag"] },
  error: string | null
) => Effect.Effect<ReadonlyArray<string>, SqlError.SqlError> = Proposals.settleSent

/** `Shared.undo` for `proposals.restore`, given how to run the command's own compensation and refresh the queue. */
export const restore: (
  sql: SqlClient.SqlClient,
  compensation: unknown,
  deps: Parameters<typeof Proposals.restore>[2]
) => Effect.Effect<void, Forbidden | NotFound | Conflict | SqlError.SqlError, CurrentPrincipal> = Proposals.restore

/** A plate for what an agent asked first (origin `agent`), on the caller's transaction; its id (M15 step 6). */
export const proposeIn: (
  sql: SqlClient.SqlClient,
  draft: Proposer.Draft
) => Effect.Effect<string, SqlError.SqlError> = Proposals.proposeIn

export type { Draft as ProposalDraft } from "./use-cases/proposer.ts"
