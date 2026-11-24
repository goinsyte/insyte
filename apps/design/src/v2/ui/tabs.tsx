import { useRef } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import { cx } from "./cx.ts"

export type TabOption<T extends string> = {
  readonly value: T
  readonly label: string
  readonly count?: number
  /** The id of the panel this tab shows, for `aria-controls`. */
  readonly controls?: string
}

/**
 * Tabs: views of one thing (a ticket's Gesprek and Notities, an agent's Chat and Geheugen, a list's
 * saved views). `line` is the default, an ink rule under the current tab on a hairline; `pill` is
 * for a narrow pane where a rule would be lost (the agent page on a phone). The arrow keys move
 * between tabs and select as they go; Tab leaves the row. For a setting with two or three answers,
 * `Segmented` is the control.
 */
export function Tabs<T extends string>(
  { value, onChange, tabs, label, variant = "line", className, end, rule = true }: {
    readonly value: T
    readonly onChange: (next: T) => void
    readonly tabs: ReadonlyArray<TabOption<T>>
    readonly label: string
    readonly variant?: "line" | "pill"
    readonly className?: string
    /** Something at the far end of the row (a view's actions). */
    readonly end?: ReactNode
    /** The hairline under a `line` row; off where the pane's own edge already ends the row. */
    readonly rule?: boolean
  }
) {
  const row = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((tab) => tab.value === value)
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    const jump = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
    if (step === 0 && jump === null) return
    event.preventDefault()
    const nextAt = jump ?? (at + step + tabs.length) % tabs.length
    const next = tabs[nextAt]
    if (next === undefined) return
    onChange(next.value)
    row.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextAt]?.focus()
  }
  return (
    <div
      className={cx(
        "flex items-center gap-1",
        variant === "line" && rule && "border-b border-line",
        className
      )}
    >
      <div
        ref={row}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="no-scrollbar -my-1 flex min-w-0 items-center gap-1 overflow-x-auto px-0.5 py-1"
      >
        {tabs.map((tab) => {
          const selected = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={tab.controls === undefined ? undefined : `${tab.controls}-tab`}
              aria-selected={selected}
              aria-controls={tab.controls}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cx(
                "relative flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap transition-colors",
                variant === "line"
                  ? cx(
                    "h-9 px-2 pointer-coarse:h-11",
                    selected
                      ? "font-medium text-ink after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink"
                      : "text-ink-3 hover:text-ink"
                  )
                  : cx(
                    "h-8 rounded-sm px-3 pointer-coarse:h-11",
                    selected ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover"
                  )
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="figure text-2xs font-normal text-ink-3">{tab.count}</span>}
            </button>
          )
        })}
      </div>
      {end !== undefined && <div className="ml-auto flex shrink-0 items-center gap-1">{end}</div>}
    </div>
  )
}
