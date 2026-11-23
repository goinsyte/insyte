import { cx } from "../ui/cx.ts"
import { formatChange, formatValue, judge } from "./format.ts"
import type { Figure } from "./types.ts"

const SIGNAL = {
  good: "text-good-ink",
  bad: "text-bad-ink",
  flat: "text-ink-3"
} as const

const WORD = { good: "beter", bad: "slechter", flat: "gelijk" } as const

/**
 * Figures in one band, not tiles: up to four values side by side with space between, each with
 * its change (signed, coloured AND named for screen readers) and the value before. This is the number
 * tile of the system; it never stands alone on a board as a big-number hero.
 */
export function Figures({ figures, compareLabel }: {
  readonly figures: ReadonlyArray<Figure>
  readonly compareLabel: string
}) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 @xl:grid-cols-4">
        {figures.map((figure) => {
          const verdict = judge(figure.value, figure.previous, figure.better)
          return (
            <div key={figure.label} className="flex min-w-0 flex-col gap-1">
              <dt className="truncate text-xs text-ink-2">{figure.label}</dt>
              <dd className="figure text-lg font-medium text-ink">{formatValue(figure.value, figure.format)}</dd>
              <dd className="flex flex-wrap items-baseline gap-x-1.5 text-2xs">
                <span className={cx("figure font-medium", SIGNAL[verdict])}>
                  {formatChange(figure.value, figure.previous, figure.format)}
                  <span className="sr-only">({WORD[verdict]})</span>
                </span>
                <span className="truncate text-ink-3">
                  {compareLabel} <span className="figure">{formatValue(figure.previous, figure.format)}</span>
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
