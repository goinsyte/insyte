import { useMemo } from "react"
import { convert, RATE_NOTE } from "../lib/money"
import type { RevenueWindow } from "../lib/revenue"
import type { Currency } from "../lib/types/domain"
import { useWorkspace } from "../stores/workspace-store"

import { RevenueBreakdownView } from "./breakdown-view"
/**
 * "Where does this number come from": the revenue figure on Home, taken apart. Every part adds back
 * up to the figure — by store, then by product — and what was left out is named and counted, with
 * the rate any conversion used. Precision is the trust mechanism; a figure nobody can trace is one
 * nobody acts on.
 */
export function RevenueBreakdown({
  open,
  onOpenChange,
  window: w,
  days,
  currency
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  window: RevenueWindow
  days: number
  currency: Currency
}) {
  const stores = useWorkspace((s) => s.stores)

  const byStore = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of w.counted) m.set(o.store_id, (m.get(o.store_id) ?? 0) + convert(o.total, o.currency, currency))
    return [...m]
      .map(([id, value]) => ({ name: stores.find((s) => s.id === id)?.name ?? "Overig", value }))
      .toSorted((a, b) => b.value - a.value)
  }, [w.counted, stores, currency])

  const byProduct = useMemo(() => {
    const m = new Map<string, { value: number; units: number }>()
    for (const o of w.counted) {
      for (const li of o.line_items) {
        const r = m.get(li.title) ?? { value: 0, units: 0 }
        r.value += convert(li.unit_price * li.quantity, o.currency, currency)
        r.units += li.quantity
        m.set(li.title, r)
      }
    }
    return [...m].map(([title, r]) => ({ title, ...r })).toSorted((a, b) => b.value - a.value)
  }, [w.counted, currency])

  const mixed = new Set(w.counted.map((o) => o.currency)).size > 1 || w.counted.some((o) => o.currency !== currency)
  const lineTotal = byProduct.reduce((n, p) => n + p.value, 0)
  return (
    <RevenueBreakdownView
      open={open}
      onOpenChange={onOpenChange}
      total={w.total}
      count={w.counted.length}
      previous={w.previous}
      days={days}
      currency={currency}
      byStore={byStore}
      top={byProduct.slice(0, 5)}
      rest={{ count: Math.max(0, byProduct.length - 5), value: byProduct.slice(5).reduce((n, p) => n + p.value, 0) }}
      shipping={w.total - lineTotal}
      excluded={{ cancelled: w.excluded.cancelled.length, refunded: w.excluded.refunded.length }}
      rateNote={mixed ? RATE_NOTE : null}
    />
  )
}
