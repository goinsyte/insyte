import { Context, Schema } from "effect"

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

/**
 * The undo tokens a request's commands issued, by hash (M15 step 6): an agent's governed action collects the token of
 * the command it ran, so the agent log can spend it later for the person who takes the action back. Absent elsewhere.
 */
export const IssuedUndo = Context.Reference<
  { readonly add: (issued: { readonly hash: string; readonly command: string }) => void } | undefined
>("shared/IssuedUndo", { defaultValue: () => undefined })
