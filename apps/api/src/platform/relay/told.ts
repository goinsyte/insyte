import { Effect } from "effect"

/**
 * A frame to a room (`../Room.ts`) from a sink, best-effort (W13.6): a tab that misses one refetches after its gap, so
 * a room that fails (a reset after a deploy, an overload) is a warning in the log, never the event's delivery failing
 * or being tried again. Closing a person's sockets is not this: their access ended, so that one still fails the event.
 */
export const told = (span: string, send: () => Promise<unknown>) =>
  Effect.tryPromise(send).pipe(
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.logWarning("realtime: a room was not told; its tabs refetch later", { span, cause })
    ),
    Effect.withSpan(span)
  )
