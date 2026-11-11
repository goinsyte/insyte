import type { Db } from "@insyte/database/Db"
import type { Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  ListNotes,
  NoteCounts,
  NotePage,
  NotePrefs,
  NotePrefsChange,
  NotifyPrefsInput,
  QuietHoursEmpty,
  SetNotePref,
  SetRead,
  SlackNotConnected,
  Snooze
} from "./domain/Notifications.ts"
import * as Inbox from "./use-cases/inbox.ts"
import * as Prefs from "./use-cases/prefs.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/**
 * The notifications slice (M5.2, M11 step 13.5): the member's inbox and what they hear where, as the request's
 * principal. The relay's sink writes the rows and plans what goes out by e-mail (`use-cases/fanout.ts`); the sweeps
 * send it, and the daily digest (`use-cases/deliveries.ts`).
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class NotificationsService extends Context.Service<NotificationsService, {
  readonly list: (input: ListNotes) => Effect.Effect<NotePage, never, R>
  readonly counts: Effect.Effect<NoteCounts, never, R>
  readonly setRead: (input: SetRead) => Effect.Effect<NoteCounts, never, R>
  readonly markAllRead: Effect.Effect<NoteCounts, never, R>
  readonly clear: (ids: ReadonlyArray<string>) => Effect.Effect<NoteCounts, never, R>
  readonly restore: (ids: ReadonlyArray<string>) => Effect.Effect<NoteCounts, never, R>
  readonly snooze: (input: Snooze) => Effect.Effect<NoteCounts, Invalid, R>
  readonly prefs: Effect.Effect<NotePrefs, never, R>
  readonly setPref: (input: SetNotePref) => Effect.Effect<NotePrefs, Invalid, R>
  readonly setPrefs: (
    input: NotifyPrefsInput
  ) => Effect.Effect<NotePrefsChange, Invalid | QuietHoursEmpty | SlackNotConnected, R>
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
    setPrefs: (input) => run(Prefs.setAll(input))
  }))
}
