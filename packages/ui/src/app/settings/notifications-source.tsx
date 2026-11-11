import { createContext, useContext } from "react"
import type { Note, NotifyPrefs } from "../lib/notifications"

/**
 * What Instellingen → Meldingen reads and does, from whoever hosts it (as `returns/source.tsx` is for the returns
 * pages): the design app from its notifications store, the console from `Notifications.prefs` and `.setPrefs` (M11
 * step 13.5). What the host cannot do yet is said, never made up: push and Slack say "Niet gekoppeld" until they can
 * deliver.
 */
export interface NotificationSettingsSource {
  saved: NotifyPrefs
  /**
   * Saves the page whole; the host says what it did (with its Undo) or why it did not. Resolves whether it saved: a
   * page that did not keeps what was typed.
   */
  save: (next: NotifyPrefs, said: { label: string; detail?: string | undefined }) => Promise<boolean>
  /** The member's notes, for "{shown} van {all} in de app"; absent until they are in. */
  notes: ReadonlyArray<Note> | undefined
  /** Where e-mail and the digest go. */
  email: string
  /** The timezone quiet hours are kept in. */
  timezone: string
  /** The thresholds a late order and a chargeback fire at, as their rows link to them: "Na 48 uur", "Vanaf €100". */
  thresholds: { delayHours: string; disputeAmount: string }
  /** Whether push and Slack can deliver; a column that cannot says "Niet gekoppeld". */
  connected: { push: boolean; slack: boolean }
  /** Where Slack can post, once it is connected. */
  slackChannels: ReadonlyArray<string>
  /** "Testmelding sturen"; absent while push cannot deliver. */
  testPush?: (() => void) | undefined
}

const Context = createContext<NotificationSettingsSource | null>(null)

export const NotificationSettingsSourceProvider = Context.Provider

export function useNotificationSettingsSource(): NotificationSettingsSource {
  const source = useContext(Context)
  if (source === null) {
    throw new Error("The notification settings need a NotificationSettingsSourceProvider around them.")
  }
  return source
}
