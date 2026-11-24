import { useSyncExternalStore } from "react"
import { COST_LINES } from "../../fixtures/costs.ts"
import type { CostLine } from "../../fixtures/costs.ts"
import { useView } from "../../view.ts"

/** The cost lines as the demo changes them: added, edited, removed (with undo). Module state. */

let lines: ReadonlyArray<CostLine> = COST_LINES
const listeners = new Set<() => void>()
const set = (next: ReadonlyArray<CostLine>) => {
  lines = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The busy month: the small lines a real shop ends up typing in. */
const BUSY: ReadonlyArray<CostLine> = [
  { id: "drukte-boekhouder", name: "Boekhouder", kind: "vast", source: "getypt", amount: 450 },
  { id: "drukte-klantenservice", name: "Klantenservice-software", kind: "vast", source: "getypt", amount: 189 },
  {
    id: "drukte-opslag",
    name: "Opslag bij Allure Fulfillment, per pallet per maand",
    kind: "vast",
    source: "getypt",
    amount: 1_120
  },
  { id: "drukte-retourlabels", name: "Retourlabels", kind: "per-bestelling", source: "getypt", amount: 0.35 },
  {
    id: "drukte-fotografie",
    name: "Productfotografie, voorjaarscollectie",
    kind: "vast",
    source: "getypt",
    amount: 800
  },
  { id: "drukte-kantoor", name: "Kantoor en internet", kind: "vast", source: "getypt", amount: 310 }
]

export function useLines(): ReadonlyArray<CostLine> {
  const current = useSyncExternalStore(subscribe, () => lines)
  const view = useView()
  if (view.staat === "leeg") return current.filter((l) => !COST_LINES.some((c) => c.id === l.id))
  return view.staat === "druk" ? [...current, ...BUSY] : current
}

let made = 0

export function addLine(line: Omit<CostLine, "id">): string {
  made += 1
  const id = `post-${made}`
  set([...lines, { ...line, id }])
  return id
}

export function updateLine(id: string, next: Partial<CostLine>) {
  set(lines.map((l) => (l.id === id ? { ...l, ...next } : l)))
}

/** Removes a line and returns the undo. */
export function removeLine(id: string): () => void {
  const before = lines
  set(lines.filter((l) => l.id !== id))
  return () => set(before)
}
