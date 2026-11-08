import { Context, type Effect, Schema } from "effect"

/*
 * What a committed write tells the rest of the system (M1.3–M1.4): an outbox event per fact, written in the use case's
 * transaction, so it exists exactly when the write does. Payloads hold ids and enums only: a sink reads what it needs
 * from the database, as of when it runs.
 */

export const OutboxEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("workspace.created"), workspaceId: Schema.String, userId: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("onboarding.step_completed"),
    workspaceId: Schema.String,
    userId: Schema.String,
    step: Schema.String
  }),
  // The invitation's mail, once the undo window has passed; the round says which link it carries.
  Schema.Struct({
    type: Schema.Literal("member.invited"),
    workspaceId: Schema.String,
    invitationId: Schema.String,
    /** The inviting member, and their person for analytics. */
    invitedBy: Schema.String,
    userId: Schema.String,
    round: Schema.Int
  })
])
export type OutboxEvent = typeof OutboxEvent.Type

/**
 * The relay, as a port: after the transaction commits, the use case hands it the outbox ids it wrote, and the relay
 * delivers them now rather than at the next sweep (the minute cron catches anything a kick missed).
 */
export class Relay extends Context.Service<Relay, {
  /** `afterSeconds`: the events wait out an undo window (`outbox.not_before`), so the queue holds them that long. */
  readonly kick: (outboxIds: ReadonlyArray<string>, options?: { readonly afterSeconds?: number }) => Effect.Effect<void>
}>()("shared/Relay") {}
