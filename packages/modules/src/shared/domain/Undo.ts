import { Context, Schema } from "effect"

/*
 * Undo as a server window (ADR-0023, api.md §1): a reversible command answers `undo: { token, until }`, and
 * `Shared.undo(token)` runs its compensation as a command of its own, audited. What the command sends outside Insyte
 * waits in the outbox until `until`; the undo cancels it there, so nothing leaves.
 */

/** How long a write that reaches outside Insyte waits, so "Ongedaan maken" (six seconds) can still cancel it. */
export const UNDO_SECONDS = 8

/**
 * The window a command's undo token keeps, and what it sends waits out in the outbox before it leaves: a toast's
 * `UNDO_SECONDS`, or the five minutes the agent log gives an action the agent ran on its own (M15 step 6, ADR-0027: a
 * send is written with `not_before = now + window`, so taking it back from the log means it never left).
 */
export const UndoWindow = Context.Reference<number>("shared/UndoWindow", { defaultValue: () => UNDO_SECONDS })

/**
 * How much sooner than its token the agent log's "Ongedaan maken" closes: a person who clicks in the last second
 * still finds the token there, and what it held back still waiting.
 */
export const LOG_MARGIN_MS = 5_000

/** The agent log's window for an issued token: the token's own end, less the margin. */
export const logUntil = (token: { readonly until: number }) => new Date(token.until - LOG_MARGIN_MS)

/** What a reversible write answers: the token for `Shared.undo`, and until when it holds. */
export const UndoTicket = Schema.Struct({ token: Schema.String, until: Schema.Finite })
export type UndoTicket = typeof UndoTicket.Type

/**
 * The undo tokens a request's commands issued, by hash (M15 step 6): an agent's governed action collects the token of
 * the command it ran, so the agent log can spend it later for the person who takes the action back. Absent elsewhere.
 */
export const IssuedUndo = Context.Reference<
  | {
    readonly add: (issued: { readonly hash: string; readonly command: string; readonly until: number }) => void
  }
  | undefined
>("shared/IssuedUndo", { defaultValue: () => undefined })
