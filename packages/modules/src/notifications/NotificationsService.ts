import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { Sealer } from "../shared/domain/Sealer.ts"
import type {
  ListNotes,
  NoteCounts,
  NotePage,
  NotePrefs,
  NotePrefsChange,
  NotifyPrefsInput,
  PushDevice,
  PushNotRegistered,
  PushSubscribe,
  PushTested,
  PushUnavailable,
  QuietHoursEmpty,
  SetNotePref,
  SetRead,
  SlackChannel,
  SlackConnectFailed,
  SlackNotConnected,
  Snooze
} from "./domain/Notifications.ts"
import type { Slack, WebPush } from "./domain/Ports.ts"
import * as Inbox from "./use-cases/inbox.ts"
import * as Prefs from "./use-cases/prefs.ts"
import * as Push from "./use-cases/push.ts"
import * as SlackCases from "./use-cases/slack.ts"

type R = Db | CurrentPrincipal
/** What the settings page's reads and writes need beside: whether push and Slack can deliver. */
type Channels = WebPush | Slack

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/**
 * The notifications slice (M5.2, M11 step 13.5): the member's inbox and what they hear where, as the request's
 * principal. The relay's sink writes the rows and plans what goes out by e-mail (`use-cases/fanout.ts`); the sweeps
 * send it, and the daily digest (`use-cases/deliveries.ts`).
 *
 * @effect-expect-leaking Db CurrentPrincipal WebPush Slack Sealer
 */
export class NotificationsService extends Context.Service<NotificationsService, {
  readonly list: (input: ListNotes) => Effect.Effect<NotePage, never, R>
  readonly counts: Effect.Effect<NoteCounts, never, R>
  readonly setRead: (input: SetRead) => Effect.Effect<NoteCounts, never, R>
  readonly markAllRead: Effect.Effect<NoteCounts, never, R>
  readonly clear: (ids: ReadonlyArray<string>) => Effect.Effect<NoteCounts, never, R>
  readonly restore: (ids: ReadonlyArray<string>) => Effect.Effect<NoteCounts, never, R>
  readonly snooze: (input: Snooze) => Effect.Effect<NoteCounts, Invalid, R>
  readonly prefs: Effect.Effect<NotePrefs, never, R | Channels>
  readonly setPref: (input: SetNotePref) => Effect.Effect<NotePrefs, Invalid, R | Channels>
  readonly setPrefs: (
    input: NotifyPrefsInput
  ) => Effect.Effect<NotePrefsChange, Invalid | QuietHoursEmpty | SlackNotConnected | PushNotRegistered, R | Channels>
  readonly pushDevices: Effect.Effect<ReadonlyArray<PushDevice>, never, R>
  readonly subscribePush: (input: PushSubscribe) => Effect.Effect<PushDevice, PushUnavailable, R | WebPush>
  readonly unsubscribePush: (id: string) => Effect.Effect<ReadonlyArray<PushDevice>, never, R>
  readonly testPush: Effect.Effect<PushTested, PushUnavailable | PushNotRegistered, R | WebPush>
  readonly slackChannels: Effect.Effect<ReadonlyArray<SlackChannel>, Conflict, R | Slack | Sealer>
  readonly beginSlackConnect: (
    returnPath: string,
    redirectUri: string
  ) => Effect.Effect<{ readonly authorizeUrl: string }, Forbidden | Conflict, R | Slack>
  readonly slackCallback: (
    query: Readonly<Record<string, string>>,
    redirectUri: string
  ) => Effect.Effect<{ readonly returnPath: string; readonly team: string }, SlackConnectFailed, R | Slack | Sealer>
  readonly disconnectSlack: Effect.Effect<void, Forbidden, R | Slack | Sealer>
}>()("modules/NotificationsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.sync(NotificationsService, () => ({
    list: (input) => run(Inbox.list(input)),
    counts: run(Inbox.counts()),
    setRead: (input) => run(Inbox.setRead(input)),
    markAllRead: run(Inbox.markAllRead()),
    clear: (ids) => run(Inbox.clear(ids)),
    restore: (ids) => run(Inbox.restore(ids)),
    snooze: (input) => run(Inbox.snooze(input)),
    prefs: run(Prefs.get()),
    setPref: (input) => run(Prefs.set(input)),
    setPrefs: (input) => run(Prefs.setAll(input)),
    pushDevices: run(Push.devices()),
    subscribePush: (input) => run(Push.subscribe(input)),
    unsubscribePush: (id) => run(Push.unsubscribe(id)),
    testPush: run(Push.test()),
    slackChannels: run(SlackCases.channels()),
    beginSlackConnect: (returnPath, redirectUri) => run(SlackCases.beginConnect(returnPath, redirectUri)),
    slackCallback: (query, redirectUri) => run(SlackCases.callback(query, redirectUri)),
    disconnectSlack: run(SlackCases.disconnect())
  }))
}
