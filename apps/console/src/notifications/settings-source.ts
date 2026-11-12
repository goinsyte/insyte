import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { NotePrefs, NotifyPrefsInput } from "@insyte/modules/notifications/domain/Notifications"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import { EVENTS, type NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { NotificationSettingsSource, SlackHere } from "@insyte/ui/app/settings/notifications-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { inboxAtom, NOTES } from "../data/frame.ts"
import { notifyWrites, slackChannelsAtom } from "../data/notifications.ts"
import { toNote } from "../frame/notes.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"
import { useBrowserPush } from "./push.ts"

/*
 * Instellingen → Meldingen in the console (M11 step 13.5): `Notifications.prefs` as the design's `NotifyPrefs`, saved
 * whole through `Notifications.setPrefs` with its undo. Push is turned on per browser (`push.ts`); Slack is connected
 * by a manager through Slack's approval page and back (`?connected=slack`), and each member picks a channel or a
 * direct message. A channel the environment does not have says "Nog niet beschikbaar"; a column that cannot deliver
 * to the member yet says "Niet gekoppeld". A save that did not go says why and keeps the page as typed.
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
  if (tag === "PushNotRegistered") {
    return void toast.error("Push staat nog nergens aan", {
      description: "Zet push eerst aan op dit apparaat, dan kies je per gebeurtenis of die als push komt."
    })
  }
  toast.error("Meldingen niet opgeslagen", {
    description: tag === "Invalid"
      ? "Kijk de instellingen nog eens na. Je wijzigingen staan er nog."
      : "Probeer het zo nog eens. Je wijzigingen staan er nog."
  })
}

const SLACK: RefusalCopy = {
  gone: "Slack is niet meer gekoppeld",
  conflicts: {
    not_configured: ["Slack kan hier nog niet", "Deze omgeving heeft de Slack-app nog niet."],
    not_connected: ["Slack is niet gekoppeld", "Koppel Slack opnieuw; de koppeling is losgemaakt of verlopen."],
    unreachable: ["Slack reageert niet", "Probeer het zo nog eens."]
  }
}

/** Why Slack did not connect, as the callback says it (`?error=slack_<reason>`). */
export const slackNotConnected = (error: string) =>
  void toast.error("Slack niet gekoppeld", {
    description: error === "slack_state"
      ? "De koppeling duurde te lang of kwam uit een ander venster. Probeer het opnieuw."
      : "Slack gaf geen toestemming. Probeer het opnieuw, of kijk of je Slack-workspace apps toestaat."
  })

function useSlack(prefs: NotePrefs): { slack: SlackHere; channels: NotificationSettingsSource["slackChannels"] } {
  const begin = useAtomSet(notifyWrites.beginSlackConnect, { mode: "promiseExit" })
  const letGo = useAtomSet(notifyWrites.disconnectSlack, { mode: "promiseExit" })
  const manage = useGate("settings", 3).ok
  const [busy, setBusy] = useState(false)
  const connected = prefs.channels.slack === "connected"
  const listed = Option.getOrUndefined(AsyncResult.value(useAtomValue(slackChannelsAtom)))
  const channels = useMemo(() => {
    const options = connected ? (listed ?? []).map((c) => ({ value: c.id, label: c.name })) : []
    // What is saved stays shown while the list is out, or after its channel went.
    const saved = prefs.slackChannel
    return saved !== null && !options.some((o) => o.value === saved)
      ? [...options, { value: saved, label: listed === undefined ? "…" : "Kanaal bestaat niet meer" }]
      : options
  }, [connected, listed, prefs.slackChannel])
  return {
    channels,
    slack: {
      state: prefs.channels.slack,
      team: prefs.slackTeam,
      manage,
      busy,
      connect: () => {
        if (busy) return
        setBusy(true)
        void begin({ payload: { returnPath: "/settings/notifications" } }).then((exit) => {
          if (Exit.isFailure(exit)) {
            setBusy(false)
            return sayRefusal(failureOf(exit), SLACK)
          }
          window.location.assign(exit.value.authorizeUrl)
        })
      },
      disconnect: () => {
        if (busy) return
        setBusy(true)
        void letGo({ payload: undefined, reactivityKeys: [...NOTES] }).then((exit) => {
          setBusy(false)
          if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), SLACK)
          toast.success("Slack ontkoppeld", { description: "Meldingen gaan niet meer naar Slack." })
        })
      }
    }
  }
}

export function useConsoleNotificationSettingsSource(prefs: NotePrefs): NotificationSettingsSource {
  const setPrefs = useAtomSet(notifyWrites.setPrefs, { mode: "promiseExit" })
  const { push, testPush } = useBrowserPush(prefs)
  const { slack, channels } = useSlack(prefs)
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
    slackChannels: channels,
    testPush,
    push,
    slack
  }
}
