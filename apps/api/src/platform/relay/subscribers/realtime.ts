import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/** The realtime sink (M5.1): a changed record's kind and ids to its workspace's room; the tabs refetch. */
const realtime = (event: Extract<OutboxEvent, { type: "records.changed" }>) =>
  Effect.promise(() =>
    roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: event.kind, ids: [...event.ids] })
  ).pipe(Effect.withSpan("Relay.realtime"))

export const Realtime = subscriber("realtime", { "records.changed": (_id, event) => realtime(event) })
