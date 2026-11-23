import { setQuery, useQuery } from "../router.tsx"
import { copyText } from "./share.tsx"
import { toast } from "./toast.tsx"

/*
 * The small acts every list and record offers: copy, export, save a file, undo. Each one says what it
 * did in a toast, so a person never has to wonder whether the click took.
 */

/** Copies and says so: "Bestelnummer gekopieerd". */
export function copyAndSay(text: string, what: string) {
  void copyText(text)
  toast({ title: `${what} gekopieerd`, tone: "good" })
}

/** A file to the browser's downloads, made in the browser (CSV, text, HTML). */
export function saveFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const cell = (v: string | number) => {
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s
}

/** A CSV in the shape a Dutch spreadsheet opens (semicolons), to the downloads, and a toast that counts it. */
export function exportCsv(
  name: string,
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number>>
) {
  const body = [header, ...rows].map((r) => r.map(cell).join(";")).join("\n")
  saveFile(`${name}.csv`, body, "text/csv;charset=utf-8")
  toast({ title: "Export gemaakt", body: `${rows.length.toLocaleString("nl-NL")} rijen in ${name}.csv`, tone: "good" })
}

/** A change that can be taken back: the sentence, and the undo beside it for thirty seconds. */
export function undoable(title: string, undo: () => void, body?: string) {
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    tone: "good",
    duration: 30_000,
    action: {
      label: "Ongedaan maken",
      onClick: () => {
        undo()
        toast({ title: "Teruggezet" })
      }
    }
  })
}

/* ── a filter in the address: `?status=vertraagd,retour` ─────────────────────────────────────── */

/** The values of one filter in the query, as a list; empty when it is off. */
export function useQueryList(key: string): ReadonlyArray<string> {
  const raw = useQuery(key)
  return raw === null || raw === "" ? [] : raw.split(",")
}

/** Turns one value of a query filter on or off, and goes back to the first page. */
export function toggleQuery(key: string, current: ReadonlyArray<string>, value: string) {
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  setQuery({ [key]: next.length === 0 ? null : next.join(","), pagina: null })
}
