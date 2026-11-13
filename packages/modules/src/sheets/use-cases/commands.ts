import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { monthRowsTo, TEMPLATES, templateTabs } from "@insyte/domain/sheet-templates"
import {
  figureKey,
  figureRequests,
  type Figures,
  type SheetError,
  type Tab as EngineTab,
  tabRows,
  toCsv
} from "@insyte/domain/sheets"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { SheetFigures } from "../domain/Ports.ts"
import {
  type CreateFolderInput,
  type CreateInput,
  type ExportInput,
  FolderMade,
  FolderNameTaken,
  FolderNotFound,
  NotSheetOwner,
  type SaveTabsInput,
  type ShareInput,
  ShareTargetInactive,
  SheetChange,
  SheetExport,
  SheetMade,
  SheetNotFound,
  SheetsRestore,
  type Tab,
  TabsSaved,
  type UpdateInput
} from "../domain/Sheets.ts"
import { canOpen, detailOf, rowsFor, tabsOf, viewer } from "./reads.ts"

/*
 * Rekenbladen's commands (M14 step 4; widgets/02 Part C). Data · Bekijken makes and changes one's own sheets; whoever
 * can open a sheet (its owner and those it is shared with) edits, renames, moves, pins, archives and copies it; only
 * its owner shares and removes it. Every change but a save has one undo token (`sheets.restore`) that puts the sheets
 * back as they were. A save of the tabs names the version it started from and a stale one is a `Conflict`; the editor's
 * own stack is its undo. Each change tells the tabs of everyone who can open the sheet (`sheet.changed`).
 */

export const RESTORE = "sheets.restore"

/** How long a run of saves by one member is one `sheets.edit` audit entry. */
const EDIT_AUDIT_MINUTES = 5

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, { action, subjectType: "sheet", subjectId: id, diff })
  )

/** Tells the tabs of everyone who can open these sheets that they changed. */
const changed = Effect.fn("Sheets.changed")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const principal = yield* CurrentPrincipal
  for (const id of new Set(ids)) {
    const [row] = yield* sql<{ version: number; to: ReadonlyArray<string> | null }>`
      select s.version, array_remove(array_append(
               (select array_agg(x.member_id) from sheet_shares x where x.sheet_id = s.id), s.owner_member_id),
               null) as to
      from sheets s where s.id = ${id}`
    if (row === undefined) continue
    const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
      type: "sheet.changed",
      workspaceId: principal.workspaceId,
      sheetId: id,
      version: Number(row.version),
      by: principal.id,
      to: [...new Set(row.to ?? [])]
    })
    ;(yield* PendingEvents)?.add(outboxId)
  }
})

interface Locked {
  readonly id: string
  readonly title: string
  readonly folderId: string | null
  readonly ownerId: string
  readonly version: number
  readonly archived: boolean
  readonly deleted: boolean
  readonly pinned: boolean
}

/** The sheets `me` can open, locked; `SheetNotFound` for the first that is not one. `removed` includes the bin's. */
const lock = Effect.fn("Sheets.lock")(function*(
  sql: SqlClient.SqlClient,
  me: string,
  ids: ReadonlyArray<string>,
  options: { readonly removed?: boolean } = {}
) {
  const wanted = [...new Set(ids)]
  const rows = yield* sql<Locked>`
    select s.id, s.title, s.folder_id, s.owner_member_id as owner_id, s.version, s.archived_at is not null as archived,
           s.deleted_at is not null as deleted,
           coalesce((select ms.pinned from sheet_member_state ms where ms.sheet_id = s.id and ms.member_id = ${me}),
                    false) as pinned
    from sheets s
    where s.id in ${sql.in(wanted)} and ${canOpen(sql, me)}
      and ${options.removed === true ? sql`true` : sql`s.deleted_at is null`}
    order by s.id for update of s`
  const found = new Set(rows.map((r) => r.id))
  const missing = wanted.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new SheetNotFound({ id: missing })
  return rows
})

const ownerOnly = (rows: ReadonlyArray<Locked>, me: string) => {
  const other = rows.find((r) => r.ownerId !== me)
  return other === undefined ? Effect.void : Effect.fail(new NotSheetOwner({ id: other.id }))
}

const snapshot = (r: Locked) => ({
  id: r.id,
  title: r.title,
  folderId: r.folderId,
  archived: r.archived,
  deleted: r.deleted
})

