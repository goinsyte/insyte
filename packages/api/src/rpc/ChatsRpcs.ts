import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  ActionIdInput,
  ChatList,
  ChatMembers,
  ChatThread,
  CommandRefused,
  ConversationChange,
  ConversationIdInput,
  ConversationRow,
  CreateChannelInput,
  EditInput,
  EmptyMessage,
  MessageChange,
  MessageIdInput,
  MessageRow,
  MessagesInput,
  MessagesPage,
  MuteInput,
  NameTaken,
  NotAMember,
  OpenDmInput,
  OpenSupplierInput,
  PinInput,
  PinMessageInput,
  ReactInput,
  RunCommandInput,
  SendInput
} from "@insyte/modules/chats/domain/Chats"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Missing = Schema.Union([Forbidden, NotFound, NotAMember])

/**
 * Chats (M11 step 4): the conversations, a page of one, a thread, its pins and members; sending, editing, taking back,
 * reacting and pinning; the person's own pin, mute and read position; typing; a new channel, a DM, a supplier's shared
 * channel; and the commands that post an action card. Klantenservice · Bekijken for all of it but a new channel and a
 * pin in a channel (Bewerken); a command takes its own use case's permission too.
 */
export class ChatsRpcs extends RpcGroup.make(
  Rpc.make("Chats.list", { success: ChatList, error: Forbidden }),
  Rpc.make("Chats.messages", { payload: MessagesInput, success: MessagesPage, error: Missing }),
  Rpc.make("Chats.thread", { payload: MessageIdInput, success: ChatThread, error: Missing }),
  Rpc.make("Chats.pinnedMessages", {
    payload: ConversationIdInput,
    success: Schema.Array(MessageRow),
    error: Missing
  }),
  Rpc.make("Chats.members", { payload: ConversationIdInput, success: ChatMembers, error: Missing }),
  Rpc.make("Chats.send", {
    payload: SendInput,
    success: MessageChange,
    error: Schema.Union([Forbidden, NotFound, NotAMember, EmptyMessage, Invalid])
  }),
  Rpc.make("Chats.editMessage", {
    payload: EditInput,
    success: MessageChange,
    error: Schema.Union([Forbidden, NotFound, NotAMember, EmptyMessage])
  }),
  Rpc.make("Chats.deleteMessage", { payload: MessageIdInput, success: MessageChange, error: Missing }),
  Rpc.make("Chats.react", { payload: ReactInput, success: MessageChange, error: Missing }),
  Rpc.make("Chats.pinMessage", { payload: PinMessageInput, success: MessageChange, error: Missing }),
  Rpc.make("Chats.pin", { payload: PinInput, success: ConversationRow, error: Missing }),
  Rpc.make("Chats.mute", { payload: MuteInput, success: ConversationRow, error: Missing }),
  Rpc.make("Chats.markRead", { payload: ConversationIdInput, success: ConversationRow, error: Missing }),
  Rpc.make("Chats.typing", { payload: ConversationIdInput, error: Missing }),
  Rpc.make("Chats.createChannel", {
    payload: CreateChannelInput,
    success: ConversationChange,
    error: Schema.Union([Forbidden, Invalid, NameTaken, NotAMember])
  }),
  Rpc.make("Chats.openDm", {
    payload: OpenDmInput,
    success: ConversationRow,
    error: Schema.Union([Forbidden, NotFound, NotAMember, Invalid])
  }),
  Rpc.make("Chats.openSupplierChannel", {
    payload: OpenSupplierInput,
    success: ConversationRow,
    error: Schema.Union([Forbidden, NotFound, NotAMember, NameTaken])
  }),
  Rpc.make("Chats.runCommand", {
    payload: RunCommandInput,
    success: MessageChange,
    error: Schema.Union([Forbidden, NotFound, NotAMember, CommandRefused])
  }),
  Rpc.make("Chats.confirmAction", {
    payload: ActionIdInput,
    success: MessageChange,
    error: Schema.Union([Forbidden, NotFound, NotAMember, CommandRefused])
  }),
  Rpc.make("Chats.declineAction", {
    payload: ActionIdInput,
    success: MessageChange,
    error: Schema.Union([Forbidden, NotFound, NotAMember, CommandRefused])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
