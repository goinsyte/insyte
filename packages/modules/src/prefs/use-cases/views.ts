import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  type FilterGroup,
  type RenameView,
  SavedView,
  type SaveView,
  type UpdateView,
  ViewNameTaken
} from "../domain/Prefs.ts"

/*
 * Saved views (M4.2): a named filter on one list, the member's own. Names are unique per list, ignoring case; removing
 * is soft, so the toast's "Ongedaan maken" puts the view back as it was. Every write answers the whole list.
 */

interface Row {
  readonly id: string
  readonly listKey: string
  readonly name: string
  readonly filter: FilterGroup
  readonly pinned: boolean
  readonly createdAt: Date
}

const readViews = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<Row>`select id, list_key, name, filter, pinned, created_at from saved_views
             where deleted_at is null order by list_key, position, created_at`,
    (rows) => rows.map((r) => new SavedView({ ...r, createdAt: r.createdAt.getTime() }))
  )

const checkName = (name: string) => {
  const trimmed = name.trim()
  return trimmed.length === 0 || trimmed.length > 60
    ? Effect.fail(new Invalid({ fields: { name: trimmed.length === 0 ? "required" : "too_long" } }))
    : Effect.succeed(trimmed)
}

/** No other live view of the member's on `listKey` has this name, ignoring case. */
const ensureFree = (sql: SqlClient.SqlClient, listKey: string, name: string, except: string | null) =>
  Effect.flatMap(
    sql<{ id: string }>`select id from saved_views where list_key = ${listKey} and lower(name) = lower(${name})
                        and deleted_at is null and id is distinct from ${except}`,
    ([clash]) => clash === undefined ? Effect.void : Effect.fail(new ViewNameTaken({ name }))
  )

/** One of the member's views that is not removed, or `NotFound`. */
const own = (sql: SqlClient.SqlClient, id: string, removed = false) =>
  Effect.flatMap(
    sql<{ listKey: string; name: string }>`select list_key, name from saved_views where id = ${id}
                                           and (deleted_at is null) = ${!removed}`,
    ([row]) => row === undefined ? Effect.fail(new NotFound({ entity: "saved_view", id })) : Effect.succeed(row)
  )

export const list = Effect.fn("Views.list")(function*() {
  const db = yield* Db
  return yield* db.scoped(readViews)
})

export const save = Effect.fn("Views.save")(function*(input: SaveView) {
  const name = yield* checkName(input.name)
  const { workspaceId, id: memberId } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* ensureFree(sql, input.listKey, name, null)
      yield* sql`insert into saved_views (id, workspace_id, member_id, list_key, name, filter)
                 values (${mintId("view")}, ${workspaceId}, ${memberId}, ${input.listKey}, ${name},
                         ${JSON.stringify(input.filter)}::jsonb)`
      return yield* readViews(sql)
    })
  )
})

export const update = Effect.fn("Views.update")(function*(input: UpdateView) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, input.id)
      yield* sql`update saved_views set filter = ${JSON.stringify(input.filter)}::jsonb where id = ${input.id}`
      return yield* readViews(sql)
    })
  )
})

export const rename = Effect.fn("Views.rename")(function*(input: RenameView) {
  const name = yield* checkName(input.name)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const view = yield* own(sql, input.id)
      yield* ensureFree(sql, view.listKey, name, input.id)
      yield* sql`update saved_views set name = ${name} where id = ${input.id}`
      return yield* readViews(sql)
    })
  )
})

export const remove = Effect.fn("Views.remove")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, id)
      yield* sql`update saved_views set deleted_at = now() where id = ${id}`
      return yield* readViews(sql)
    })
  )
})

export const restore = Effect.fn("Views.restore")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const view = yield* own(sql, id, true)
      yield* ensureFree(sql, view.listKey, view.name, id)
      yield* sql`update saved_views set deleted_at = null where id = ${id}`
      return yield* readViews(sql)
    })
  )
})

export const togglePin = Effect.fn("Views.togglePin")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, id)
      yield* sql`update saved_views set pinned = not pinned where id = ${id}`
      return yield* readViews(sql)
    })
  )
})
