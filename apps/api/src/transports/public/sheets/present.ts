import type { SheetDetail, SheetList, SheetRow } from "@insyte/modules/sheets/domain/Sheets"

/* Rekenbladen in the public shape: a sheet's row, the list, and one sheet with every tab as typed. */

/** A sheet's row in the public shape. */
const sheetSummaryV1 = (r: SheetRow | SheetDetail) => ({
  id: r.id,
  title: r.title,
  folder_id: "folderId" in r ? r.folderId : r.folder?.id ?? null,
  owner_id: r.ownerId,
  shared_with: [...r.sharedWith],
  pinned: r.pinned,
  archived: r.archived,
  linked: "linked" in r ? r.linked : r.tabs.some((t) => Object.values(t.cells).some((c) => /insyte\(/i.test(c.v))),
  created_at: new Date("createdAt" in r ? r.createdAt : r.updatedAt).toISOString(),
  updated_at: new Date(r.updatedAt).toISOString()
})

export const sheetListV1 = (l: SheetList) => ({ data: l.rows.map(sheetSummaryV1) })

/** One sheet; its creation time from the list's row, which the detail does not carry. */
export const sheetV1 = (d: SheetDetail, row: SheetRow | undefined) => ({
  ...sheetSummaryV1(row ?? d),
  folder_name: d.folder?.name ?? null,
  version: d.version,
  tabs: d.tabs.map((t) => ({ id: t.id, name: t.name, cells: { ...t.cells }, widths: { ...t.widths } }))
})
