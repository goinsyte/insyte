import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { CHANNELS, NOTIFICATION_KINDS, notificationKind } from "@insyte/domain/Notifications"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type ChannelState,
  type EventPref,
  NotePrefs,
  NotePrefsChange,
  NotifyPrefsInput,
  PushNotRegistered,
  QuietHoursEmpty,
  type SetNotePref,
  SlackChannelId,
  SlackNotConnected
} from "../domain/Notifications.ts"
import { Slack, WebPush } from "../domain/Ports.ts"
import { deviceCount } from "./push.ts"
import { connectionOf } from "./slack.ts"

/*
 * What a member hears and where (M5.2 for the app; M11 step 13.5 for the rest). A kind never set follows the
 * catalogue's default; a member who never saved the page has the design's quiet hours, digest and follow rules. The
 * page saves whole (`setAll`) with an undo; the bell's switch (`set`) changes the app channel alone.
 */

export const RESTORE = "notifications.restore"

/**
 * Whether push and Slack can deliver for the member: push once the stage has VAPID keys and the member allowed it on a
 * browser; Slack once the stage has the app and the workspace connected it.
 */
const channelsOf = (sql: SqlClient.SqlClient, memberId: string) =>
  Effect.gen(function*() {
    const push = yield* WebPush
    const slack = yield* Slack
    const devices = push.publicKey === null ? 0 : yield* deviceCount(sql, memberId)
    const connection = yield* connectionOf(sql)
    return {
      channels: {
        push: push.publicKey === null ? "unavailable" : devices > 0 ? "connected" : "available",
        slack: connection !== undefined ? "connected" : slack.configured ? "available" : "unavailable"
      } satisfies Record<"push" | "slack", ChannelState>,
      pushKey: push.publicKey,
      slackTeam: connection === undefined ? null : connection.team ?? "Slack",
      devices
    }
  })

const DEFAULT_SETTINGS = {
  quiet: { on: true, from: "22:00", to: "07:00", weekend: false },
  digest: { on: true, at: "08:00" as const },
  follow: { assigned: true, mentioned: true, created: true },
  slackChannel: null
}

interface SettingsRow {
  readonly quietOn: boolean
  readonly quietFrom: string
  readonly quietTo: string
  readonly quietWeekend: boolean
  readonly digestOn: boolean
  readonly digestAt: string
  readonly followAssigned: boolean
  readonly followMentioned: boolean
  readonly followCreated: boolean
  readonly slackChannel: string | null
}

const decodeDigestAt = Schema.decodeUnknownOption(NotifyPrefsInput.fields.digest.fields.at)
const isSlackChannel = Schema.is(SlackChannelId)

/** Every kind's channels: the member's rows over the catalogue's defaults. */
export const eventsOf = (
  rows: ReadonlyArray<{ kind: string; channels: ReadonlyArray<string>; onlyMine: boolean }>
): Record<string, EventPref> => {
  const byKind = new Map(rows.map((r) => [r.kind, r]))
  return Object.fromEntries(NOTIFICATION_KINDS.map((k) => {
    const row = byKind.get(k.key)
    if (row === undefined) return [k.key, { ...k.defaults, onlyMine: false }]
    return [k.key, {
      app: row.channels.includes("app"),
      email: row.channels.includes("email"),
      push: row.channels.includes("push"),
      slack: row.channels.includes("slack"),
      onlyMine: row.onlyMine
    }]
  }))
}

/** The member's settings as the page reads them, inside a transaction scoped to them. */
const readPrefs = (sql: SqlClient.SqlClient, memberId: string) =>
  Effect.gen(function*() {
    const rows = yield* sql<{ kind: string; channels: Array<string>; onlyMine: boolean }>`
      select kind, channels, only_mine from notification_prefs where recipient_id = ${memberId}`
    const [settings] = yield* sql<SettingsRow>`
      select quiet_on, quiet_from, quiet_to, quiet_weekend, digest_on, digest_at, follow_assigned, follow_mentioned,
             follow_created, slack_channel
      from notification_settings where recipient_id = ${memberId}`
    const [ws] = yield* sql<
      { email: string | null; timezone: string; alerts: Record<string, unknown>; currency: string }
    >`
      select u.email, w.timezone, w.alerts, w.currency
      from workspaces w left join members m on m.id = ${memberId} left join auth."user" u on u.id = m.user_id
      where w.id = app_workspace_id()`
    const events = eventsOf(rows)
    const { channels, pushKey, slackTeam } = yield* channelsOf(sql, memberId)
    return new NotePrefs({
      app: Object.fromEntries(rows.map((r) => [r.kind, r.channels.includes("app")])),
      events,
      ...(settings === undefined ? DEFAULT_SETTINGS : {
        quiet: { on: settings.quietOn, from: settings.quietFrom, to: settings.quietTo, weekend: settings.quietWeekend },
        digest: {
          on: settings.digestOn,
          at: Option.getOrElse(decodeDigestAt(settings.digestAt), () => "08:00" as const)
        },
        follow: {
          assigned: settings.followAssigned,
          mentioned: settings.followMentioned,
          created: settings.followCreated
        },
        slackChannel: settings.slackChannel
      }),
      email: ws?.email ?? "",
      timezone: ws?.timezone ?? "Europe/Amsterdam",
      alerts: {
        delayHours: Number(ws?.alerts["delay_hours"] ?? 48),
        disputeAmountMinor: Number(ws?.alerts["dispute_amount_minor"] ?? 10000),
        currency: ws?.currency ?? "EUR"
      },
      channels,
      pushKey,
      slackTeam
    })
  })

