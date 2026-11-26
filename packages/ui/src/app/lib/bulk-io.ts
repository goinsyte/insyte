import { toast } from "sonner"

/*
 * The bulk actions that change nothing in a store: copy the selection, export it. Store-free, so the console's lists
 * offer them too (`bulk.ts` re-exports them beside the demo's `patchMany`).
 */

export { counted } from "./counted"

/** Copies, and says so — the one bulk action that has nothing to undo. */
export function copyLines(lines: ReadonlyArray<string>, what: string) {
  void navigator.clipboard?.writeText(lines.join("\n"))
  toast(`${what} gekopieerd`)
}

/**
 * A CSV of the selection, built here and handed to the browser — nothing leaves the machine. `dutch` writes the Data
 * hub's file as the server does: `;` between cells and a BOM, so Dutch Excel reads its decimal commas.
 */
export function exportCsv(
  name: string,
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  { dutch = false }: { dutch?: boolean } = {}
) {
  const sep = dutch ? ";" : ","
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, "\"\"")}"` : s
  }
  const lines = [header, ...rows].map((r) => r.map(cell).join(sep))
  const body = dutch ? `﻿${lines.join("\r\n")}` : lines.join("\n")
  const url = URL.createObjectURL(new Blob([body], { type: dutch ? "text/csv;charset=utf-8" : "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast(`${name}.csv geëxporteerd`)
}
