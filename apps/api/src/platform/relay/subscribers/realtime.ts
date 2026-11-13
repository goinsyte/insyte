import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { roomOf, supplierRoomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/** The realtime sink (M5.1): a changed record's kind and ids to its workspace's room; the tabs refetch. */
const realtime = (event: Extract<OutboxEvent, { type: "records.changed" }>) =>
  Effect.promise(() =>
    roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: event.kind, ids: [...event.ids] })
  ).pipe(Effect.withSpan("Relay.realtime"))

/** A supplier portal's record changed (M16): the same frame, to that supplier's room only. */
const partner = (event: Extract<OutboxEvent, { type: "partner.changed" }>) =>
  Effect.promise(() =>
    supplierRoomOf(event.workspaceId, event.supplierId).broadcast({
      v: 1,
      type: "records.changed",
      kind: event.kind,
      ids: [...event.ids]
    })
  ).pipe(Effect.withSpan("Relay.realtime.partner"))

/** A contact's access revoked (M16): its portal tabs closed; reconnecting is refused, as every call is. */
const revoked = (event: Extract<OutboxEvent, { type: "supplier.contact_revoked" }>) =>
  Effect.promise(() => supplierRoomOf(event.workspaceId, event.supplierId).closeMember(event.contactId)).pipe(
    Effect.withSpan("Relay.realtime.revoked")
  )

export const Realtime = subscriber("realtime", {
  "records.changed": (_id, event) => realtime(event),
  "partner.changed": (_id, event) => partner(event),
  "supplier.contact_revoked": (_id, event) => revoked(event)
})
