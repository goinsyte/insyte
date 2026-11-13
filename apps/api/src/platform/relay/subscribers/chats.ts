import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/** The chat sink (M11.4): a conversation's tabs told to refetch it, a channel's whole room or a DM's two members. */
const chat = (event: Extract<OutboxEvent, { type: "chat.posted" }>) =>
  Effect.promise(async () => {
    const room = roomOf(event.workspaceId)
    const frame = {
      v: 1,
      type: event.updated ? "chat.message.updated" : "chat.message",
      conversationId: event.conversationId,
      messageId: event.messageId,
      authorId: event.authorId
    }
    if (event.to === null) await room.broadcast(frame)
    else await Promise.all(event.to.map((memberId) => room.sendTo(memberId, frame)))
  }).pipe(Effect.withSpan("Relay.chat"))

export const Chat = subscriber("chat", { "chat.posted": (_id, event) => chat(event) })
