import { NotificationsRpcs } from "@insyte/api/rpc/NotificationsRpcs"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { Config, Effect } from "effect"

/** Where Slack sends the operator back: the console's origin, which forwards `/api/*` here. */
export const SLACK_CALLBACK_PATH = "/api/connect/slack/callback"

export const NotificationsHandlers = NotificationsRpcs.toLayer(Effect.gen(function*() {
  const notes = yield* NotificationsService
  const origin = yield* Config.String("CONSOLE_ORIGIN")
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
    "Notifications.setPrefs": (input) => notes.setPrefs(input),
    "Notifications.pushDevices": () => notes.pushDevices,
    "Notifications.subscribePush": (input) => notes.subscribePush(input),
    "Notifications.unsubscribePush": ({ id }) => notes.unsubscribePush(id),
    "Notifications.testPush": () => notes.testPush,
    "Notifications.slackChannels": () => notes.slackChannels,
    "Notifications.beginSlackConnect": ({ returnPath }) =>
      notes.beginSlackConnect(returnPath, `${origin}${SLACK_CALLBACK_PATH}`),
    "Notifications.disconnectSlack": () => notes.disconnectSlack
  })
}))
