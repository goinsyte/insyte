import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { decodeCursor, encodeCursor } from "../../shared/tables/FilterSql.ts"
import { actorKey, actorNames } from "../../shared/use-cases/Actors.ts"
import {
  type AuditExport,
  type AuditFacets,
  type AuditLine,
  type AuditPage,
  changesOf,
  type ExportInput,
  type ListInput,
  pageOf,
  pagesOf,
  sectionsOfPage,
  toCsv
} from "../domain/Audit.ts"

/*
 * The Logboek's reads (M17 step 20.1a; api.md §2.34): `audit_events` with `section` set, newest first, by the keyset
 * `(at, id)`, inside the workspace (its policy, and named again so the `audit_section` index serves it). Reading takes
 * Instellingen · Bekijken; the CSV also the export right. An audit row becomes a line per changed field.
 */

/** Audit rows per page; a row may make several lines. */
const PAGE_ROWS = 100
/** Audit rows per export, past which the file says it stopped. */
const EXPORT_ROWS = 5000

interface Row {
  readonly id: string
  readonly at: Date
  readonly actorKind: string
  readonly actorId: string
  readonly action: string
  readonly section: string
  readonly diff: unknown
}

type Narrowing = Pick<ListInput, "days" | "actor" | "page">

const where = (sql: SqlClient.SqlClient, workspaceId: string, input: Narrowing, after?: readonly [Date, string]) => {
  const parts = [sql`workspace_id = ${workspaceId}`, sql`section is not null`]
  if (input.days !== undefined) parts.push(sql`at > now() - make_interval(days => ${input.days})`)
  if (input.actor !== undefined) {
    const split = input.actor.indexOf(":")
    parts.push(sql`actor_kind = ${input.actor.slice(0, split)} and actor_id = ${input.actor.slice(split + 1)}`)
  }
  if (input.page !== undefined) parts.push(sql`section = any(${[...sectionsOfPage(input.page)]})`)
  if (after !== undefined) parts.push(sql`(at, id) < (${after[0]}, ${after[1]})`)
  return sql.and(parts)
}

const linesOf = Effect.fn("Audit.linesOf")(
  function*(sql: SqlClient.SqlClient, rows: ReadonlyArray<Row>, page?: string) {
    const names = yield* actorNames(sql, rows.map((r) => ({ kind: r.actorKind, id: r.actorId })))
    const lines: Array<AuditLine> = []
    for (const r of rows) {
      const on = pageOf(r.section, r.action)
      if (page !== undefined && on.id !== page) continue
      const key = actorKey({ kind: r.actorKind, id: r.actorId })
      const actor = { key, name: names.get(key) ?? "Onbekend" }
      for (const [i, change] of changesOf(r).entries()) {
        lines.push({
          id: `${r.id}:${i}`,
          at: r.at.getTime(),
          actor,
          page: on.label,
          path: on.path === "" ? null : on.path,
          ...change
        })
      }
    }
    return lines
  }
)

const checkActor = (input: Narrowing) =>
  input.actor !== undefined && input.actor.indexOf(":") < 1
    ? Effect.fail(new Invalid({ fields: { actor: "invalid" } }))
    : Effect.void

export const list = Effect.fn("Audit.list")(function*(input: ListInput) {
  yield* Policy.require("settings", 1)
  yield* checkActor(input)
  const principal = yield* CurrentPrincipal
  const key = yield* decodeCursor(input.cursor).pipe(
    Effect.mapError(() => new Invalid({ fields: { cursor: "invalid" } }))
  )
  const after = key === undefined || typeof key[0] !== "number" || typeof key[1] !== "string"
    ? undefined
    : [new Date(key[0]), key[1]] as const
  if (key !== undefined && after === undefined) return yield* new Invalid({ fields: { cursor: "invalid" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<Row>`
        select id, at, actor_kind, actor_id, action, section, diff from audit_events
        where ${where(sql, principal.workspaceId, input, after)}
        order by at desc, id desc limit ${PAGE_ROWS + 1}`
      const page = rows.slice(0, PAGE_ROWS)
      const last = page.at(-1)
      return {
        lines: yield* linesOf(sql, page, input.page),
        next: rows.length > PAGE_ROWS && last !== undefined ? encodeCursor([last.at.getTime(), last.id]) : null
      } satisfies AuditPage
    })
  )
})

/** The people and pages in the log, for its filters. */
export const facets = Effect.fn("Audit.facets")(function*() {
  yield* Policy.require("settings", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const sections = yield* sql<{ section: string; action: string }>`
        select section, action from audit_events where workspace_id = ${principal.workspaceId} and section is not null
        group by section, action`
      const actors = yield* sql<{ actorKind: string; actorId: string }>`
        select actor_kind, actor_id from audit_events
        where workspace_id = ${principal.workspaceId} and section is not null group by actor_kind, actor_id`
      const refs = actors.map((a) => ({ kind: a.actorKind, id: a.actorId }))
      const names = yield* actorNames(sql, refs)
      return {
        actors: refs.map((a) => ({ key: actorKey(a), name: names.get(actorKey(a)) ?? "Onbekend" }))
          .sort((a, b) => a.name.localeCompare(b.name, "nl")),
        pages: pagesOf(sections).map((p) => ({ id: p.id, label: p.label }))
      } satisfies AuditFacets
    })
  )
})

/** "Exporteren": the lines as they are narrowed, in the workspace's own time, up to `EXPORT_ROWS` changes. */
export const exportCsv = Effect.fn("Audit.export")(function*(input: ExportInput) {
  yield* Policy.require("settings", 1)
  yield* Policy.requireAction("data.export")
  yield* checkActor(input)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<Row>`
        select id, at, actor_kind, actor_id, action, section, diff from audit_events
        where ${where(sql, principal.workspaceId, input)}
        order by at desc, id desc limit ${EXPORT_ROWS + 1}`
      const [workspace] = yield* sql<{ timezone: string }>`
        select timezone from workspaces where id = ${principal.workspaceId}`
      const lines = yield* linesOf(sql, rows.slice(0, EXPORT_ROWS), input.page)
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: workspace?.timezone ?? "Europe/Amsterdam" })
        .format(new Date())
      return {
        filename: `logboek-${day}.csv`,
        csv: toCsv(lines, workspace?.timezone ?? "Europe/Amsterdam"),
        lines: lines.length,
        truncated: rows.length > EXPORT_ROWS
      } satisfies AuditExport
    })
  )
})
