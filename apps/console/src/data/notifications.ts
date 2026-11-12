import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { NotePrefs } from "@insyte/modules/notifications/domain/Notifications"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { NOTES } from "./frame.ts"

/*
 * Instellingen → Meldingen (M11 step 13.5): the member's settings, primed by the route's loader and carried in the
 * document; saving names `NOTES`, so the bell's switches read again with them. The member's browsers with push and
 * the workspace's Slack channels are read in the browser; turning push on or off, and connecting or letting go of
 * Slack, name `NOTES` too, so the page's channel states read again.
 */

export const notifySettingsAtom = Atom.serializable(
  ConsoleClient.query("Notifications.prefs", undefined, { reactivityKeys: NOTES }),
  {
    key: "notify-settings",
    schema: AsyncResult.Schema({
      success: NotePrefs,
      error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const pushDevicesAtom = ConsoleClient.query("Notifications.pushDevices", undefined, { reactivityKeys: NOTES })

export const slackChannelsAtom = ConsoleClient.query("Notifications.slackChannels", undefined, {
  reactivityKeys: NOTES
})

export const notifyWrites = {
  setPrefs: ConsoleClient.mutation("Notifications.setPrefs"),
  undo: ConsoleClient.mutation("Shared.undo"),
  subscribePush: ConsoleClient.mutation("Notifications.subscribePush"),
  unsubscribePush: ConsoleClient.mutation("Notifications.unsubscribePush"),
  testPush: ConsoleClient.mutation("Notifications.testPush"),
  beginSlackConnect: ConsoleClient.mutation("Notifications.beginSlackConnect"),
  disconnectSlack: ConsoleClient.mutation("Notifications.disconnectSlack")
} as const