const folderExists = Effect.fn("Sheets.folderExists")(function*(sql: SqlClient.SqlClient, id: string) {
  const [row] = yield* sql<{ id: string }>`select id from sheet_folders where id = ${id}`
  if (row === undefined) return yield* new FolderNotFound({ id })
})

const setPin = (sql: SqlClient.SqlClient, workspaceId: string, sheetId: string, me: string, pinned: boolean) =>
  sql`insert into sheet_member_state (workspace_id, sheet_id, member_id, pinned)
      values (${workspaceId}, ${sheetId}, ${me}, ${pinned})
      on conflict (sheet_id, member_id) do update set pinned = excluded.pinned`

/** The tabs as they will be stored: names trimmed, ids unique, at most 480 cells each (the grid). */
const checked = (tabs: ReadonlyArray<Tab>) => {
  const ids = new Set<string>()
  for (const [i, t] of tabs.entries()) {
    if (t.name.trim() === "") return Effect.fail(new Invalid({ fields: { [`tabs.${i}.name`]: "required" } }))
    if (ids.has(t.id)) return Effect.fail(new Invalid({ fields: { [`tabs.${i}.id`]: "duplicate" } }))
    ids.add(t.id)
  }
  return Effect.succeed(tabs.map((t) => ({ ...t, name: t.name.trim() })))
}

const writeTabs = Effect.fn("Sheets.writeTabs")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  sheetId: string,
  tabs: ReadonlyArray<Tab>
) {
  yield* sql`delete from sheet_tabs where sheet_id = ${sheetId}`
  for (const [position, t] of tabs.entries()) {
    yield* sql`insert into sheet_tabs (id, workspace_id, sheet_id, name, position, cells, widths)
               values (${t.id}, ${workspaceId}, ${sheetId}, ${t.name}, ${position}, ${JSON.stringify(t.cells)}::jsonb,
                       ${JSON.stringify(t.widths)}::jsonb)`
  }
})

const currentMonth = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ month: string }>`
      select to_char(now() at time zone timezone, 'YYYY-MM') as month from workspaces where id = app_workspace_id()`,
    (rows) => rows[0]?.month ?? new Date().toISOString().slice(0, 7)
  )

const restoreToken = (sql: SqlClient.SqlClient, restore: SheetsRestore) =>
  Undo.issue(sql, { command: RESTORE, compensation: restore })

const none = { pins: [], shares: [], folderId: null } as const

/** One new sheet, owned by `me`, opened by them now; its id. */
const make = Effect.fn("Sheets.make")(function*(
  sql: SqlClient.SqlClient,
  me: string,
  fields: {
    readonly title: string
    readonly folderId: string | null
    readonly source: string
    readonly tabs: ReadonlyArray<Tab>
  }
) {
  const principal = yield* CurrentPrincipal
  const id = mintId("sh")
  yield* sql`insert into sheets (id, workspace_id, owner_member_id, title, folder_id, source)
             values (${id}, ${principal.workspaceId}, ${me}, ${fields.title}, ${fields.folderId}, ${fields.source})`
  yield* writeTabs(sql, principal.workspaceId, id, fields.tabs)
  yield* sql`insert into sheet_member_state (workspace_id, sheet_id, member_id, opened_at)
             values (${principal.workspaceId}, ${id}, ${me}, now())`
  return id
})

/** "Rekenblad maken" and "CSV importeren": from a template over the workspace's last five months, or given tabs. */
export const create = Effect.fn("Sheets.create")(function*(input: CreateInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const folderId = input.folderId ?? null
      if (folderId !== null) yield* folderExists(sql, folderId)
      const tabs = input.tabs === undefined
        ? templateTabs(input.template, mintId, monthRowsTo(yield* currentMonth(sql)))
        : yield* checked(input.tabs)
      const fallback = input.template === "blank"
        ? "Naamloos rekenblad"
        : TEMPLATES.find((t) => t.id === input.template)?.title ?? "Naamloos rekenblad"
      const title = (input.title ?? "").trim() || fallback
      const id = yield* make(sql, me, {
        title,
        folderId,
        source: input.source ?? `template:${input.template}`,
        tabs: tabs as ReadonlyArray<Tab>
      })
      yield* audit(sql, "sheets.create", id, { template: input.template, source: input.source ?? null })
      yield* changed(sql, [id])
      const undo = yield* restoreToken(sql, {
        sheets: [{ id, title, folderId, archived: false, deleted: true }],
        ...none
      })
      const [sheet] = yield* rowsFor(sql, me, [id])
      return new SheetMade({ sheet: sheet!, undo })
    })
  )
})

