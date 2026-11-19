import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"
import { told } from "../told.ts"

/** The chat sink (M11.4): a conversation's tabs told to refetch it, a channel's whole room or a DM's two members. */
const chat = (event: Extract<OutboxEvent, { type: "chat.posted" }>) =>
  told("Relay.chat", async () => {
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
  })

export const Chat = subscriber("chat", { "chat.posted": (_id, event) => chat(event) })
