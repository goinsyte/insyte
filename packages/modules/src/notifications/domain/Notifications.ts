import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * In-app notifications (M5.2): what the bell, the notifications page and the settings page read. A row is a fact about
 * a record, with the actor who did it, ids and figures in `data`; the console writes the sentence. A row is in the
 * inbox, set aside until later (snoozed), or cleared.
 */

export const NoteTab = Schema.Literals(["inbox", "later", "cleared"])
export type NoteTab = typeof NoteTab.Type

export const NoteActor = Schema.Struct({
  kind: Schema.String,
  id: Schema.String,
  /** A member's name as it is now; a service or Insyte has none. */
  name: Schema.NullOr(Schema.String)
})

export class Note extends Schema.Class<Note>("notifications/Note")({
  id: Schema.String,
  kind: Schema.String,
  primary: Schema.Boolean,
  subjectType: Schema.NullOr(Schema.String),
  subjectId: Schema.NullOr(Schema.String),
  actor: Schema.NullOr(NoteActor),
  data: Schema.Json,
  createdAt: Schema.Finite,
  read: Schema.Boolean,
  state: NoteTab,
  snoozedUntil: Schema.NullOr(Schema.Finite)
}) {}

/** A page of one tab, newest first; `next` continues it. */
export class NotePage extends Schema.Class<NotePage>("notifications/NotePage")({
  items: Schema.Array(Note),
  next: Schema.NullOr(Schema.String)
}) {}

/** What the bell and the tabs count: unread in the inbox (and of them, Primair), and how many are set aside. */
export class NoteCounts extends Schema.Class<NoteCounts>("notifications/NoteCounts")({
  unread: Schema.Int,
  primaryUnread: Schema.Int,
  later: Schema.Int
}) {}

export const ListNotes = Schema.Struct({ tab: NoteTab, cursor: Schema.NullOr(Schema.String) })
export type ListNotes = typeof ListNotes.Type
export const NoteIds = Schema.Struct({ ids: Schema.Array(Schema.String) })
export const SetRead = Schema.Struct({ ids: Schema.Array(Schema.String), read: Schema.Boolean })
export type SetRead = typeof SetRead.Type
export const Snooze = Schema.Struct({ ids: Schema.Array(Schema.String), until: Schema.Finite })
export type Snooze = typeof Snooze.Type

/** A time of day as the page writes it, `HH:MM`. */
const Clock = Schema.String.check(Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9]$/))

/** The hours the digest can go out at (widgets/04 §D). */
export const DIGEST_TIMES = ["06:00", "07:00", "07:30", "08:00", "08:30", "09:00", "10:00"] as const

/** One kind's channels, and "Alleen als het mij betreft". */
export const EventPref = Schema.Struct({
  app: Schema.Boolean,
  email: Schema.Boolean,
  push: Schema.Boolean,
  slack: Schema.Boolean,
  onlyMine: Schema.Boolean
})
export type EventPref = typeof EventPref.Type

/** Push and Slack wait while these are on, in the workspace's timezone; the app and e-mail do not. */
export const QuietHours = Schema.Struct({ on: Schema.Boolean, from: Clock, to: Clock, weekend: Schema.Boolean })
export type QuietHours = typeof QuietHours.Type
export const DigestPref = Schema.Struct({ on: Schema.Boolean, at: Schema.Literals(DIGEST_TIMES) })
export const FollowPref = Schema.Struct({
  assigned: Schema.Boolean,
  mentioned: Schema.Boolean,
  created: Schema.Boolean
})

/** What the Meldingen page saves, whole (`Notifications.setPrefs`). */
export const NotifyPrefsInput = Schema.Struct({
  events: Schema.Record(Schema.String, EventPref),
  quiet: QuietHours,
  digest: DigestPref,
  follow: FollowPref,
  /** Where Slack posts; `null` while Slack is not connected. */
  slackChannel: Schema.NullOr(Schema.String)
})
export type NotifyPrefsInput = typeof NotifyPrefsInput.Type

/**
 * Whether a channel outside the app can deliver. Push: `unavailable` without the stage's VAPID keys, `available` while
 * the member allowed it on no browser yet, `connected` once on one. Slack: `unavailable` without the stage's Slack
 * app, `available` while the workspace has not connected it, `connected` once it has.
 */
export const ChannelState = Schema.Literals(["connected", "available", "unavailable"])
export type ChannelState = typeof ChannelState.Type

/**
 * The member's notification settings: every kind's channels (a kind never set follows the catalogue's default), quiet
 * hours, the digest, the follow rules; beside them what the page shows with them: the address mail goes to, the
 * timezone quiet hours are in, the workspace's thresholds and whether push and Slack can deliver. `app` is the in-app
 * switch alone, as the bell reads it.
 */