/** The editor's save: the whole tab list, from the version it started at. */
export const saveTabs = Effect.fn("Sheets.saveTabs")(function*(input: SaveTabsInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const me = yield* viewer(sql)
      const [sheet] = yield* lock(sql, me, [input.id])
      if (Number(sheet!.version) !== input.baseVersion) {
        return yield* new Conflict({ entity: "sheet", reason: "stale_version" })
      }
      const tabs = yield* checked(input.tabs)
      yield* writeTabs(sql, principal.workspaceId, input.id, tabs)
      const [saved] = yield* sql<{ version: number; updatedAt: Date }>`
        update sheets set version = version + 1 where id = ${input.id} returning version, updated_at`
      // One entry per run of saves: the editor saves after every pause in typing.
      const [recent] = yield* sql<{ n: number }>`
        select count(*)::int as n from audit_events
        where action = 'sheets.edit' and subject_type = 'sheet' and subject_id = ${input.id}
          and actor_id = ${principal.id} and at > now() - make_interval(mins => ${EDIT_AUDIT_MINUTES})`
      if ((recent?.n ?? 0) === 0) yield* audit(sql, "sheets.edit", input.id, { tabs: tabs.length })
      yield* changed(sql, [input.id])
      return new TabsSaved({ version: Number(saved!.version), updatedAt: saved!.updatedAt.getTime() })
    })
  )
})

/** Rename, move, pin, archive or put back: one token puts every sheet back as it was. */
export const update = Effect.fn("Sheets.update")(function*(input: UpdateInput) {
  yield* Policy.require("data", 1)
  if (input.title !== undefined && input.ids.length !== 1) {
    return yield* new Invalid({ fields: { title: "one_sheet" } })
  }
  if (input.title !== undefined && input.title.trim() === "") {
    return yield* new Invalid({ fields: { title: "required" } })
  }
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const me = yield* viewer(sql)
      const rows = yield* lock(sql, me, input.ids)
      if (input.folderId !== undefined && input.folderId !== null) yield* folderExists(sql, input.folderId)
      for (const r of rows) {
        const title = input.title?.trim() ?? r.title
        const folderId = input.folderId === undefined ? r.folderId : input.folderId
        const archived = input.archived ?? r.archived
        yield* sql`update sheets set title = ${title}, folder_id = ${folderId},
                     archived_at = case when ${archived} then coalesce(archived_at, now()) else null end
                   where id = ${r.id}`
        // Archiving takes it off the reader's pins too, as the design's menu does.
        const pinned = input.archived === true ? false : input.pinned ?? r.pinned
        if (pinned !== r.pinned) yield* setPin(sql, principal.workspaceId, r.id, me, pinned)
        yield* audit(sql, "sheets.update", r.id, {
          ...(title === r.title ? {} : { title: [r.title, title] }),
          ...(folderId === r.folderId ? {} : { folderId: [r.folderId, folderId] }),
          ...(archived === r.archived ? {} : { archived: [r.archived, archived] }),
          ...(pinned === r.pinned ? {} : { pinned: [r.pinned, pinned] })
        })
      }
      yield* changed(sql, rows.map((r) => r.id))
      const undo = yield* restoreToken(sql, {
        sheets: rows.map(snapshot),
        pins: rows.map((r) => ({ id: r.id, pinned: r.pinned })),
        shares: [],
        folderId: null
      })
      return new SheetChange({ sheets: yield* rowsFor(sql, me, rows.map((r) => r.id)), undo })
    })
  )
})

/** "Delen": the owner gives an active teammate edit rights, or takes them away. */
export const share = Effect.fn("Sheets.share")(function*(input: ShareInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const me = yield* viewer(sql)
      const rows = yield* lock(sql, me, [input.id])
      yield* ownerOnly(rows, me)
      if (input.memberId === me) return yield* new Invalid({ fields: { memberId: "self" } })
      const [active] = yield* sql<{ id: string }>`
        select id from members where id = ${input.memberId} and deactivated_at is null and removed_at is null`
      if (active === undefined && input.on) return yield* new ShareTargetInactive({ memberId: input.memberId })
      const [had] = yield* sql<{ n: number }>`
        select count(*)::int as n from sheet_shares where sheet_id = ${input.id} and member_id = ${input.memberId}`
      const was = (had?.n ?? 0) > 0
      // The one taken off still hears of it, so their open tab lets go.
      if (!input.on) yield* changed(sql, [input.id])
      if (input.on) {
        yield* sql`insert into sheet_shares (workspace_id, sheet_id, member_id, granted_by)
                   values (${principal.workspaceId}, ${input.id}, ${input.memberId}, ${me})
                   on conflict (sheet_id, member_id) do nothing`
      } else {
        yield* sql`delete from sheet_shares where sheet_id = ${input.id} and member_id = ${input.memberId}`
      }
      yield* audit(sql, "sheets.share", input.id, { memberId: input.memberId, on: input.on })
      if (input.on) yield* changed(sql, [input.id])
      const undo = yield* restoreToken(sql, {
        sheets: [],
        pins: [],
        shares: [{ id: input.id, memberId: input.memberId, on: was }],
        folderId: null
      })
      return new SheetChange({ sheets: yield* rowsFor(sql, me, [input.id]), undo })
    })
  )
})

