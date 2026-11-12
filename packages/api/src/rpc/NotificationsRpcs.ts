import { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import {
  BeginSlackConnect,
  ListNotes,
  NoteCounts,
  NoteIds,
  NotePage,
  NotePrefs,
  NotePrefsChange,
  NotifyPrefsInput,
  PushDevice,
  PushDeviceId,
  PushNotRegistered,
  PushSubscribe,
  PushTested,
  PushUnavailable,
  QuietHoursEmpty,
  SetNotePref,
  SetRead,
  SlackChannel,
  SlackNotConnected,
  Snooze
} from "@insyte/modules/notifications/domain/Notifications"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The member's notifications (M5.2): the bell, the notifications page and what they hear where (M11 step 13.5). Every member, each
 * their own; never reachable by a key. Writes answer the counts.
 */
export class NotificationsRpcs extends RpcGroup.make(
  Rpc.make("Notifications.list", { payload: ListNotes, success: NotePage }),
  Rpc.make("Notifications.counts", { success: NoteCounts }),
  Rpc.make("Notifications.setRead", { payload: SetRead, success: NoteCounts }),
  Rpc.make("Notifications.markAllRead", { success: NoteCounts }),
  Rpc.make("Notifications.clear", { payload: NoteIds, success: NoteCounts }),
  Rpc.make("Notifications.restore", { payload: NoteIds, success: NoteCounts }),
  Rpc.make("Notifications.snooze", { payload: Snooze, success: NoteCounts, error: Invalid }),
  Rpc.make("Notifications.prefs", { success: NotePrefs }),
  Rpc.make("Notifications.setPref", { payload: SetNotePref, success: NotePrefs, error: Invalid }),
  // The Meldingen page saved whole (M11 step 13.5), with its undo.
  Rpc.make("Notifications.setPrefs", {
    payload: NotifyPrefsInput,
    success: NotePrefsChange,
    error: Schema.Union([Invalid, QuietHoursEmpty, SlackNotConnected, PushNotRegistered])
  }),
  // Web push (M11 step 13.5): the member's own browsers, one subscribed, one let go, and a test message to all.
  Rpc.make("Notifications.pushDevices", { success: Schema.Array(PushDevice) }),
  Rpc.make("Notifications.subscribePush", { payload: PushSubscribe, success: PushDevice, error: PushUnavailable }),
  Rpc.make("Notifications.unsubscribePush", { payload: PushDeviceId, success: Schema.Array(PushDevice) }),
  Rpc.make("Notifications.testPush", {
    success: PushTested,
    error: Schema.Union([PushUnavailable, PushNotRegistered])
  }),
  // Slack (M11 step 13.5): where a member's messages can go; connecting and letting go are Instellingen at Beheren.
  Rpc.make("Notifications.slackChannels", { success: Schema.Array(SlackChannel), error: Conflict }),
  Rpc.make("Notifications.beginSlackConnect", {
    payload: BeginSlackConnect,
    success: Schema.Struct({ authorizeUrl: Schema.String }),
    error: Schema.Union([Forbidden, Conflict])
  }),
  Rpc.make("Notifications.disconnectSlack", { error: Forbidden })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
