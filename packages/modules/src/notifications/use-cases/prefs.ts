import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { CHANNELS, notificationKind } from "@insyte/domain/Notifications"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { NotePrefs, type SetNotePref } from "../domain/Notifications.ts"

/*
 * Which kinds the member hears in the app (M5.2; the other channels arrive with M11). A kind never set follows the
 * catalogue's default; setting it keeps the row's other channels as they were.
 */

const readPrefs = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ kind: string; channels: Array<string> }>`select kind, channels from notification_prefs`,
    (rows) => new NotePrefs({ app: Object.fromEntries(rows.map((r) => [r.kind, r.channels.includes("app")])) })
  )

export const get = Effect.fn("Notifications.prefs")(function*() {
  const db = yield* Db
  return yield* db.scoped(readPrefs)
})

export const set = Effect.fn("Notifications.setPref")(function*(input: SetNotePref) {
  const kind = notificationKind(input.kind)
  if (kind === undefined) return yield* new Invalid({ fields: { kind: "unknown" } })
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ channels: Array<string> }>`
        select channels from notification_prefs where kind = ${input.kind}`
      const before = row?.channels ?? CHANNELS.filter((c) => kind.defaults[c])
      const channels = [...before.filter((c) => c !== "app"), ...(input.app ? ["app"] : [])]
      yield* sql`insert into notification_prefs (workspace_id, recipient_id, kind, channels)
                 values (${workspaceId}, ${id}, ${input.kind}, ${channels}::text[])
                 on conflict (workspace_id, recipient_id, kind) do update set channels = excluded.channels`
      return yield* readPrefs(sql)
    })
  )
})