export class NotePrefs extends Schema.Class<NotePrefs>("notifications/NotePrefs")({
  app: Schema.Record(Schema.String, Schema.Boolean),
  events: Schema.Record(Schema.String, EventPref),
  quiet: QuietHours,
  digest: DigestPref,
  follow: FollowPref,
  slackChannel: Schema.NullOr(Schema.String),
  email: Schema.String,
  timezone: Schema.String,
  alerts: Schema.Struct({ delayHours: Schema.Int, disputeAmountMinor: Schema.Int, currency: Schema.String }),
  channels: Schema.Struct({ push: ChannelState, slack: ChannelState }),
  /** The stage's VAPID public key, which a browser subscribes with; `null` while push is unavailable. */
  pushKey: Schema.NullOr(Schema.String),
  /** The Slack workspace's name once it is connected. */
  slackTeam: Schema.NullOr(Schema.String)
}) {}

/** A saved page, with its Undo: the settings as they were. */
export class NotePrefsChange extends Schema.Class<NotePrefsChange>("notifications/NotePrefsChange")({
  prefs: NotePrefs,
  undo: UndoTicket
}) {}

/** Quiet hours on, from the same time as they end: no hours at all. */
export class QuietHoursEmpty extends Schema.TaggedError<QuietHoursEmpty>()("QuietHoursEmpty", {}) {}

/** A Slack channel chosen while the workspace has no Slack connected. */
export class SlackNotConnected extends Schema.TaggedError<SlackNotConnected>()("SlackNotConnected", {}) {}
export const SetNotePref = Schema.Struct({ kind: Schema.String, app: Schema.Boolean })
export type SetNotePref = typeof SetNotePref.Type

/** A push switch turned on while the member allowed push on no browser. */
export class PushNotRegistered extends Schema.TaggedError<PushNotRegistered>()("PushNotRegistered", {}) {}

/** Push cannot be set up on this stage: it has no VAPID keys. */
export class PushUnavailable extends Schema.TaggedError<PushUnavailable>()("PushUnavailable", {}) {}

/** A base64url string of exactly `bytes` bytes once decoded. */
const base64url = (bytes: number) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^[A-Za-z0-9_-]{${Math.ceil((bytes * 4) / 3)}}={0,2}$`)))

/** What a browser's `PushSubscription.toJSON()` gives, and a label for the device (its browser and system). */
export const PushSubscribe = Schema.Struct({
  endpoint: Schema.String.check(Schema.isPattern(/^https:\/\/[^\s]{8,2000}$/)),
  keys: Schema.Struct({ p256dh: base64url(65), auth: base64url(16) }),
  label: Schema.String.check(Schema.isMaxLength(120))
})
export type PushSubscribe = typeof PushSubscribe.Type

/**
 * One browser the member allowed push on. `endpointHash` is the SHA-256 of its endpoint, hex: the browser hashes its
 * own to know whether it is this one, and the endpoint itself never leaves the server.
 */
export class PushDevice extends Schema.Class<PushDevice>("notifications/PushDevice")({
  id: Schema.String,
  label: Schema.String,
  endpointHash: Schema.String,
  createdAt: Schema.Finite,
  lastSentAt: Schema.NullOr(Schema.Finite)
}) {}

export const PushDeviceId = Schema.Struct({ id: Schema.String })

/** "Testmelding sturen": how many browsers it reached, and how many the push service said were gone. */
export class PushTested extends Schema.Class<PushTested>("notifications/PushTested")({
  sent: Schema.Int,
  removed: Schema.Int
}) {}

/** A channel Slack can post in: its id and `#name`; `dm` is "Privébericht aan mij". */
export class SlackChannel extends Schema.Class<SlackChannel>("notifications/SlackChannel")({
  id: Schema.String,
  name: Schema.String
}) {}

/** Where the member's Slack messages go: a channel id, or `dm` for a direct message from the app. */
export const SLACK_DM = "dm"
export const SlackChannelId = Schema.String.check(Schema.isPattern(/^(dm|[CG][A-Z0-9]{6,20})$/))

export const BeginSlackConnect = Schema.Struct({ returnPath: Schema.String })

/** Slack's way back went wrong: the state did not hold, or Slack refused the code. */
export class SlackConnectFailed extends Schema.TaggedError<SlackConnectFailed>()("SlackConnectFailed", {
  reason: Schema.Literals(["state", "exchange"]),
  returnPath: Schema.optional(Schema.String)
}) {}
