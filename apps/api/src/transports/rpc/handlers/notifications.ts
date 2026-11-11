import { NotificationsRpcs } from "@insyte/api/rpc/NotificationsRpcs"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { Effect } from "effect"

export const NotificationsHandlers = NotificationsRpcs.toLayer(Effect.gen(function*() {
  const notes = yield* NotificationsService
  return NotificationsRpcs.of({
    "Notifications.list": (input) => notes.list(input),
    "Notifications.counts": () => notes.counts,
    "Notifications.setRead": (input) => notes.setRead(input),
    "Notifications.markAllRead": () => notes.markAllRead,
    "Notifications.clear": ({ ids }) => notes.clear(ids),
    "Notifications.restore": ({ ids }) => notes.restore(ids),
    "Notifications.snooze": (input) => notes.snooze(input),
    "Notifications.prefs": () => notes.prefs,
    "Notifications.setPref": (input) => notes.setPref(input),
    "Notifications.setPrefs": (input) => notes.setPrefs(input)
  })
}))
