import { Schema } from "effect"

/*
 * Undo as a server window (ADR-0023, api.md §1): a reversible command answers `undo: { token, until }`, and
 * `Shared.undo(token)` runs its compensation as a command of its own, audited. What the command sends outside Insyte
 * waits in the outbox until `until`; the undo cancels it there, so nothing leaves.
 */

/** How long a write that reaches outside Insyte waits, so "Ongedaan maken" (six seconds) can still cancel it. */
export const UNDO_SECONDS = 8

/** What a reversible write answers: the token for `Shared.undo`, and until when it holds. */
export const UndoTicket = Schema.Struct({ token: Schema.String, until: Schema.Finite })
export type UndoTicket = typeof UndoTicket.Type
