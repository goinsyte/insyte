import { Frame } from "@insyte/api/rpc/ShellRpcs"
import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The frame (M5.3): its first paint in one read (`Shell.frame`), primed by the layout route's loader and carried in the
 * document; the member's notifications and saved views as the bell and the panel read them; every change to either
 * names its keys, so what shows it reads again. Presence comes from the realtime socket.
 */

export const FRAME = ["frame"] as const
export const NOTES = ["notes"] as const
export const VIEWS = ["views"] as const

export const frameAtom = Atom.serializable(
  ConsoleClient.query("Shell.frame", { path: "/" }, { reactivityKeys: FRAME }),
  {
    key: "frame",
    schema: AsyncResult.Schema({
      success: Frame,
      error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

/** The inbox's first page, for the bell's list. */
export const inboxAtom = ConsoleClient.query("Notifications.list", { tab: "inbox", cursor: null }, {
  reactivityKeys: NOTES
})

/** What is set aside until later, for the panel's count and for the shell to see when one comes back. */
export const laterAtom = ConsoleClient.query("Notifications.list", { tab: "later", cursor: null }, {
  reactivityKeys: NOTES
})

export const notePrefsAtom = ConsoleClient.query("Notifications.prefs", undefined, { reactivityKeys: NOTES })

export const viewsAtom = ConsoleClient.query("Views.list", undefined, { reactivityKeys: VIEWS })

/** Who has a tab open, by member: set by the realtime socket's `hello` and `presence` frames. */
export const presenceAtom = Atom.make<ReadonlyArray<string>>([]).pipe(Atom.keepAlive)

export const frameWrites = {
  patchPrefs: ConsoleClient.mutation("Prefs.patch"),
  recordVisit: ConsoleClient.mutation("Prefs.recordVisit"),
  saveView: ConsoleClient.mutation("Views.save"),
  updateView: ConsoleClient.mutation("Views.update"),
  renameView: ConsoleClient.mutation("Views.rename"),
  removeView: ConsoleClient.mutation("Views.remove"),
  restoreView: ConsoleClient.mutation("Views.restore"),
  togglePinView: ConsoleClient.mutation("Views.togglePin"),
  setRead: ConsoleClient.mutation("Notifications.setRead"),
  markAllRead: ConsoleClient.mutation("Notifications.markAllRead"),
  restoreNotes: ConsoleClient.mutation("Notifications.restore")
} as const
