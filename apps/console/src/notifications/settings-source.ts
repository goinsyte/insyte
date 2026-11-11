import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { NotePrefs, NotifyPrefsInput } from "@insyte/modules/notifications/domain/Notifications"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import { EVENTS, type NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { NotificationSettingsSource } from "@insyte/ui/app/settings/notifications-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { inboxAtom, NOTES } from "../data/frame.ts"
import { notifyWrites } from "../data/notifications.ts"
import { toNote } from "../frame/notes.ts"
import { failureOf } from "../frame/refusals.ts"

/*
 * Instellingen → Meldingen in the console (M11 step 13.5): `Notifications.prefs` as the design's `NotifyPrefs`, saved
 * whole through `Notifications.setPrefs` with its undo. Push and Slack say "Niet gekoppeld" until the server says they
 * can deliver; "Testmelding sturen" waits for push. A save that did not go says why and keeps the page as typed.
 */

/** The server's settings as the design's, every kind in the design's order, so a draft compares key by key. */
export const notifyPrefsOf = (prefs: NotePrefs): NotifyPrefs => ({
  events: Object.fromEntries(EVENTS.map((e) => {
    const p = prefs.events[e.key]
    return [e.key, {
      app: p?.app ?? e.defaults.app,
      email: p?.email ?? e.defaults.email,
      push: p?.push ?? e.defaults.push,
      slack: p?.slack ?? e.defaults.slack,
      onlyMine: p?.onlyMine ?? false
    }]
  })),
  quiet: { on: prefs.quiet.on, from: prefs.quiet.from, to: prefs.quiet.to, weekend: prefs.quiet.weekend },
  digest: { on: prefs.digest.on, at: prefs.digest.at },
  follow: { assigned: prefs.follow.assigned, mentioned: prefs.follow.mentioned, created: prefs.follow.created },
  slackChannel: prefs.slackChannel ?? ""
})

const inputOf = (draft: NotifyPrefs): NotifyPrefsInput => ({
  events: draft.events,
  quiet: draft.quiet,
  digest: { on: draft.digest.on, at: draft.digest.at as NotifyPrefsInput["digest"]["at"] },
  follow: draft.follow,
  slackChannel: draft.slackChannel === "" ? null : draft.slackChannel
})

/** Why the page did not save, in Dutch; what was typed stays. */
const notSaved = (error: unknown) => {
  const tag = (error as { _tag?: string })._tag
  if (tag === "QuietHoursEmpty") {
    return void toast.error("Stille uren hebben een begin en een eind nodig die niet gelijk zijn")
  }
  if (tag === "SlackNotConnected") {
    return void toast.error("Slack is nog niet gekoppeld", { description: "Kies een kanaal zodra Slack gekoppeld is." })
  }
  toast.error("Meldingen niet opgeslagen", {
    description: tag === "Invalid"
      ? "Kijk de instellingen nog eens na. Je wijzigingen staan er nog."
      : "Probeer het zo nog eens. Je wijzigingen staan er nog."
  })
}

export function useConsoleNotificationSettingsSource(prefs: NotePrefs): NotificationSettingsSource {
  const setPrefs = useAtomSet(notifyWrites.setPrefs, { mode: "promiseExit" })
  const undo = useAtomSet(notifyWrites.undo, { mode: "promiseExit" })
  const inbox = Option.getOrUndefined(AsyncResult.value(useAtomValue(inboxAtom)))
  const notes = useMemo(() => inbox?.items.map(toNote), [inbox])
  const saved = useMemo(() => notifyPrefsOf(prefs), [prefs])
  const currency = (["EUR", "USD", "GBP"].includes(prefs.alerts.currency) ? prefs.alerts.currency : "EUR") as Currency
  return {
    saved,
    save: async (next, said) => {
      const exit = await setPrefs({ payload: inputOf(next), reactivityKeys: [...NOTES] })
      if (Exit.isFailure(exit)) {
        notSaved(failureOf(exit))
        return false
      }
      const token = exit.value.undo.token
      undoable(said.label, () =>
        void undo({ payload: { token }, reactivityKeys: [...NOTES] }).then((done) => {
          if (Exit.isFailure(done)) toast.error("Te laat om ongedaan te maken")
        }), said.detail)
      return true
    },
    notes,
    email: prefs.email,
    timezone: prefs.timezone,
    thresholds: {
      delayHours: `Na ${prefs.alerts.delayHours} uur`,
      disputeAmount: `Vanaf ${formatCurrency(prefs.alerts.disputeAmountMinor / 100, currency)}`
    },
    connected: { push: prefs.channels.push === "connected", slack: prefs.channels.slack === "connected" },
    slackChannels: prefs.slackChannel === null ? [] : [prefs.slackChannel]
  }
}
