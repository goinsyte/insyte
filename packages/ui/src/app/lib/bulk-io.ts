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

/** A CSV of the selection, built here and handed to the browser — nothing leaves the machine. */
export function exportCsv(
  name: string,
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number>>
) {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s
  }
  const body = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast(`${name}.csv geëxporteerd`)
}
