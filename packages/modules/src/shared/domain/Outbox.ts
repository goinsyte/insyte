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
  })
])
export type OutboxEvent = typeof OutboxEvent.Type

/**
 * The relay, as a port: after the transaction commits, the use case hands it the outbox ids it wrote, and the relay
 * delivers them now rather than at the next sweep (the minute cron catches anything a kick missed).
 */
export class Relay extends Context.Service<Relay, {
  readonly kick: (outboxIds: ReadonlyArray<string>) => Effect.Effect<void>
}>()("shared/Relay") {}
