import { cx } from "../ui/cx.ts"
import { formatChange, formatValue, judge } from "./format.ts"
import type { Figure } from "./types.ts"

const SIGNAL = { good: "text-good-ink", bad: "text-bad-ink", flat: "text-ink-3" } as const
const WORD = { good: "beter", bad: "slechter", flat: "gelijk" } as const

/**
 * Figures as one thin line: label over value, the change beside the value, space between. The
 * figure the page is not about: Start's "vandaag tot nu" in its header and the head of Live's feed.
 * The value before is in the change's title and read out to screen readers, so the line stays thin.
 * For the figures a page IS about, use `Figures`.
 */
export function FigureStrip({ figures, compareLabel, label, className, compact = false }: {
  readonly figures: ReadonlyArray<Figure>
  /** "vorige maandag om 14:30": what the change is against. */
  readonly compareLabel: string
  readonly label: string
  readonly className?: string
  /** One row at a smaller size below 640px, scrolling sideways if it must (Start on a phone). */
  readonly compact?: boolean
}) {
  return (
    <dl
      aria-label={label}
      className={cx(
        compact
          ? "flex shrink-0 gap-x-5 sm:flex-wrap sm:gap-x-8 sm:gap-y-3"
          : "grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8",
        className
      )}
    >
      {figures.map((figure) => {
        const verdict = judge(figure.value, figure.previous, figure.better)
        const before = formatValue(figure.previous, figure.format)
        return (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col gap-0.5"
          >
            <dt className="truncate text-2xs text-ink-3">{figure.label}</dt>
            <dd className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={cx("figure font-medium text-ink", compact ? "text-sm sm:text-md" : "text-md")}>
                {formatValue(figure.value, figure.format)}
              </span>
              <span
                className={cx("figure text-2xs font-medium", SIGNAL[verdict])}
                title={`${compareLabel}: ${before}`}
              >
                {formatChange(figure.value, figure.previous, figure.format)}
                <span className="sr-only">({WORD[verdict]}; {compareLabel} {before})</span>
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
