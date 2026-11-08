import { Invalid } from "@insyte/domain/Errors"
import {
  ListNotes,
  NoteCounts,
  NoteIds,
  NotePage,
  NotePrefs,
  SetNotePref,
  SetRead,
  Snooze
} from "@insyte/modules/notifications/domain/Notifications"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The member's notifications (M5.2): the bell, the notifications page and the in-app switches. Every member, each
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
  Rpc.make("Notifications.setPref", { payload: SetNotePref, success: NotePrefs, error: Invalid })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
