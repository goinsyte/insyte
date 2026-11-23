import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { cx } from "./cx.ts"

export type TimelineItem = {
  readonly id: string
  /** The time, as the record writes it ("14:31", "20 nov"). */
  readonly at: string
  /** A glyph for a system event, or a disc (an avatar) for something a person or an agent did. */
  readonly glyph?: Glyph
  readonly mark?: ReactNode
  readonly title: ReactNode
  readonly body?: ReactNode
  /** A signal for the event that changed the record's fate (a dispute opened, a payment failed). */
  readonly tone?: "neutral" | "good" | "warn" | "bad"
}

const TONE = { neutral: "text-ink-3", good: "text-good-ink", warn: "text-warn-ink", bad: "text-bad-ink" } as const

/**
 * What happened to a record, newest first: an order's history, a chargeback's case, an agent's log.
 * A thin rule joins the markers; each event is one sentence with who did it, and the time in the text figures.
 * For what still has to happen, in order, use the `Stepper`.
 */
export function Timeline({ items, label }: { readonly items: ReadonlyArray<TimelineItem>; readonly label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {items.map((item, i) => {
        const G = item.glyph
        return (
          <li key={item.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
            {i < items.length - 1 && (
              <span aria-hidden="true" className="absolute top-7 bottom-0 left-[13.5px] w-px bg-line" />
            )}
            <span className="relative flex size-7 items-center justify-center">
              {item.mark ?? (
                <span
                  className={cx(
                    "inline-flex size-7 items-center justify-center rounded-full bg-well ring-4 ring-canvas",
                    TONE[item.tone ?? "neutral"]
                  )}
                >
                  {G !== undefined && <G size={14} />}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
                <span className="min-w-0">{item.title}</span>
                <span className="figure text-2xs text-ink-3">{item.at}</span>
              </p>
              {item.body !== undefined && <div className="text-xs text-pretty text-ink-2">{item.body}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
