import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type PatchPref, Prefs, type Recent, type RecordVisit } from "../domain/Prefs.ts"

/*
 * Preferences and recents (M4.2). One call reads every section and the recents; a write names the version it read, so
 * a second tab that wrote in between gets `Conflict` and re-reads instead of being overwritten. Recents keep the last
 * 50 per member, newest first.
 */

/** A section is a handful of settings; anything larger is a mistake, not a preference. */
const MAX_BYTES = 32_000
const KEEP_RECENTS = 50
const SHOW_RECENTS = 20

const readRecents = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ path: string; kind: string; label: string; visitedAt: Date }>`
      select path, kind, label, visited_at from recents order by visited_at desc limit ${SHOW_RECENTS}`,
    (rows): Array<Recent> =>
      rows.map((r) => ({ path: r.path, kind: r.kind, label: r.label, at: r.visitedAt.getTime() }))
  )

export const get = Effect.fn("Prefs.get")(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<{ section: string; value: unknown; version: number }>`
        select section, value, version from user_prefs`
      return new Prefs({
        sections: Object.fromEntries(rows.map((r) => [r.section, { value: r.value as never, version: r.version }])),
        recents: yield* readRecents(sql)
      })
    })
  )
})

export const patch = Effect.fn("Prefs.patch")(function*(input: PatchPref) {
  const json = JSON.stringify(input.value)
  if (json.length > MAX_BYTES) return yield* new Invalid({ fields: { value: "too_large" } })
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = input.baseVersion === 0
        ? yield* sql<{ version: number }>`
            insert into user_prefs (workspace_id, member_id, section, value)
            values (${workspaceId}, ${id}, ${input.section}, ${json}::jsonb)
            on conflict (member_id, section) do nothing
            returning version`
        : yield* sql<{ version: number }>`
            update user_prefs set value = ${json}::jsonb, version = version + 1, updated_at = now()
            where section = ${input.section} and version = ${input.baseVersion}
            returning version`
      if (row === undefined) return yield* new Conflict({ entity: "prefs", reason: "stale_version" })
      return { value: input.value, version: row.version }
    })
  )
})

export const recordVisit = Effect.fn("Prefs.recordVisit")(function*(input: RecordVisit) {
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into recents (workspace_id, member_id, path, kind, label)
                 values (${workspaceId}, ${id}, ${input.path.slice(0, 300)}, ${input.kind.slice(0, 40)},
                         ${input.label.slice(0, 120)})
                 on conflict (member_id, path) do update set label = excluded.label, kind = excluded.kind,
                   visited_at = now()`
      yield* sql`delete from recents where member_id = ${id} and path not in (
                   select path from recents where member_id = ${id} order by visited_at desc limit ${KEEP_RECENTS})`
      return yield* readRecents(sql)
    })
  )
})
