import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { actorKey, actorNames } from "../../shared/use-cases/Actors.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  KIND_AREA,
  type TrashIds,
  type TrashItem,
  type TrashKind,
  type TrashList,
  type TrashPurged,
  type TrashRestored
} from "../domain/Trash.ts"
import { TrashKinds } from "../TrashKinds.ts"

/*
 * The Prullenbak's commands (M17 step 20.1a; api.md §2.34). Every one takes Instellingen · Bewerken; an item is listed
 * where the role sees its kind's area (and its store), put back through its own slice's command at that slice's level,
 * and purged at Beheren there. Purging and emptying are irreversible: the console asks first and offers no undo.
 */

interface Row {
  readonly id: string
  readonly kind: TrashKind
  readonly title: string
  readonly deletedAt: Date
  readonly purgeAt: Date
  readonly deletedByKind: string | null
  readonly deletedById: string | null
}

const KNOWN = new Set<string>(Object.keys(KIND_AREA))

/** Whether the principal's role reaches `level` in the kind's area. */
const reaches = (kind: TrashKind, level: 1 | 2 | 3) =>
  Policy.require(KIND_AREA[kind], level).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )

/** The items the principal sees, still inside their 30 days: all of them, or those of `ids`. */
const visible = Effect.fn("Trash.visible")(function*(sql: SqlClient.SqlClient, ids?: ReadonlyArray<string>) {
  const principal = yield* CurrentPrincipal
  const scope = yield* inScope(sql, "t.store_id")
  const parts = [
    sql`t.workspace_id = ${principal.workspaceId}`,
    sql`t.purge_at > now()`,
    sql`(t.store_id is null or ${scope})`,
    ...(ids === undefined ? [] : [sql`t.id in ${sql.in([...ids])}`])
  ]
  const rows = yield* sql<Row>`
    select t.id, t.kind, t.title, t.deleted_at, t.purge_at, t.deleted_by_kind, t.deleted_by_id
    from trash_items_v t where ${sql.and(parts)}
    order by t.deleted_at desc, t.id limit 1000`
  const seen: Array<Row> = []
  for (const r of rows) if (KNOWN.has(r.kind) && (yield* reaches(r.kind, 1))) seen.push(r)
  return seen
})

const byKind = (rows: ReadonlyArray<Row>) => {
  const groups = new Map<TrashKind, Array<string>>()
  for (const r of rows) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r.id])
  return groups
}

const found = (rows: ReadonlyArray<Row>, ids: ReadonlyArray<string>) => {
  const missing = ids.find((id) => !rows.some((r) => r.id === id))
  return missing === undefined ? Effect.void : Effect.fail(new NotFound({ entity: "trash_item", id: missing }))
}

/** "Verwijderd, de laatste 30 dagen": newest first, each with who deleted it. */
export const list = Effect.fn("Trash.list")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* visible(sql)
      const by = rows.flatMap((r) =>
        r.deletedByKind === null || r.deletedById === null ? [] : [{ kind: r.deletedByKind, id: r.deletedById }]
      )
      const names = yield* actorNames(sql, by)
      return {
        items: rows.map((r): TrashItem => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          deletedBy: r.deletedByKind === null || r.deletedById === null
            ? null
            : names.get(actorKey({ kind: r.deletedByKind, id: r.deletedById })) ?? null,
          deletedAt: r.deletedAt.getTime(),
          purgeAt: r.purgeAt.getTime()
        }))
      } satisfies TrashList
    })
  )
})

/** "Terugzetten": each kind's own put-back, so its policy, its audit and its undo are the slice's. */
export const restore = Effect.fn("Trash.restore")(function*(input: TrashIds) {
  yield* Policy.require("settings", 2)
  const kinds = yield* TrashKinds
  const db = yield* Db
  const ids = [...new Set(input.ids)]
  const rows = yield* db.scoped((sql) => visible(sql, ids))
  yield* found(rows, ids)
  const undo: Array<TrashRestored["undo"][number]> = []
  for (const [kind, of] of byKind(rows)) {
    yield* Policy.require(KIND_AREA[kind], 2)
    undo.push(...(yield* kinds[kind].restore(of)))
  }
  return { restored: ids, undo } satisfies TrashRestored
})

/** Purges `rows` on the transaction, kind by kind, each at Beheren in its area. */
const purgeRows = Effect.fn("Trash.purgeRows")(function*(sql: SqlClient.SqlClient, rows: ReadonlyArray<Row>) {
  const principal = yield* CurrentPrincipal
  const kinds = yield* TrashKinds
  const groups = byKind(rows)
  for (const kind of groups.keys()) yield* Policy.require(KIND_AREA[kind], 3)
  const actor = { kind: principal.kind, id: principal.id }
  for (const [kind, of] of groups) yield* kinds[kind].purge(sql, principal.workspaceId, of, actor)
  return { purged: rows.length } satisfies TrashPurged
})

/** "Definitief verwijderen": gone, with no way back. */
export const purge = Effect.fn("Trash.purge")(function*(input: TrashIds) {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const ids = [...new Set(input.ids)]
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* visible(sql, ids)
      yield* found(rows, ids)
      return yield* purgeRows(sql, rows)
    })
  )
})

/** "Prullenbak legen": every item the principal sees, gone. */
export const empty = Effect.fn("Trash.empty")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.flatMap(visible(sql), (rows) => purgeRows(sql, rows)))
})

/** The workspaces holding an item past its 30 days (0060), for the daily sweep. */
export const dueWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from trash_due_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** Rows a sweep purges per workspace per turn; the rest wait for the next. */
const SWEEP_ROWS = 500

/** One workspace's items past their 30 days, purged as `system`. Answers how many. */
export const sweepWorkspace = Effect.fn("Trash.sweepWorkspace")(function*() {
  const kinds = yield* TrashKinds
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const workspace = yield* CurrentWorkspace
      const rows = yield* sql<{ id: string; kind: TrashKind }>`
        select id, kind from trash_items_v where workspace_id = ${workspace.id} and purge_at <= now()
        order by deleted_at limit ${SWEEP_ROWS}`
      const groups = new Map<TrashKind, Array<string>>()
      for (const r of rows) {
        if (KNOWN.has(r.kind)) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r.id])
      }
      for (const [kind, of] of groups) {
        yield* kinds[kind].purge(sql, workspace.id, of, { kind: "system", id: "system" })
      }
      return rows.length
    })
  )
})
