import { useAtomSet } from "@effect/atom-react"
import type { CostChange, CostLine as ServerLine, CostsList } from "@insyte/modules/costs/domain/Costs"
import type { CostFigures, CostMonth, CostRow, CostsSource, Said } from "@insyte/ui/app/costs/costs-source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { useMemo } from "react"
import { toast } from "sonner"
import { COSTS, costWrites } from "../data/costs.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Kosten's source in the console (M13 step 5): `Costs.list` as the design's rows, in the workspace's currency, and
 * every change the server's, with "Ongedaan maken" spending its undo token. Meta and Google Ads cannot be connected
 * yet (Insyte has no app keys for them): "Koppelen" says so, and their lines are typed.
 */

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December"
] as const
const MONTH_ABBR = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const

const monthOf = (id: string): CostMonth => {
  const i = Number(id.slice(5, 7)) - 1
  return { id, abbr: MONTH_ABBR[i] ?? id, name: MONTH_NAMES[i] ?? id }
}

const lower = (m: string) => monthOf(m).name.toLowerCase()

/** "januari tot mei 2026", or "november 2025 tot maart 2026" across a year. */
const rangeOf = (months: ReadonlyArray<string>) => {
  const first = months[0]
  const last = months[months.length - 1]
  if (first === undefined || last === undefined) return ""
  if (first === last) return `${lower(last)} ${last.slice(0, 4)}`
  return first.slice(0, 4) === last.slice(0, 4) ?
    `${lower(first)} tot ${lower(last)} ${last.slice(0, 4)}` :
    `${lower(first)} ${first.slice(0, 4)} tot ${lower(last)} ${last.slice(0, 4)}`
}

const major = (minor: number) => minor / 100
const minor = (whole: number) => Math.round(whole * 100)

const rowOf = (l: ServerLine): CostRow => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  rate: l.kind === "percent" ? (l.rate ?? 0) : l.kind === "per_order" ? major(l.rateMinor ?? 0) : 0,
  source: l.source === "google_ads" ? "google-ads" : l.source,
  reads: l.readsFromSource,
  hasTyped: l.hasTyped,
  cells: Object.fromEntries(
    Object.entries(l.cells).map(([m, c]) => [m, { amount: major(c.amountMinor), typed: c.typed }])
  )
})

const figuresOf = (list: CostsList): Record<string, CostFigures> =>
  Object.fromEntries(list.figures.map((f) => [f.month, {
    revenue: major(f.revenueMinor),
    orders: f.orders,
    ads: major(f.adsMinor),
    other: major(f.otherMinor),
    costs: major(f.costsMinor),
    net: major(f.netMinor),
    margin: f.margin,
    roas: f.roas
  }]))

const COPY: RefusalCopy = {
  gone: "Die kostenpost bestaat niet meer",
  invalid: {
    name: "Geef de post een naam van hoogstens 80 tekens.",
    rate: "Een percentage ligt tussen 0 en 100, een bedrag per bestelling is 0 of meer.",
    amount: "Een bedrag kan niet negatief zijn."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "KindChangeNotAllowed":
        toast.error("Dat kan zo niet", {
          description: "Deze post heeft getypte maanden. Wis die eerst, of maak een nieuwe post."
        })
        return true
      case "NotEditable":
        toast.error("Dat kan zo niet", { description: "Dit bedrag rekent Insyte uit; het wordt niet getypt." })
        return true
      case "MonthOutOfRange":
        toast.error("Dat kan zo niet", { description: "Die maand ligt buiten wat je kunt invullen." })
        return true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const PROVIDER = { meta: "Meta Ads", "google-ads": "Google Ads", manual: "Dat account" } as const

/** The page over `Costs.list`, with the commands Kosten bewerken allows. */
export function useConsoleCostsSource(list: CostsList): CostsSource {
  const keys = { reactivityKeys: COSTS }
  const write = {
    create: useAtomSet(costWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(costWrites.update, { mode: "promiseExit" }),
    setAmount: useAtomSet(costWrites.setAmount, { mode: "promiseExit" }),
    readFromSource: useAtomSet(costWrites.readFromSource, { mode: "promiseExit" }),
    remove: useAtomSet(costWrites.remove, { mode: "promiseExit" }),
    undo: useAtomSet(costWrites.undo, { mode: "promiseExit" })
  }
  const edit = useGate("costs.write")
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** Said with its Undo when it took, refused when not; whether it took. */
  const said = (exit: Exit.Exit<CostChange, unknown>, what: Said) => {
    if (Exit.isFailure(exit)) {
      refused(failureOf(exit))
      return false
    }
    const ticket = exit.value.undo
    if (ticket !== null) undoable(what.label, () => undo(ticket.token), what.detail)
    return true
  }
  const lines = useMemo(() => list.lines.map(rowOf), [list])
  const months = useMemo(() => list.months.map(monthOf), [list])
  const figures = useMemo(() => figuresOf(list), [list])

  return {
    lines,
    months,
    running: list.months.includes(list.current) ? list.current : null,
    figures,
    currency: list.currency,
    rangeLabel: rangeOf(list.months),
    edit,
    connect: {
      run: (source) =>
        void toast(`${PROVIDER[source]} koppelen kan nog niet`, {
          description: "Insyte kan advertentie-uitgaven nog niet zelf ophalen. Typ ze tot dan per maand in."
        })
    },
    add: async (line, what) => {
      const fills = line.kind === "fixed" || line.kind === "ads"
      return said(
        await write.create({
          payload: {
            name: line.name,
            kind: line.kind,
            ...(line.kind === "percent" ? { rate: line.rate } : {}),
            ...(line.kind === "per_order" ? { rateMinor: minor(line.rate) } : {}),
            ...(fills && line.amountPerMonth !== null ?
              { amountPerMonthMinor: minor(line.amountPerMonth), months: list.months } :
              {})
          },
          ...keys
        }),
        what
      )
    },
    update: async (row, patch, what) =>
      said(
        await write.update({
          payload: {
            id: row.id,
            name: patch.name,
            kind: patch.kind,
            ...(patch.kind === "percent" ? { rate: patch.rate } : {}),
            ...(patch.kind === "per_order" ? { rateMinor: minor(patch.rate) } : {})
          },
          ...keys
        }),
        what
      ),
    setAmount: (row, month, amount, what) =>
      void write.setAmount({
        payload: { lineId: row.id, month, amountMinor: amount === null ? null : minor(amount) },
        ...keys
      }).then((exit) => said(exit, what)),
    readFromSource: (row, what) =>
      void write.readFromSource({ payload: { id: row.id }, ...keys }).then((exit) => said(exit, what)),
    remove: (row, what) => void write.remove({ payload: { id: row.id }, ...keys }).then((exit) => said(exit, what))
  }
}
