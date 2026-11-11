import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import type { CommandId, RecordRef } from "./domain/Chats.ts"

/**
 * A command's underlying use case, which another slice owns (widgets/04 §C "Chat action card"): a note on an order, a
 * ticket made from the conversation, a ticket assigned or moved, an order cancelled. Each runs as the person, with its
 * own permission check and its own undo where it has one; what it answers is that undo. The commands with no use case
 * yet (refund from a chat, evidence, accepting a dispute: M13) are absent, so the card says so. Composed where the app
 * is put together.
 */
export interface Ran {
  readonly undo: UndoTicket | null
  /** The record the command made, where it made one (a ticket), for the card to show. */
  readonly made?: RecordRef | undefined
}

/** Why a command did not run, in the card footer's words. */
export class ActionFailed extends Schema.TaggedError<ActionFailed>()("ActionFailed", { message: Schema.String }) {}

export class ChatCommands extends Context.Service<ChatCommands, {
  /** Which commands can run at all, today. */
  readonly available: ReadonlySet<CommandId>
  readonly run: (input: {
    readonly command: CommandId
    readonly target: RecordRef | null
    readonly arg: string | null
    /** The message the command came from, for a ticket's `source_ref`. */
    readonly messageId: string
  }) => Effect.Effect<Ran, ActionFailed, Db | CurrentPrincipal | Relay>
}>()("chats/ChatCommands") {}
