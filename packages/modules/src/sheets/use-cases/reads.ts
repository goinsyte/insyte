import { Db } from "@insyte/database/Db"
import { Forbidden } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import {
  type ListInput,
  SheetDetail,
  SheetList,
  SheetNotFound,
  SheetRow,
  type SheetView,
  type Tab
} from "../domain/Sheets.ts"

/*
 * Rekenbladen's reads (M14 step 4): the sheets a member can open (their own and those shared with them), with their own
 * pin and when they last opened each, the panel's counts and the workspace's folders; one sheet with all its tabs. Data
 * · Bekijken for each. A key reads as the member who made it, so it sees that member's sheets and no one else's.
 */

/** Whose sheets these are: the member, or for a key or an agent the member who made it; `null` for anyone else. */
export const viewerOf = Effect.fn("Sheets.viewer")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  if (principal.kind === "member") return principal.id
  if (principal.kind === "api_key" || principal.kind === "agent") {
    const [row] = yield* sql<{ createdBy: string }>`select created_by from api_keys where id = ${principal.id}`
    return row?.createdBy ?? null
  }
  return null
})

/** The member whose sheets these are, or `Forbidden` for a principal that has none. */
export const viewer = Effect.fn("Sheets.requireViewer")(function*(sql: SqlClient.SqlClient) {
  const me = yield* viewerOf(sql)
  if (me !== null) return me
  const { role } = yield* CurrentPrincipal
  return yield* new Forbidden({ permission: "data", level: 1, roleLabel: role.label })
})

/** The sheets `me` can open: their own and those shared with them, the removed ones aside. */
export const canOpen = (sql: SqlClient.SqlClient, me: string, alias = "s"): Statement.Fragment =>
  sql`(${sql.literal(alias)}.owner_member_id = ${me} or exists (
         select 1 from sheet_shares x where x.sheet_id = ${sql.literal(alias)}.id and x.member_id = ${me}))`

interface RowRecord {
  readonly id: string
  readonly title: string
  readonly folderId: string | null
  readonly ownerId: string
  readonly archivedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly pinned: boolean
  readonly openedAt: Date | null
  readonly sharedWith: ReadonlyArray<string> | null
  readonly linked: boolean
  readonly preview: Tab | null
}

const toRow = (r: RowRecord) =>
  new SheetRow({
    id: r.id,
    title: r.title,
    folderId: r.folderId,
    ownerId: r.ownerId,
    sharedWith: [...(r.sharedWith ?? [])],
    pinned: r.pinned,
    archived: r.archivedAt !== null,
    linked: r.linked,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    openedAt: r.openedAt?.getTime() ?? null,
    previewTab: r.preview === null
      ? null
      : { ...r.preview, cells: r.preview.cells ?? {}, widths: r.preview.widths ?? {} }
  })

/** The rows for these sheets (or every one `me` can open), as a card shows them. */
export const rowsFor = Effect.fn("Sheets.rows")(function*(
  sql: SqlClient.SqlClient,
  me: string,
  ids?: ReadonlyArray<string>
) {
  if (ids !== undefined && ids.length === 0) return []
  const which = ids === undefined ? sql`true` : sql`s.id in ${sql.in([...new Set(ids)])}`
  const rows = yield* sql<RowRecord>`
    select s.id, s.title, s.folder_id, s.owner_member_id as owner_id, s.archived_at, s.created_at, s.updated_at,
           coalesce(ms.pinned, false) as pinned, ms.opened_at,
           (select array_agg(x.member_id order by x.granted_at, x.member_id) from sheet_shares x
            where x.sheet_id = s.id) as shared_with,
           exists (select 1 from sheet_tabs t where t.sheet_id = s.id and t.cells::text ilike '%insyte(%') as linked,
           (select json_build_object('id', t.id, 'name', t.name, 'cells', t.cells, 'widths', t.widths)
            from sheet_tabs t where t.sheet_id = s.id order by t.position limit 1) as preview
    from sheets s
    left join sheet_member_state ms on ms.sheet_id = s.id and ms.member_id = ${me}
    where s.deleted_at is null and ${canOpen(sql, me)} and ${which}
    order by s.updated_at desc, s.id`
  return rows.map(toRow)
})

