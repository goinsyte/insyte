import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type {
  ChatList,
  ChatMembers,
  ChatThread,
  CommandRefused,
  ConversationChange,
  ConversationRow,
  CreateChannelInput,
  EditInput,
  EmptyMessage,
  MessageChange,
  MessageRow,
  MessagesInput,
  MessagesPage,
  MuteInput,
  NameTaken,
  NotAMember,
  PinInput,
  PinMessageInput,
  ReactInput,
  RunCommandInput,
  SendInput
} from "./domain/Chats.ts"
import { ChatCommands } from "./domain/Ports.ts"
import * as Actions from "./use-cases/actions.ts"
import * as Reads from "./use-cases/chats.ts"
import * as Commands from "./use-cases/commands.ts"

type R = Db | CurrentPrincipal
type Missing = Forbidden | NotFound | NotAMember

/**
 * The chats slice (M11 step 4): the team's channels, their DMs and the shared supplier channels; messages with the
 * teammates they name, the records they share and the threads under them; reactions, pins, read positions and typing;
 * and the commands that post an action card. `@Insyte` (`Chats.askInsyte`) is M15, attachments wait for the file store.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class ChatsService extends Context.Service<ChatsService, {
  readonly list: Effect.Effect<ChatList, Forbidden, R>
  readonly messages: (input: typeof MessagesInput.Type) => Effect.Effect<MessagesPage, Missing, R>
  readonly thread: (messageId: string) => Effect.Effect<ChatThread, Missing, R>
  readonly pinnedMessages: (conversationId: string) => Effect.Effect<ReadonlyArray<MessageRow>, Missing, R>
  readonly members: (conversationId: string) => Effect.Effect<ChatMembers, Missing, R>
  readonly send: (
    input: typeof SendInput.Type
  ) => Effect.Effect<MessageChange, Missing | EmptyMessage | Invalid, R>
  readonly edit: (input: typeof EditInput.Type) => Effect.Effect<MessageChange, Missing | EmptyMessage, R>
  readonly remove: (messageId: string) => Effect.Effect<MessageChange, Missing, R>
  readonly react: (input: typeof ReactInput.Type) => Effect.Effect<MessageChange, Missing, R>
  readonly pinMessage: (input: typeof PinMessageInput.Type) => Effect.Effect<MessageChange, Missing, R>
  readonly pin: (input: typeof PinInput.Type) => Effect.Effect<ConversationRow, Missing, R>
  readonly mute: (input: typeof MuteInput.Type) => Effect.Effect<ConversationRow, Missing, R>
  readonly markRead: (conversationId: string) => Effect.Effect<ConversationRow, Missing, R>
  readonly typing: (
    conversationId: string
  ) => Effect.Effect<{ readonly principalId: string; readonly to: ReadonlyArray<string> | null }, Missing, R>
  readonly createChannel: (
    input: typeof CreateChannelInput.Type
  ) => Effect.Effect<ConversationChange, Forbidden | Invalid | NameTaken | NotAMember, R>
  readonly openDm: (memberId: string) => Effect.Effect<ConversationRow, Missing | Invalid, R>
  readonly openSupplierChannel: (supplierId: string) => Effect.Effect<ConversationRow, Missing | NameTaken, R>
  readonly runCommand: (
    input: typeof RunCommandInput.Type
  ) => Effect.Effect<MessageChange, Missing | CommandRefused, R>
  readonly confirmAction: (actionId: string) => Effect.Effect<MessageChange, Missing | CommandRefused, R>
  readonly declineAction: (actionId: string) => Effect.Effect<MessageChange, Missing | CommandRefused, R>
}>()("modules/ChatsService") {
  // A database that does not answer is a defect, as everywhere. The relay and the other slices' commands are taken once.
  static readonly layer = Layer.effect(
    ChatsService,
    Effect.gen(function*() {
      const relay = yield* Effect.service(Relay)
      const commands = yield* Effect.service(ChatCommands)
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(ChatCommands, commands),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: run(Reads.list()),
        messages: (input) => run(Reads.messages(input)),
        thread: (id) => run(Reads.thread(id)),
        pinnedMessages: (id) => run(Reads.pinnedMessages(id)),
        members: (id) => run(Reads.members(id)),
        send: (input) => run(Commands.send(input)),
        edit: (input) => run(Commands.edit(input)),
        remove: (id) => run(Commands.remove(id)),
        react: (input) => run(Commands.react(input)),
        pinMessage: (input) => run(Commands.pinMessage(input)),
        pin: (input) => run(Commands.pin(input)),
        mute: (input) => run(Commands.mute(input)),
        markRead: (id) => run(Commands.markRead(id)),
        typing: (id) => run(Commands.typing(id)),
        createChannel: (input) => run(Commands.createChannel(input)),
        openDm: (id) => run(Commands.openDm(id)),
        openSupplierChannel: (id) => run(Commands.openSupplierChannel(id)),
        runCommand: (input) => run(Actions.runCommand(input)),
        confirmAction: (id) => run(Actions.confirmAction(id)),
        declineAction: (id) => run(Actions.declineAction(id))
      }
    })
  )
}
