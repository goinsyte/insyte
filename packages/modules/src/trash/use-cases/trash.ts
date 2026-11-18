import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Option } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { actorKey, actorNames } from "../../shared/use-cases/Actors.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  TRASH_KINDS,
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
 * where the role sees its kind's area (and its store, and it is theirs where the kind is personal), put back through
 * its own slice's command at that slice's level, and purged at the kind's purge level (`TRASH_KINDS`). Purging and
 * emptying are irreversible: the console asks first and offers no undo.
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

const KNOWN = new Set<string>(Object.keys(TRASH_KINDS))

/** Whether the principal's role reaches the kind's level to see it. */
const sees = (kind: TrashKind) =>
  Policy.require(TRASH_KINDS[kind].area, TRASH_KINDS[kind].see).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )

/** The kind's level (and action) to put it back or purge it, or `Forbidden`. */
const may = Effect.fn("Trash.may")(function*(kind: TrashKind, what: "restore" | "purge") {
  const rule = TRASH_KINDS[kind]
  yield* Policy.require(rule.area, rule[what])
  if (rule.action !== undefined) yield* Policy.requireAction(rule.action)
})

/** The items the principal sees, still inside their 30 days: all of them, or those of `ids`. */
const visible = Effect.fn("Trash.visible")(function*(sql: SqlClient.SqlClient, ids?: ReadonlyArray<string>) {
  const principal = yield* CurrentPrincipal
  const scope = yield* inScope(sql, "t.store_id")
  // A personal item (a sheet) is its owner's alone: a key or the system has none.
  const me = principal.kind === "member" ? principal.id : null
  const parts = [
    sql`t.workspace_id = ${principal.workspaceId}`,
    sql`t.purge_at > now()`,
    sql`(t.store_id is null or ${scope})`,
    me === null ? sql`t.owner_id is null` : sql`(t.owner_id is null or t.owner_id = ${me})`,
    ...(ids === undefined ? [] : [sql`t.id in ${sql.in([...ids])}`])
  ]
  const rows = yield* sql<Row>`
    select t.id, t.kind, t.title, t.deleted_at, t.purge_at, t.deleted_by_kind, t.deleted_by_id
    from trash_items_v t where ${sql.and(parts)}
    order by t.deleted_at desc, t.id limit 1000`
  const seen: Array<Row> = []
  for (const r of rows) if (KNOWN.has(r.kind) && (yield* sees(r.kind))) seen.push(r)
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
  const groups = byKind(rows)
  // Every kind's level first: a refusal puts nothing back.
  for (const kind of groups.keys()) yield* may(kind, "restore")
  const undo: Array<TrashRestored["undo"][number]> = []
  for (const [kind, of] of groups) undo.push(...(yield* kinds[kind].restore(of)))
  return { restored: ids, undo } satisfies TrashRestored
})

/** Purges `rows` on the transaction, kind by kind, each at its kind's purge level. */
const purgeRows = Effect.fn("Trash.purgeRows")(function*(sql: SqlClient.SqlClient, rows: ReadonlyArray<Row>) {
  const principal = yield* CurrentPrincipal
  const kinds = yield* TrashKinds
  const groups = byKind(rows)
  for (const kind of groups.keys()) yield* may(kind, "purge")
  const actor = { kind: principal.kind, id: principal.id }
  const objects: Array<string> = []
  for (const [kind, of] of groups) {
    objects.push(...((yield* kinds[kind].purge(sql, principal.workspaceId, of, actor)) ?? []))
  }
  return { purged: { purged: rows.length } satisfies TrashPurged, objects }
})

/**
 * The bucket objects a purge left behind (a course's images), removed once it has committed: best effort, as
 * `FileStore.remove` is, so an object a failed delete keeps holds nothing a row still points at.
 */
const removeObjects = (objects: ReadonlyArray<string>) =>
  objects.length === 0 ? Effect.void : Effect.flatMap(Effect.serviceOption(FileStore), (store) =>
    Option.isSome(store) ?
      Effect.forEach(chunks(objects, 1000), (keys) => store.value.remove(keys), { discard: true }) :
      Effect.void)

const chunks = <A>(xs: ReadonlyArray<A>, size: number) =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size))

/** "Definitief verwijderen": gone, with no way back. */
export const purge = Effect.fn("Trash.purge")(function*(input: TrashIds) {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const ids = [...new Set(input.ids)]
  const { purged, objects } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* visible(sql, ids)
      yield* found(rows, ids)
      return yield* purgeRows(sql, rows)
    })
  )
  yield* removeObjects(objects)
  return purged
})

/** "Prullenbak legen": every item the principal sees, gone. */
export const empty = Effect.fn("Trash.empty")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const { purged, objects } = yield* db.scoped((sql) => Effect.flatMap(visible(sql), (rows) => purgeRows(sql, rows)))
  yield* removeObjects(objects)
  return purged
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
  const { count, objects } = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const workspace = yield* CurrentWorkspace
      const rows = yield* sql<{ id: string; kind: TrashKind }>`
        select id, kind from trash_items_v where workspace_id = ${workspace.id} and purge_at <= now()
        order by deleted_at limit ${SWEEP_ROWS}`
      const groups = new Map<TrashKind, Array<string>>()
      for (const r of rows) {
        if (KNOWN.has(r.kind)) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r.id])
      }
      const objects: Array<string> = []
      for (const [kind, of] of groups) {
        objects.push(...((yield* kinds[kind].purge(sql, workspace.id, of, { kind: "system", id: "system" })) ?? []))
      }
      return { count: rows.length, objects }
    })
  )
  yield* removeObjects(objects)
  return count
})