const inView = (row: SheetRow, me: string, view: SheetView | undefined) => {
  switch (view) {
    case undefined:
      return true
    case "archive":
      return row.archived
    case "pinned":
      return !row.archived && row.pinned
    case "shared":
      return !row.archived && row.ownerId !== me
    case "all":
    case "recent":
      return !row.archived
  }
}

/** `Sheets.list`: the reader's sheets with the panel's counts and the folders. */
export const list = Effect.fn("Sheets.list")(function*(input: ListInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const all = yield* rowsFor(sql, me)
      const live = all.filter((r) => !r.archived)
      const folders = yield* sql<{ id: string; name: string }>`
        select id, name from sheet_folders order by lower(name), id`
      const q = input.q?.trim().toLowerCase() ?? ""
      let rows = all.filter((r) =>
        inView(r, me, input.view) &&
        (input.folderId === undefined || r.folderId === input.folderId) &&
        (q === "" || r.title.toLowerCase().includes(q))
      )
      if (input.view === "recent") {
        rows = rows.filter((r) => r.openedAt !== null).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)).slice(0, 8)
      }
      return new SheetList({
        rows,
        counts: {
          all: live.length,
          pinned: live.filter((r) => r.pinned).length,
          shared: live.filter((r) => r.ownerId !== me).length,
          archive: all.length - live.length
        },
        folders: folders.map((f) => ({ ...f, count: live.filter((r) => r.folderId === f.id).length })),
        any: all.length > 0
      })
    })
  )
})

/** The tabs of a sheet, in order. */
export const tabsOf = Effect.fn("Sheets.tabs")(function*(sql: SqlClient.SqlClient, sheetId: string) {
  const rows = yield* sql<{ id: string; name: string; cells: Tab["cells"] | null; widths: Tab["widths"] | null }>`
    select id, name, cells, widths from sheet_tabs where sheet_id = ${sheetId} order by position, id`
  return rows.map((t): Tab => ({ id: t.id, name: t.name, cells: t.cells ?? {}, widths: t.widths ?? {} }))
})

/** One sheet `me` can open, with every tab; `SheetNotFound` otherwise. */
export const detailOf = Effect.fn("Sheets.detail")(function*(sql: SqlClient.SqlClient, me: string, id: string) {
  const [row] = yield* rowsFor(sql, me, [id])
  if (row === undefined) return yield* new SheetNotFound({ id })
  const [meta] = yield* sql<{ version: number; folderName: string | null }>`
    select s.version, f.name as folder_name from sheets s left join sheet_folders f on f.id = s.folder_id
    where s.id = ${id}`
  return new SheetDetail({
    id: row.id,
    title: row.title,
    folder: row.folderId === null || meta?.folderName == null ? null : { id: row.folderId, name: meta.folderName },
    ownerId: row.ownerId,
    sharedWith: row.sharedWith,
    pinned: row.pinned,
    archived: row.archived,
    version: Number(meta?.version ?? 1),
    updatedAt: row.updatedAt,
    tabs: yield* tabsOf(sql, id)
  })
})

/** `Sheets.get`: one sheet with all its tabs. */
export const get = Effect.fn("Sheets.get")(function*(id: string) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.flatMap(viewer(sql), (me) => detailOf(sql, me, id)))
})

/** `Sheets.counts` and `Sheets.folders`: the panel's half of `list`. */
export const counts = Effect.fn("Sheets.counts")(function*() {
  const all = yield* list({})
  return all.counts
})

export const folders = Effect.fn("Sheets.folders")(function*() {
  const all = yield* list({})
  return all.folders
})
