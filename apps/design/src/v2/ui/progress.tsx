import { cx } from "./cx.ts"

const pct = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 })

/**
 * How far a job is: an import, an upload, a bulk change on 40 orders. The bar is the accent; the
 * label says what is going on and the figure how far. Without a value it is indeterminate (a sweep),
 * for work whose length is unknown.
 */
export function ProgressBar({ value, max = 1, label, detail, className }: {
  /** Omit for indeterminate. */
  readonly value?: number
  readonly max?: number
  readonly label: string
  /** What is being counted ("18 van 40 bestellingen"). */
  readonly detail?: string
  readonly className?: string
}) {
  const share = value === undefined ? undefined : Math.min(Math.max(value / max, 0), 1)
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink">{label}</span>
        <span className="figure text-ink-3">{detail ?? (share === undefined ? "" : pct.format(share))}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={detail}
        className="relative h-1.5 overflow-hidden rounded-full bg-well"
      >
        {share === undefined
          ? (
            <span className="absolute inset-y-0 w-1/3 animate-sweep rounded-full bg-accent motion-reduce:animate-none" />
          )
          : (
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${share * 100}%` }}
            />
          )}
      </div>
    </div>
  )
}

/**
 * A level against a limit: the AI budget, a plan's orders, storage. Ink until `warnAt` (80% by
 * PRODUCT.md's rule), the warning amber after it, the bad red at the limit, and the words say so too.
 */
export function Meter({ value, max, label, format = (n) => String(n), warnAt = 0.8, className }: {
  readonly value: number
  readonly max: number
  readonly label: string
  readonly format?: (n: number) => string
  readonly warnAt?: number
  readonly className?: string
}) {
  const share = Math.min(value / max, 1)
  const level = share >= 1 ? "bad" : share >= warnAt ? "warn" : "ok"
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink">{label}</span>
        <span className="figure text-ink-2">
          {format(value)} <span className="text-ink-3">van {format(max)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${format(value)} van ${format(max)}`}
        className="relative h-1.5 rounded-full bg-well"
      >
        <span
          className={cx(
            "absolute inset-y-0 left-0 rounded-full",
            level === "bad" ? "bg-bad" : level === "warn" ? "bg-warn" : "bg-series-2"
          )}
          style={{ width: `${share * 100}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute -inset-y-1 w-px bg-ink-4"
          style={{ left: `${warnAt * 100}%` }}
          title={`Waarschuwing bij ${pct.format(warnAt)}`}
        />
      </div>
      {level !== "ok" && (
        <p className={cx("text-xs", level === "bad" ? "text-bad-ink" : "text-warn-ink")}>
          {level === "bad"
            ? "Limiet bereikt: nieuwe taken wachten tot de volgende maand."
            : `Meer dan ${pct.format(warnAt)} gebruikt.`}
        </p>
      )}
    </div>
  )
}
