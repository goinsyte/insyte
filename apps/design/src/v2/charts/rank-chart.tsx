import { cx } from "../ui/cx.ts"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { formatValue } from "./format.ts"
import type { BarData, Note } from "./types.ts"

/**
 * Bars on their side, ranked: the label, the bar and the figure on one line, the period before as a
 * thin ink tick across the track (a rule, not a handle: no fill, no ring). The same colour rule as the upright bars, so a ranked list and a bar
 * chart side by side read as one thing.
 */
export function RankChart({ data, note }: { readonly data: BarData; readonly note?: Note }) {
  const max = Math.max(...data.items.flatMap((item) => [item.value, item.compare ?? 0]))
  const total = data.items.reduce((sum, item) => sum + item.value, 0)
  const focus = data.focus ?? note?.at

  return (
    <ol className="flex flex-col gap-2.5">
      {data.items.map((item, i) => {
        const isFocus = i === focus
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100)
        return (
          <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span
              className={cx(
                "flex min-w-0 items-center gap-1.5 truncate text-xs",
                isFocus ? "font-medium text-ink" : "text-ink-2"
              )}
            >
              <span className="truncate">{item.label}</span>
              {note?.at === i && <MagnusMark size={13} label="Magnus heeft hier iets gevonden" />}
            </span>
            <span className="figure text-right text-xs whitespace-nowrap">
              <span className={isFocus ? "font-semibold text-accent-ink" : "text-ink"}>
                {formatValue(item.value, data.format)}
              </span>
              <span className="ml-2 inline-block w-8 text-ink-3">{share}%</span>
            </span>
            <span className="relative col-span-2 h-2 rounded-full bg-well">
              <span
                className={cx(
                  "absolute inset-y-0 left-0 rounded-full",
                  focus === undefined ? "bg-series-2" : isFocus ? "bg-accent" : "bg-series-3"
                )}
                style={{ width: `${(item.value / (max || 1)) * 100}%` }}
              />
              {item.compare !== undefined && (
                <span
                  className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-ink-2"
                  style={{ left: `${(item.compare / (max || 1)) * 100}%` }}
                  title={`Periode ervoor: ${formatValue(item.compare, data.format)}`}
                />
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
