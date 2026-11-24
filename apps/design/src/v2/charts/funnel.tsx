import { formatValue } from "./format.ts"
import type { FunnelData } from "./types.ts"

const pct = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * A funnel as ranked steps: each step's bar is its share of the first, and between two steps the
 * share that dropped off (the loss, not the pass-through, so "grootste uitval" sits beside the
 * biggest number). The biggest loss is the focus: the step it leaves you with is in the
 * accent, named in words, and the rest step back to light grey, as in every chart with a focus.
 */
export function Funnel({ data }: { readonly data: FunnelData }) {
  const first = data.steps[0]?.value ?? 1
  const rates = data.steps.map((step, i) => (i === 0 ? 1 : step.value / (data.steps[i - 1]?.value ?? 1)))
  const worst = rates.reduce((at, rate, i) => (i > 0 && rate < (rates[at] ?? 1) ? i : at), 1)

  return (
    <ol className="flex flex-col">
      {data.steps.map((step, i) => (
        <li key={step.label} className="flex flex-col">
          {i > 0 && (
            <p className="flex items-center gap-1.5 py-1.5 text-2xs text-ink-3">
              <svg width="8" height="12" aria-hidden="true" className="shrink-0">
                <path d="M4 0V9M1 6L4 9L7 6" fill="none" stroke="currentColor" strokeWidth="1.25" />
              </svg>
              <span className={i === worst ? "figure font-semibold text-accent-ink" : "figure"}>
                {pct.format(1 - (rates[i] ?? 0))}
              </span>
              <span>haakt af</span>
              {i === worst && <span className="font-medium text-accent-ink">· grootste uitval</span>}
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className={i === worst ? "truncate text-xs font-medium text-ink" : "truncate text-xs text-ink-2"}>
              {step.label}
            </span>
            <span className="figure text-right text-xs text-ink">{formatValue(step.value, "count")}</span>
            <span className="relative col-span-2 h-2 rounded-full bg-well">
              <span
                className={i === worst
                  ? "absolute inset-y-0 left-0 rounded-full bg-accent"
                  : "absolute inset-y-0 left-0 rounded-full bg-series-3"}
                style={{ width: `${Math.max((step.value / first) * 100, 1)}%` }}
              />
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
