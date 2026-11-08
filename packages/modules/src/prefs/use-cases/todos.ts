import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type AddTodo, Todo } from "../domain/Prefs.ts"

/*
 * Start's to-dos (M4.2): the member's own short list. Open ones first, newest first; removing is soft for "Ongedaan
 * maken". Every write answers the whole list.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

interface Row {
  readonly id: string
  readonly text: string
  readonly due: string | null
  readonly doneAt: Date | null
  readonly createdAt: Date
}

const readTodos = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<Row>`select id, text, to_char(due, 'YYYY-MM-DD') as due, done_at, created_at from todos
             where deleted_at is null order by done_at is not null, created_at desc`,
    (rows) =>
      rows.map((r) =>
        new Todo({
          id: r.id,
          text: r.text,
          done: r.doneAt !== null,
          due: r.due,
          doneAt: r.doneAt?.getTime() ?? null,
          createdAt: r.createdAt.getTime()
        })
      )
  )

const own = (sql: SqlClient.SqlClient, id: string, removed = false) =>
  Effect.flatMap(
    sql<{ id: string }>`select id from todos where id = ${id} and (deleted_at is null) = ${!removed}`,
    ([row]) => row === undefined ? Effect.fail(new NotFound({ entity: "todo", id })) : Effect.void
  )

export const list = Effect.fn("Todos.list")(function*() {
  const db = yield* Db
  return yield* db.scoped(readTodos)
})

export const add = Effect.fn("Todos.add")(function*(input: AddTodo) {
  const text = input.text.trim()
  const fields: Record<string, string> = {}
  if (text.length === 0 || text.length > 280) fields["text"] = text.length === 0 ? "required" : "too_long"
  if (input.due !== null && !DATE.test(input.due)) fields["due"] = "format"
  if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })
  const { workspaceId, id: memberId } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into todos (id, workspace_id, member_id, text, due)
                 values (${mintId("todo")}, ${workspaceId}, ${memberId}, ${text}, ${input.due}::date)`
      return yield* readTodos(sql)
    })
  )
})

export const toggle = Effect.fn("Todos.toggle")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, id)
      yield* sql`update todos set done_at = case when done_at is null then now() else null end where id = ${id}`
      return yield* readTodos(sql)
    })
  )
})

export const remove = Effect.fn("Todos.remove")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, id)
      yield* sql`update todos set deleted_at = now() where id = ${id}`
      return yield* readTodos(sql)
    })
  )
})

export const restore = Effect.fn("Todos.restore")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* own(sql, id, true)
      yield* sql`update todos set deleted_at = null where id = ${id}`
      return yield* readTodos(sql)
    })
  )
})