export const get = Effect.fn("Notifications.prefs")(function*() {
  const { id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => readPrefs(sql, id))
})

export const set = Effect.fn("Notifications.setPref")(function*(input: SetNotePref) {
  const kind = notificationKind(input.kind)
  if (kind === undefined) return yield* new Invalid({ fields: { kind: "unknown" } })
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ channels: Array<string> }>`
        select channels from notification_prefs where recipient_id = ${id} and kind = ${input.kind}`
      const before = row?.channels ?? CHANNELS.filter((c) => kind.defaults[c])
      const channels = [...before.filter((c) => c !== "app"), ...(input.app ? ["app"] : [])]
      yield* sql`insert into notification_prefs (workspace_id, recipient_id, kind, channels)
                 values (${workspaceId}, ${id}, ${input.kind}, ${channels}::text[])
                 on conflict (workspace_id, recipient_id, kind) do update set channels = excluded.channels`
      return yield* readPrefs(sql, id)
    })
  )
})

/** The page's whole settings written for the member: every kind it names, and the rest of the page. */
const write = (sql: SqlClient.SqlClient, workspaceId: string, memberId: string, input: NotifyPrefsInput) =>
  Effect.gen(function*() {
    for (const [kind, p] of Object.entries(input.events)) {
      const channels = CHANNELS.filter((c) => p[c])
      yield* sql`insert into notification_prefs (workspace_id, recipient_id, kind, channels, only_mine)
                 values (${workspaceId}, ${memberId}, ${kind}, ${channels}::text[], ${p.onlyMine})
                 on conflict (workspace_id, recipient_id, kind)
                 do update set channels = excluded.channels, only_mine = excluded.only_mine`
    }
    yield* sql`
      insert into notification_settings (workspace_id, recipient_id, quiet_on, quiet_from, quiet_to, quiet_weekend,
                                         digest_on, digest_at, follow_assigned, follow_mentioned, follow_created,
                                         slack_channel, updated_at)
      values (${workspaceId}, ${memberId}, ${input.quiet.on}, ${input.quiet.from}, ${input.quiet.to},
              ${input.quiet.weekend}, ${input.digest.on}, ${input.digest.at}, ${input.follow.assigned},
              ${input.follow.mentioned}, ${input.follow.created}, ${input.slackChannel}, now())
      on conflict (workspace_id, recipient_id) do update set
        quiet_on = excluded.quiet_on, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to,
        quiet_weekend = excluded.quiet_weekend, digest_on = excluded.digest_on, digest_at = excluded.digest_at,
        follow_assigned = excluded.follow_assigned, follow_mentioned = excluded.follow_mentioned,
        follow_created = excluded.follow_created, slack_channel = excluded.slack_channel, updated_at = now()`
  })

const inputOf = (prefs: NotePrefs): NotifyPrefsInput => ({
  events: prefs.events,
  quiet: prefs.quiet,
  digest: prefs.digest,
  follow: prefs.follow,
  slackChannel: prefs.slackChannel
})

/**
 * The Meldingen page saved (widgets/04 §D): a kind the catalogue does not know is `Invalid`; quiet hours that begin
 * when they end are `QuietHoursEmpty`; a Slack channel while Slack is not connected is `SlackNotConnected` (one that
 * is no channel id is `Invalid`); a push switch turned on with push on no browser is `PushNotRegistered`. Answers the
 * settings as saved and the undo that puts the previous ones back.
 */
export const setAll = Effect.fn("Notifications.setPrefs")(function*(input: NotifyPrefsInput) {
  const unknown = Object.keys(input.events).filter((k) => notificationKind(k) === undefined)
  if (unknown.length > 0) return yield* new Invalid({ fields: { events: "unknown" } })
  if (input.quiet.on && input.quiet.from === input.quiet.to) return yield* new QuietHoursEmpty()
  if (input.slackChannel !== null && !isSlackChannel(input.slackChannel)) {
    return yield* new Invalid({ fields: { slackChannel: "unknown" } })
  }
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const current = yield* readPrefs(sql, id)
      const before = inputOf(current)
      if (input.slackChannel !== null && current.channels.slack !== "connected") return yield* new SlackNotConnected()
      // A push switch turned on needs a browser to go to; one left on as it was is kept.
      const pushOn = Object.entries(input.events).some(([kind, p]) => p.push && before.events[kind]?.push !== true)
      if (pushOn && current.channels.push !== "connected") return yield* new PushNotRegistered()
      yield* write(sql, workspaceId, id, input)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { before } })
      return new NotePrefsChange({ prefs: yield* readPrefs(sql, id), undo })
    })
  )
})

const decodeBefore = Schema.decodeUnknownEffect(Schema.Struct({ before: NotifyPrefsInput }))

/** `Shared.undo` for `notifications.restore`: the page as it was, for the member who saved it. */
export const restore = Effect.fn("Notifications.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const { workspaceId, id } = yield* CurrentPrincipal
  const { before } = yield* decodeBefore(compensation).pipe(Effect.orDie)
  yield* write(sql, workspaceId, id, before)
})