/** "Dupliceren": a copy titled "(kopie)", the reader's own, unshared and unpinned, its tabs given new ids. */
export const duplicate = Effect.fn("Sheets.duplicate")(function*(input: { readonly id: string }) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const [src] = yield* lock(sql, me, [input.id])
      const tabs = (yield* tabsOf(sql, input.id)).map((t) => ({ ...t, id: mintId("tab") }))
      const title = `${src!.title.slice(0, 112)} (kopie)`
      const id = yield* make(sql, me, { title, folderId: src!.folderId, source: "duplicate", tabs })
      yield* audit(sql, "sheets.create", id, { from: input.id })
      yield* changed(sql, [id])
      const undo = yield* restoreToken(sql, {
        sheets: [{ id, title, folderId: src!.folderId, archived: false, deleted: true }],
        ...none
      })
      const [sheet] = yield* rowsFor(sql, me, [id])
      return new SheetMade({ sheet: sheet!, undo })
    })
  )
})

/** "Verwijderen": the owner's sheets to the bin; the token, or `restore`, takes them out again. */
export const remove = Effect.fn("Sheets.remove")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const rows = yield* lock(sql, me, input.ids)
      yield* ownerOnly(rows, me)
      const ids = rows.map((r) => r.id)
      yield* sql`update sheets set deleted_at = now() where id in ${sql.in(ids)}`
      for (const id of ids) yield* audit(sql, "sheets.remove", id)
      yield* changed(sql, ids)
      const undo = yield* restoreToken(sql, { sheets: rows.map(snapshot), ...none })
      return new SheetChange({ sheets: [], undo })
    })
  )
})

/** The bin's way back: the owner's removed sheets as they were. */
export const restoreSheets = Effect.fn("Sheets.restore")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const rows = yield* lock(sql, me, input.ids, { removed: true })
      yield* ownerOnly(rows, me)
      const ids = rows.map((r) => r.id)
      yield* sql`update sheets set deleted_at = null where id in ${sql.in(ids)}`
      for (const id of ids) yield* audit(sql, "sheets.restore", id)
      yield* changed(sql, ids)
      const undo = yield* restoreToken(sql, { sheets: rows.map(snapshot), ...none })
      return new SheetChange({ sheets: yield* rowsFor(sql, me, ids), undo })
    })
  )
})

/** Opening a sheet puts it at the top of the reader's "Recent". */
export const markOpened = Effect.fn("Sheets.markOpened")(function*(input: { readonly id: string }) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const me = yield* viewer(sql)
      yield* lock(sql, me, [input.id])
      yield* sql`insert into sheet_member_state (workspace_id, sheet_id, member_id, opened_at)
                 values (${principal.workspaceId}, ${input.id}, ${me}, now())
                 on conflict (sheet_id, member_id) do update set opened_at = excluded.opened_at`
    })
  )
})

