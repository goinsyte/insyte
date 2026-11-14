import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { NotePrefs, type NoteTab } from "@insyte/modules/notifications/domain/Notifications"
import { Schema } from "effect"
import { AsyncResult, Atom, Reactivity } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { NOTES } from "./frame.ts"

/*
 * Instellingen → Meldingen (M11 step 13.5): the member's settings, primed by the route's loader and carried in the
 * document; saving names `NOTES`, so the bell's switches read again with them. The member's browsers with push and
 * the workspace's Slack channels are read in the browser; turning push on or off, and connecting or letting go of
 * Slack, name `NOTES` too, so the page's channel states read again.
 *
 * The notifications page (PLAN 10) reads each tab, as many rows as it has asked for so far; every write there names
 * `NOTES`, so the bell, the panel and the page read again together.
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

/** One tab of the notifications page, `<tab>:<rows>`: the newest that many. */
export const noteTabAtom = Atom.family((key: `${NoteTab}:${number}`) => {
  const [tab, limit] = key.split(":") as [NoteTab, string]
  return ConsoleClient.query("Notifications.list", { tab, cursor: null, limit: Number(limit) }, {
    reactivityKeys: NOTES
  })
})

export const noteWrites = {
  setRead: ConsoleClient.mutation("Notifications.setRead"),
  clear: ConsoleClient.mutation("Notifications.clear"),
  restore: ConsoleClient.mutation("Notifications.restore"),
  snooze: ConsoleClient.mutation("Notifications.snooze"),
  setPref: ConsoleClient.mutation("Notifications.setPref")
} as const

/** Every read of the member's notes again: a note set aside has come back (the shell's `wake`). */
export const reReadNotes = ConsoleClient.runtime.fn(() => Reactivity.invalidate(NOTES))
