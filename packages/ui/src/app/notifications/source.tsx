import { createContext, useContext } from "react"
import type { EventKey, Note, NoteState, NotifyPrefs } from "../lib/notifications"

/**
 * What the notifications page reads and does, from whoever hosts it (as `settings/notifications-source.tsx` is for
 * Meldingen): the design app from its notifications store, the console from `Notifications.list` and its writes (PLAN
 * 10, M5.2). The notes are every one the host holds for the persona, in any state; the page cuts them into its views.
 * `pick` and `put` are the Undo: the notes as they were, and putting them back so.
 */
export interface NotificationsSource {
  notes: ReadonlyArray<Note>
  prefs: NotifyPrefs
  setRead: (ids: ReadonlyArray<string>, read: boolean) => void
  snooze: (ids: ReadonlyArray<string>, until: string) => void
  clear: (ids: ReadonlyArray<string>) => void
  restore: (ids: ReadonlyArray<string>) => void
  pick: (ids: ReadonlyArray<string>) => Array<Note>
  put: (notes: ReadonlyArray<Note>) => void
  /** "Dit soort niet meer tonen": a kind's in-app switch, as Instellingen → Meldingen sets it. */
  setEventApp: (event: EventKey, on: boolean) => void
  /**
   * A host that reads a tab a page at a time: whether there is more of it, and reading the next page, which the list
   * asks for as it nears its end. Absent, the notes are all there is.
   */
  more?: { has: (tab: NoteState) => boolean; read: (tab: NoteState) => void } | undefined
}

const Context = createContext<NotificationsSource | null>(null)

export const NotificationsSourceProvider = Context.Provider

export function useNotificationsSource(): NotificationsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The notifications page needs a NotificationsSourceProvider around it.")
  return source
}
