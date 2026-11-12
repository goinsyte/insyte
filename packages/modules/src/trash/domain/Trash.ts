import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { AreaId } from "@insyte/domain/Permissions"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import type { Actor } from "../../shared/use-cases/Audit.ts"

/*
 * The Prullenbak (M17 step 20.1a; domain.md §16.1, widgets/05 §7.8): what was deleted in the last 30 days, over
 * `trash_items_v`, whatever its slice. Putting an item back is its own slice's command, with that command's undo;
 * purging is irreversible and asks first. Times are epoch milliseconds.
 */

/** Days an item stays in the Prullenbak before the daily sweep purges it (`TRASH_DAYS` in the design). */
export const TRASH_DAYS = 30

/** The kinds the view holds. A kind joins with its `select` in the view and its entry in `TrashKinds`. */
export const TrashKind = Schema.Literals(["ticket"])
export type TrashKind = typeof TrashKind.Type

/** The area each kind belongs to: listing it takes Bekijken there, putting it back Bewerken, purging Beheren. */
export const KIND_AREA: Readonly<Record<TrashKind, AreaId>> = { ticket: "support" }

export const TrashItem = Schema.Struct({
  id: Schema.String,
  kind: TrashKind,
  title: Schema.String,
  /** Who put it in the trash, by name; null where no audit line says. */
  deletedBy: Schema.NullOr(Schema.String),
  deletedAt: Schema.Finite,
  purgeAt: Schema.Finite
})
export type TrashItem = typeof TrashItem.Type

export const TrashList = Schema.Struct({ items: Schema.Array(TrashItem) })
export type TrashList = typeof TrashList.Type

export const TrashIds = Schema.Struct({
  ids: Schema.Array(Schema.String.check(Schema.isMaxLength(80))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500)
  )
})
export type TrashIds = typeof TrashIds.Type

/** What "Terugzetten" answers: the items back, and each kind's undo (spent together by "Ongedaan maken"). */
export const TrashRestored = Schema.Struct({ restored: Schema.Array(Schema.String), undo: Schema.Array(UndoTicket) })
export type TrashRestored = typeof TrashRestored.Type

export const TrashPurged = Schema.Struct({ purged: Schema.Int })
export type TrashPurged = typeof TrashPurged.Type

/** One kind's own commands, as its slice has them. */
export interface TrashKindLinks {
  /** Its slice's put-back, with that slice's policy and audit; answers the undo it issued. */
  readonly restore: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<UndoTicket>, Forbidden | NotFound | SqlError.SqlError, Db | CurrentPrincipal>
  /** Gone for good, on the caller's transaction: the rows, what hangs off them, an audit line each, as `actor`. */
  readonly purge: (
    sql: SqlClient.SqlClient,
    workspaceId: string,
    ids: ReadonlyArray<string>,
    actor: Actor
  ) => Effect.Effect<void, SqlError.SqlError>
}

/**
 * Every kind's commands, by kind. Each slice owns its own; they are put together where the app is composed
 * (`SliceLinks`), so the Prullenbak names no slice.
 */
export class TrashKinds extends Context.Service<TrashKinds, Readonly<Record<TrashKind, TrashKindLinks>>>()(
  "trash/TrashKinds"
) {}
