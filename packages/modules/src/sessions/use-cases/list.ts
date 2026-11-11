import { Db } from "@insyte/database/Db"
import { deviceOf } from "@insyte/domain/Devices"
import { ActiveSession, CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"

/*
 * Beveiliging → Actieve sessies, read (M3.3; widgets/05 §2.4): the person's own unexpired sessions, the one asking
 * first, then the most recently renewed. A person's own, whatever their role: nothing here is the workspace's.
 */

export const listSessions = Effect.fn("Sessions.list")(function*(currentSessionId: string) {
  const user = yield* CurrentUser
  const db = yield* Db
  const rows = yield* db.routing((sql) =>
    sql<{ id: string; userAgent: string | null; country: string | null; updatedAt: Date }>`
      select id, user_agent, country, updated_at from auth.session
      where user_id = ${user.id} and expires_at > now()
      order by id = ${currentSessionId} desc, updated_at desc`
  )
  return rows.map((row) =>
    new ActiveSession({
      id: row.id,
      device: deviceOf(row.userAgent),
      country: row.country,
      lastActiveAt: new Date(row.updatedAt).toISOString(),
      current: row.id === currentSessionId
    })
  )
})