/** "Nieuwe map", with the sheets to move into it; the token moves them back and takes the folder away. */
export const createFolder = Effect.fn("Sheets.createFolder")(function*(input: CreateFolderInput) {
  yield* Policy.require("data", 1)
  const name = input.name.trim()
  if (name === "") return yield* new Invalid({ fields: { name: "required" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const me = yield* viewer(sql)
      const [taken] = yield* sql<{ id: string }>`select id from sheet_folders where lower(name) = lower(${name})`
      if (taken !== undefined) return yield* new FolderNameTaken()
      const rows = input.moveSheetIds === undefined || input.moveSheetIds.length === 0
        ? []
        : yield* lock(sql, me, input.moveSheetIds)
      const id = mintId("fld")
      yield* sql`insert into sheet_folders (id, workspace_id, name, created_by)
                 values (${id}, ${principal.workspaceId}, ${name}, ${me})`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "sheets.folder_create",
        subjectType: "sheet",
        subjectId: id,
        diff: { name }
      })
      for (const r of rows) {
        yield* sql`update sheets set folder_id = ${id} where id = ${r.id}`
        yield* audit(sql, "sheets.update", r.id, { folderId: [r.folderId, id] })
      }
      yield* changed(sql, rows.map((r) => r.id))
      const undo = yield* restoreToken(sql, { sheets: rows.map(snapshot), pins: [], shares: [], folderId: id })
      return new FolderMade({ folder: { id, name }, undo })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(SheetsRestore)

/** `sheets.restore`: the snapshot a change's token holds, put back on the undo's transaction. */
export const restore = Effect.fn("Sheets.restoreSnapshot")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("data", 1)
  const principal = yield* CurrentPrincipal
  const me = yield* viewer(sql)
  for (const s of undo.sheets) {
    yield* sql`update sheets set title = ${s.title},
                 folder_id = case when ${s.folderId}::text is null then null
                                  when exists (select 1 from sheet_folders f where f.id = ${s.folderId}) then ${s.folderId}
                                  else null end,
                 archived_at = case when ${s.archived} then coalesce(archived_at, now()) else null end,
                 deleted_at = case when ${s.deleted} then coalesce(deleted_at, now()) else null end
               where id = ${s.id}`
    yield* audit(sql, "sheets.restore", s.id)
  }
  for (const p of undo.pins) yield* setPin(sql, principal.workspaceId, p.id, me, p.pinned)
  for (const x of undo.shares) {
    if (x.on) {
      yield* sql`insert into sheet_shares (workspace_id, sheet_id, member_id, granted_by)
                 select ${principal.workspaceId}, ${x.id}, ${x.memberId}, ${me}
                 where exists (select 1 from members m where m.id = ${x.memberId})
                 on conflict (sheet_id, member_id) do nothing`
    } else {
      yield* changed(sql, [x.id])
      yield* sql`delete from sheet_shares where sheet_id = ${x.id} and member_id = ${x.memberId}`
    }
    yield* audit(sql, "sheets.share", x.id, { memberId: x.memberId, on: x.on })
  }
  if (undo.folderId !== null) {
    yield* sql`update sheets set folder_id = null where folder_id = ${undo.folderId}`
    yield* sql`delete from sheet_folders where id = ${undo.folderId}`
  }
  yield* changed(sql, [...undo.sheets.map((s) => s.id), ...undo.shares.filter((x) => x.on).map((x) => x.id)])
})

/** A figure as the engine reads it: the number, or the error code a CSV cell shows. */
const engineFigure = (f: { readonly value: number | null; readonly error: string | null }): number | SheetError =>
  f.value !== null
    ? f.value
    : f.error === "unknown_metric"
    ? { error: "#NAAM?", why: "" }
    : f.error === "no_ads"
    ? { error: "#DEEL/0!", why: "" }
    : { error: "#N/B", why: "" }

/**
 * "CSV": a tab's values as they are now, evaluated here with the shared engine and the figures read again, so the
 * file is what the console shows. Needs Data · Exporteren (`data.export`), as every export does.
 */
export const exportTab = Effect.fn("Sheets.export")(function*(input: ExportInput) {
  yield* Policy.require("data", 1)
  yield* Policy.requireAction("data.export")
  const db = yield* Db
  const figures = yield* SheetFigures
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const me = yield* viewer(sql)
      const sheet = yield* detailOf(sql, me, input.id)
      const tabs = sheet.tabs as ReadonlyArray<EngineTab>
      const tab = tabs.find((t) => t.id === input.tabId) ?? tabs[0]
      if (tab === undefined) return yield* new SheetNotFound({ id: input.id })
      const requests = figureRequests(tabs)
      const read = requests.length === 0 ? { figures: [] } : yield* figures.read(sql, requests)
      const known = new Map(read.figures.map((f) => [figureKey(f.metric, f.month), engineFigure(f)]))
      const lookup: Figures = (metric, month) => known.get(figureKey(metric, month)) ?? { error: "#N/B", why: "" }
      const rows = tabRows({ tabs, figures: lookup }, tab.id)
      yield* audit(sql, "sheets.export", sheet.id, { tab: tab.id, format: input.format })
      return new SheetExport({
        fileName: `${sheet.title} - ${tab.name}.csv`,
        contentType: "text/csv;charset=utf-8",
        content: `﻿${toCsv(rows)}`
      })
    })
  )
})
