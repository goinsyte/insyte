import { Invalid } from "@insyte/domain/Errors"
import {
  ListNotes,
  NoteCounts,
  NoteIds,
  NotePage,
  NotePrefs,
  NotePrefsChange,
  NotifyPrefsInput,
  QuietHoursEmpty,
  SetNotePref,
  SetRead,
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
    error: Schema.Union([Invalid, QuietHoursEmpty, SlackNotConnected])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
