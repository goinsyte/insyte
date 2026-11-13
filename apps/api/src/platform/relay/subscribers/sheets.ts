import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/** The sheets sink (M14 step 4): a changed sheet's version to the tabs of each member who can open it. */
const sheets = (event: Extract<OutboxEvent, { type: "sheet.changed" }>) =>
  Effect.promise(async () => {
    const room = roomOf(event.workspaceId)
    const frame = { v: 1, type: "sheet.changed", sheetId: event.sheetId, version: event.version, by: event.by }
    await Promise.all(event.to.map((memberId) => room.sendTo(memberId, frame)))
  }).pipe(Effect.withSpan("Relay.sheets"))

export const Sheets = subscriber("sheets", { "sheet.changed": (_id, event) => sheets(event) })
