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
export function Figures({ figures, compareLabel, compare = true, onPick }: {
  readonly figures: ReadonlyArray<Figure>
  readonly compareLabel: string
  /** Off when the board compares with nothing: the values stand alone. */
  readonly compare?: boolean
  /** Each figure opens what is behind it. */
  readonly onPick?: (index: number) => void
}) {
  return (
    <div className="@container">
      <dl
        className={cx("grid grid-cols-2 gap-y-5 @xl:grid-cols-4", onPick === undefined ? "gap-x-8" : "-mx-2 gap-x-4")}
      >
        {figures.map((figure, i) => {
          const verdict = judge(figure.value, figure.previous, figure.better)
          const body = (
            <>
              <dt className="truncate text-xs text-ink-2">{figure.label}</dt>
              <dd className="figure text-lg font-medium text-ink">{formatValue(figure.value, figure.format)}</dd>
              {compare && (
                <dd className="flex flex-wrap items-baseline gap-x-1.5 text-2xs">
                  <span className={cx("figure font-medium", SIGNAL[verdict])}>
                    {formatChange(figure.value, figure.previous, figure.format)}
                    <span className="sr-only">({WORD[verdict]})</span>
                  </span>
                  <span className="truncate text-ink-3">
                    {compareLabel} <span className="figure">{formatValue(figure.previous, figure.format)}</span>
                  </span>
                </dd>
              )}
            </>
          )
          return onPick === undefined
            ? <div key={figure.label} className="flex min-w-0 flex-col gap-1">{body}</div>
            : (
              <div
                key={figure.label}
                className="relative flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-hover"
              >
                {body}
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="sr-only">{figure.label} uitleggen</span>
                </button>
              </div>
            )
        })}
      </dl>
    </div>
  )
}
