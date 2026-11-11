import { ChatsRpcs } from "@insyte/api/rpc/ChatsRpcs"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { ChatsService } from "@insyte/modules/chats/Chats"
import { Effect } from "effect"
import { roomOf } from "../../../platform/Room.ts"

export const ChatsHandlers = ChatsRpcs.toLayer(Effect.gen(function*() {
  const chats = yield* ChatsService
  return ChatsRpcs.of({
    "Chats.list": () => chats.list,
    "Chats.messages": (input) => chats.messages(input),
    "Chats.thread": ({ messageId }) => chats.thread(messageId),
    "Chats.pinnedMessages": ({ conversationId }) => chats.pinnedMessages(conversationId),
    "Chats.members": ({ conversationId }) => chats.members(conversationId),
    "Chats.send": (input) => chats.send(input),
    "Chats.editMessage": (input) => chats.edit(input),
    "Chats.deleteMessage": ({ messageId }) => chats.remove(messageId),
    "Chats.react": (input) => chats.react(input),
    "Chats.pinMessage": (input) => chats.pinMessage(input),
    "Chats.pin": (input) => chats.pin(input),
    "Chats.mute": (input) => chats.mute(input),
    "Chats.markRead": ({ conversationId }) => chats.markRead(conversationId),
    // Not stored: the frame goes straight to whoever is in the conversation (a channel's room, a DM's other member).
    "Chats.typing": ({ conversationId: id }) =>
      Effect.gen(function*() {
        const { principalId, to } = yield* chats.typing(id)
        const { workspaceId } = yield* CurrentPrincipal
        const room = roomOf(workspaceId)
        const frame = { v: 1, type: "chat.typing", conversationId: id, principalId } as const
        yield* Effect.promise(async () => {
          if (to === null) await room.broadcast(frame)
          else await Promise.all(to.map((memberId) => room.sendTo(memberId, frame)))
        })
      }),
    "Chats.createChannel": (input) => chats.createChannel(input),
    "Chats.openDm": ({ memberId }) => chats.openDm(memberId),
    "Chats.openSupplierChannel": ({ supplierId }) => chats.openSupplierChannel(supplierId),
    "Chats.runCommand": (input) => chats.runCommand(input),
    "Chats.confirmAction": ({ actionId }) => chats.confirmAction(actionId),
    "Chats.declineAction": ({ actionId }) => chats.declineAction(actionId)
  })
}))
