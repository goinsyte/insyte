import { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import type { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * What the relay's core (`../Relay.ts`) delivers an event to: a subscriber is one sink, by the name its run is
 * recorded under in `outbox_sinks`, and what it does with each event type it listens to. A slice's subscribers are in
 * `subscribers/<slice>.ts`; `registry.ts` lists them in the order they run (ADR-0041).
 */

export type EventType = OutboxEvent["type"]

/** The outbox event of one type (or of each of a few). */
export type EventOf<T extends EventType> = Extract<OutboxEvent, { readonly type: T }>

/**
 * What a sink does with an event of its type, in the event's workspace and on its transaction; `undefined` when this
 * one is not its business after all (a record kind it does not follow, a resend it does not count).
 */
export type Handler<T extends EventType, R = unknown> = HandlerOf<EventOf<T>, R>

type HandlerOf<E, R> = (id: string, event: E, sql: SqlClient.SqlClient) => Effect.Effect<void, never, R> | undefined

/** A subscriber's handlers, by event type: a key that is not an event type is a type error. */
export type Handlers = { readonly [T in EventType]?: Handler<T> }

export interface Subscriber<On extends Handlers = Handlers> {
  /** The name in `outbox_sinks`: a sink runs once per event. Never renamed, or a retried event runs it again. */
  readonly sink: string
  readonly on: On
}

/** A sink and its handlers. */
export const subscriber = <const On extends Handlers>(
  sink: string,
  on: On & { readonly [K in Exclude<keyof On, EventType>]: never }
): Subscriber<On> => ({ sink, on })

/** The same handler for each of these event types. */
export const onEach = <T extends EventType, R>(
  types: ReadonlyArray<T>,
  handler: Handler<T, R>
): { readonly [K in T]: Handler<K, R> } =>
  Object.fromEntries(types.map((type) => [type, handler])) as unknown as { readonly [K in T]: Handler<K, R> }

/** Every event type the outbox knows, read off its schema. */
const EVENT_TYPES = OutboxEvent.members.map((member) => member.fields.type.literal)

/** One handler for every event type, for a sink that decides by the event itself (which events are public ones). */
export const onEvery = <R>(handler: Handler<EventType, R>): { readonly [K in EventType]: Handler<K, R> } =>
  onEach(EVENT_TYPES, handler)

/** The services a subscriber's handlers need. */
export type ServicesOf<S> = S extends Subscriber<infer On> ? {
    readonly [T in keyof On]: On[T] extends (...args: ReadonlyArray<never>) => infer Run
      ? Effect.Services<Exclude<Run, undefined>>
      : never
  }[keyof On]
  : never
