import { cx } from "./cx.ts"
import { AlertTriangle, Check } from "./icons.tsx"

export type Step = {
  readonly label: string
  /** A date, a carrier, a name: what this step is waiting for or when it was done. */
  readonly detail?: string
}

/**
 * Where a record is in a known sequence: an order from Betaald to Bezorgd, a return from Aangemeld to
 * Terugbetaald, a setup's steps. Done steps carry a tick in ink, the current one the accent ring,
 * what is still to come a hollow grey dot. `stalled` marks the current step as stuck (amber, with a
 * sign) when the sequence stopped there: a parcel delayed, a supplier that did not answer.
 */
export function Stepper({ steps, current, stalled = false, orientation = "horizontal", label }: {
  readonly steps: ReadonlyArray<Step>
  /** Index of the current step; `steps.length` means all are done. */
  readonly current: number
  readonly stalled?: boolean
  readonly orientation?: "horizontal" | "vertical"
  readonly label: string
}) {
  const vertical = orientation === "vertical"
  return (
    <ol aria-label={label} className={cx("flex", vertical ? "flex-col" : "items-start")}>
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? (stalled ? "stalled" : "current") : "todo"
        const isLast = i === steps.length - 1
        return (
          <li
            key={step.label}
            aria-current={state === "current" || state === "stalled" ? "step" : undefined}
            className={cx("relative flex min-w-0", vertical ? "gap-3 pb-5 last:pb-0" : "flex-1 flex-col gap-2 pr-2")}
          >
            {!isLast && (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute",
                  vertical ? "top-6 bottom-0 left-[11px] w-0.5" : "top-[11px] right-0 left-7 h-0.5",
                  i < current ? "bg-ink" : "bg-line"
                )}
              />
            )}
            <span
              className={cx(
                "relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                state === "done" && "bg-ink text-on-ink",
                state === "current" && "bg-canvas ring-2 ring-accent ring-inset",
                state === "stalled" && "bg-warn-tint text-warn-ink ring-2 ring-warn ring-inset",
                state === "todo" && "bg-canvas ring-1 ring-line-strong ring-inset"
              )}
            >
              {state === "done" && <Check size={13} strokeWidth={2.25} />}
              {state === "current" && <span className="size-2 rounded-full bg-accent" />}
              {state === "stalled" && <AlertTriangle size={12} />}
            </span>
            <span className={cx("flex min-w-0 flex-col gap-0.5", vertical && "pt-0.5")}>
              <span className={cx("text-xs", state === "todo" ? "text-ink-3" : "font-medium text-ink")}>
                {step.label}
                <span className="sr-only">
                  {state === "done"
                    ? " (klaar)"
                    : state === "current"
                    ? " (nu)"
                    : state === "stalled"
                    ? " (loopt vast)"
                    : ""}
                </span>
              </span>
              {step.detail !== undefined && (
                <span className={cx("text-2xs", state === "stalled" ? "text-warn-ink" : "text-ink-3")}>
                  {step.detail}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
