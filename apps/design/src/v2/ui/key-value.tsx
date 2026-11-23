import type { ReactNode } from "react"
import { cx } from "./cx.ts"

export type KeyValueItem = {
  readonly label: string
  readonly value: ReactNode
  /** The value is a number, an id or a date: set as a figure. */
  readonly figure?: boolean
}

/**
 * A record's facts as label and value: an order's customer, total, carrier; a supplier's terms. In
 * `rows` the label sits left in a fixed column and the value beside it (a detail sheet); in `grid`
 * they stack in two or three columns (a summary in a head). Empty values say "—", never nothing.
 */
export function KeyValue({ items, layout = "rows", className }: {
  readonly items: ReadonlyArray<KeyValueItem>
  readonly layout?: "rows" | "grid"
  readonly className?: string
}) {
  if (layout === "grid") {
    return (
      <dl className={cx("grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3", className)}>
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-xs text-ink-3">{item.label}</dt>
            <dd className={cx("truncate text-sm text-ink", item.figure === true && "figure")}>{item.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <dl className={cx("flex flex-col", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(7rem,34%)_minmax(0,1fr)] gap-3 py-1.5"
        >
          <dt className="text-xs leading-5 text-ink-3">{item.label}</dt>
          <dd className={cx("min-w-0 text-sm text-ink", item.figure === true && "figure")}>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One fact in a side column: a small label over its value, no box. */
export function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  )
}
