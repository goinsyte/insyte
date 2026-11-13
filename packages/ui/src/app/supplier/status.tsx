import type { SupplierOrderRow } from "../hooks/use-supplier-orders"
import { STATUS_LABEL, type SupplierStatus } from "../lib/supplier-work"
import { cn } from "../lib/utils"

const TONE: Record<SupplierStatus, string> = {
  to_accept: "bg-arc-tint text-arc-ink",
  to_ship: "bg-ink/6 text-ink-2",
  problem: "bg-signal-amber-bg text-signal-amber",
  shipped: "bg-signal-green-bg text-signal-green",
  closed: "bg-ink/5 text-ink-3"
}

export function SupplierStatusChip({ status }: { status: SupplierStatus }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center rounded-full px-2 font-medium text-xs", TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

const day = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })

/** When it has to be with the carrier, and whether that is today or already past. */
export function DueCell({ row }: { row: SupplierOrderRow }) {
  const open = row.status === "to_accept" || row.status === "to_ship" || row.status === "problem"
  if (!open) return <span className="text-ink-3">—</span>
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-ink-2 tabular-nums">{day.format(row.handoff)}</span>
      {row.due === "late" ?
        <span className="rounded-sm bg-signal-red-bg px-1.5 py-0.5 font-medium text-signal-red text-xs">Te laat</span> :
        row.due === "today" ?
        (
          <span className="rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs">
            Vandaag
          </span>
        ) :
        null}
    </span>
  )
}
