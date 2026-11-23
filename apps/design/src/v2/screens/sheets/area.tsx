import type { AreaDef } from "../../areas.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import type { AreaRoute } from "../../router.tsx"
import type { Thread, ThreadItem } from "../../shell/threads.ts"
import { SheetScreen } from "./editor.tsx"
import { SheetsList } from "./list.tsx"
import { getSheet } from "./store.ts"

/** Werkdraad: a sheet, then the records it reads (Insyte's figures, the products and suppliers it is about). */
function thread(route: AreaRoute): Thread {
  const [id] = route.path
  if (id === undefined) {
    return {
      items: [
        { kind: "page", label: "Sheets" },
        { kind: "sheet", label: "Winst per dag", href: paths.sheet("winst-per-dag"), meta: "vastgezet · leest Kosten" },
        { kind: "page", label: "Kosten", href: paths.costs, meta: "waar de nettowinst vandaan komt" }
      ],
      ask: "Sheets"
    }
  }
  const sheet = getSheet(id)
  if (sheet === undefined) return { items: [{ kind: "page", label: "Sheets", href: paths.sheets }], ask: "Sheets" }
  const items: Array<ThreadItem> = [
    { kind: "sheet", label: sheet.title, meta: `van ${PEOPLE[sheet.owner].name} · ${sheet.updated}` },
    ...sheet.reads.map((r): ThreadItem => ({ kind: r.kind, label: r.label, href: r.href, meta: r.meta }))
  ]
  return { items, ask: `Blad ${sheet.title}` }
}

/** Sheets: the area's entry for the shell (`areas.ts`). In the lead's "Meer" menu, so no Menu. */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id] = route.path
    return id === undefined ? <SheetsList /> : <SheetScreen id={id} />
  },
  thread
}
