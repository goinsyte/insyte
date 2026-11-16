import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  ChannelChange,
  ChannelIdInput,
  ChannelStatus,
  ChatDraftInput,
  ChatUnavailable,
  ConnectChannelInput,
  HandoverChange,
  ThreadIdInput
} from "@insyte/modules/inbox/domain/Chat"
import {
  AssignInput,
  ComposeInput,
  ConnectInput,
  ForwardInput,
  IdInput,
  IdsInput,
  LabelInput,
  LinkTicketInput,
  ListInput,
  MailboxDisconnected,
  MailboxView,
  MessageQueued,
  NoMailbox,
  ProviderUnavailable,
  ReadInput,
  ReplyInput,
  SignatureInput,
  SnoozeInput,
  StarInput,
  ThreadChange,
  ThreadDetail,
  ThreadList,
  TicketLinked
} from "@insyte/modules/inbox/domain/Inbox"
import { TakenOver, ThreadClosed } from "@insyte/modules/shared/domain/ChatChannel"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Changed = Schema.Union([Forbidden, NotFound])
const Sending = Schema.Union([Forbidden, NotFound, Invalid, MailboxDisconnected])

/**
 * The inbox (M11 steps 1–2): its threads, one thread with its messages, every change the inbox screen makes (with an
 * undo token where the design has one), what the team sends, and the mailboxes. Klantenservice · Bekijken to read,
 * Bewerken to change and send, Beheren for the mailboxes.
 */
export class ThreadsRpcs extends RpcGroup.make(
  Rpc.make("Threads.list", { payload: ListInput, success: ThreadList, error: Forbidden }),
  Rpc.make("Threads.get", { payload: IdInput, success: ThreadDetail, error: Changed }),
  Rpc.make("Threads.markRead", { payload: ReadInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.star", { payload: StarInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.label", { payload: LabelInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.archive", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.spam", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.trash", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.snooze", {
    payload: SnoozeInput,
    success: ThreadChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Threads.putBack", {
    payload: IdsInput,
    success: ThreadChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Threads.assign", { payload: AssignInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.unassign", { payload: IdInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.linkTicket", { payload: LinkTicketInput, success: TicketLinked, error: Changed }),
  // A chat's reply goes to the shopper's widget (M15 step 8): refused while another holds it, or once it closed.
  Rpc.make("Threads.reply", {
    payload: ReplyInput,
    success: MessageQueued,
    error: Schema.Union([Forbidden, NotFound, Invalid, MailboxDisconnected, TakenOver, ThreadClosed])
  }),
  Rpc.make("Threads.forward", { payload: ForwardInput, success: MessageQueued, error: Sending }),
  Rpc.make("Threads.compose", {
    payload: ComposeInput,
    success: MessageQueued,
    error: Schema.Union([Forbidden, NotFound, Invalid, MailboxDisconnected, NoMailbox])
  }),
  Rpc.make("Mailboxes.list", { success: Schema.Array(MailboxView), error: Forbidden }),
  Rpc.make("Mailboxes.connect", {
    payload: ConnectInput,
    success: MailboxView,
    error: Schema.Union([Forbidden, NotFound, Conflict, ProviderUnavailable])
  }),
  Rpc.make("Mailboxes.disconnect", { payload: IdInput, success: MailboxView, error: Changed }),
  Rpc.make("Mailboxes.setDefault", {
    payload: IdInput,
    success: MailboxView,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Mailboxes.setSignature", { payload: SignatureInput, success: MailboxView, error: Changed }),
  // The website chat (M15 step 8): "Overnemen" and "Teruggeven aan Insyte" at Bewerken; the stores' chat channels to
  // read at Klantenservice or Koppelingen · Bekijken, to connect and disconnect at Koppelingen en API · Instellen.
  Rpc.make("Threads.takeOver", { payload: ThreadIdInput, success: HandoverChange, error: Changed }),
  Rpc.make("Threads.handBack", { payload: ThreadIdInput, success: HandoverChange, error: Changed }),
  // The customer agent's draft in a chat (Eerst vragen, Alleen concepten), at Bewerken: one someone was first with
  // is a `Conflict` "gone". "Versturen" is a reply, refused as one is.
  Rpc.make("Threads.sendDraft", {
    payload: ChatDraftInput,
    success: HandoverChange,
    error: Schema.Union([Forbidden, NotFound, Conflict, Invalid, TakenOver, ThreadClosed])
  }),
  Rpc.make("Threads.useDraft", {
    payload: ChatDraftInput,
    success: HandoverChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Threads.discardDraft", {
    payload: ChatDraftInput,
    success: HandoverChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Channels.list", { success: ChannelStatus, error: Forbidden }),
  Rpc.make("Channels.connect", {
    payload: ConnectChannelInput,
    success: ChannelChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, ChatUnavailable])
  }),
  Rpc.make("Channels.disconnect", { payload: ChannelIdInput, success: ChannelChange, error: Changed })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
