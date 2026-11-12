import { type ReactNode, useMemo } from "react"
import { MONTHS } from "../lib/analytics/engine"
import { type CostLine, costOf, figuresOf, MONTH_IDS, typed } from "../lib/costs"
import { newId } from "../lib/courses"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useCosts } from "../stores/costs-store"
import { useWorkspace } from "../stores/workspace-store"
import { type CostRow, type CostsSource, CostsSourceProvider } from "./costs-source"

/*
 * Kosten in the design app: the costs store's lines over the analytics history, five months up to May 2026, in
 * dollars, with the workspace's connected ad accounts reading their own spend. Every change goes through the store
 * and comes with its Undo, as before there was a source.
 */

const MONTH_LIST = MONTHS.map((m) => ({ id: m.id, abbr: m.abbr, name: m.label }))
const LAST = MONTH_IDS[MONTH_IDS.length - 1]!
const RANGE = `${MONTHS[0].label.toLowerCase()} tot ${MONTHS[MONTHS.length - 1]!.label.toLowerCase()} 2026`

const rowOf = (l: CostLine, connected: ReadonlySet<string>): CostRow => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  rate: l.rate,
  source: l.source,
  reads: l.kind === "ads" && l.source !== "manual" && connected.has(l.source),
  hasTyped: Object.keys(l.amounts).length > 0,
  cells: Object.fromEntries(MONTH_IDS.map((m) => [m, { amount: costOf(l, m, connected), typed: typed(l, m) }]))
})

const lineOf = (id: string) => useCosts.getState().lines.find((l) => l.id === id)

function useDemoCostsSource(): CostsSource {
  const lines = useCosts((s) => s.lines)
  const integrations = useWorkspace((s) => s.integrations)
  const gate = useGate("settings", 2)
  const connected = useMemo(() => new Set(integrations.filter((i) => i.status === "connected").map((i) => i.key)), [
    integrations
  ])
  const rows = useMemo(() => lines.map((l) => rowOf(l, connected)), [lines, connected])
  const figures = useMemo(() => Object.fromEntries(MONTH_IDS.map((m) => [m, figuresOf(lines, m, connected)])), [
    lines,
    connected
  ])
  return {
    lines: rows,
    months: MONTH_LIST,
    running: LAST,
    figures,
    currency: "USD",
    rangeLabel: RANGE,
    canEdit: gate.ok,
    profitSheet: "sh_profit",
    connect: { to: "/settings/integrations" },
    add: (line, said) => {
      const needsRate = line.kind === "percent" || line.kind === "per_order"
      const amounts = !needsRate && line.amountPerMonth !== null ?
        Object.fromEntries(MONTH_IDS.map((m) => [m, line.amountPerMonth])) :
        {}
      undoable(
        said.label,
        useCosts.getState().add({
          id: newId("cost"),
          name: line.name,
          kind: line.kind,
          rate: line.rate,
          amounts,
          source: "manual",
          ...(line.kind === "ads" ? { channel: "Organic" as const } : {})
        }),
        said.detail
      )
      return Promise.resolve(true)
    },
    update: (row, patch, said) => {
      undoable(said.label, useCosts.getState().update(row.id, patch), said.detail)
      return Promise.resolve(true)
    },
    setAmount: (row, month, amount, said) => {
      const l = lineOf(row.id)
      if (l === undefined) return
      const amounts = { ...l.amounts }
      if (amount === null) delete amounts[month as keyof typeof amounts]
      else amounts[month as keyof typeof amounts] = amount
      undoable(said.label, useCosts.getState().update(row.id, { amounts }), said.detail)
    },
    readFromSource: (row, said) =>
      undoable(said.label, useCosts.getState().update(row.id, { amounts: {} }), said.detail),
    remove: (row, said) => undoable(said.label, useCosts.getState().remove(row.id), said.detail)
  }
}

/** Kosten's source in the design app. */
export function DemoCostsSource({ children }: { children: ReactNode }) {
  return <CostsSourceProvider value={useDemoCostsSource()}>{children}</CostsSourceProvider>
}
