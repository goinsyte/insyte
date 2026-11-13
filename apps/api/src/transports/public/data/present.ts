import type { ExportList, ExportRow, ImportFile, ImportList } from "@insyte/modules/data/domain/Data"

/* The Data hub's imports and exports in the public shape: metadata only, never a download link. */

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

const importV1 = (r: ImportFile) => ({
  id: r.id,
  file_name: r.fileName,
  header: [...r.header],
  row_count: r.rowCount,
  state: r.state,
  error: r.error,
  created_by: r.createdBy,
  created_at: new Date(r.createdAt).toISOString(),
  committed_at: iso(r.committedAt)
})

export const importListV1 = (l: ImportList) => ({ data: l.rows.map(importV1) })

export const exportV1 = (r: ExportRow) => ({
  id: r.id,
  source: r.source,
  source_id: r.sourceRef,
  file_name: r.fileName,
  state: r.state,
  rows_written: r.rowsWritten,
  rows_total: r.rowsTotal,
  requested_by: r.requestedBy,
  created_at: new Date(r.createdAt).toISOString(),
  finished_at: iso(r.finishedAt),
  expires_at: iso(r.expiresAt)
})

export const exportListV1 = (l: ExportList) => ({ data: l.rows.map(exportV1) })
