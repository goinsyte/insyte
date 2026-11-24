import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { cx } from "./cx.ts"

/**
 * A switch: the accent when on, a grey track when off, for a setting that takes effect at once (no
 * Opslaan). Named by `label` for screen readers.
 */
export function Toggle({ on, onChange, label, disabled }: {
  readonly on: boolean
  readonly onChange: (next: boolean) => void
  readonly label: string
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-45",
        on ? "bg-accent hover:bg-accent-ink" : "bg-line-strong hover:bg-ink-4"
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 size-4 rounded-full bg-knob shadow-xs transition-transform duration-200",
          on ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

type Option<T extends string> = { readonly value: T; readonly label: string; readonly icon?: ReactNode }

/**
 * A choice of a few, side by side: the agent's autonomy per action, the board's period, light or
 * dark. The current one is a white tile on the well. The arrow keys move the choice.
 */
export function Segmented<T extends string>(
  { value, options, onChange, label, size = "md", disabled, stretch = false }: {
    readonly value: T
    readonly options: ReadonlyArray<Option<T>>
    readonly onChange: (next: T) => void
    readonly label: string
    readonly size?: "sm" | "md"
    readonly disabled?: boolean
    /** The full width of its column, the options sharing it equally: a choice inside a form. */
    readonly stretch?: boolean
  }
) {
  const move = (step: number) => {
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    if (next !== undefined) onChange(next.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
        event.preventDefault()
        const group = event.currentTarget
        move(event.key === "ArrowRight" ? 1 : -1)
        window.requestAnimationFrame(() => group.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus())
      }}
      className={cx(
        stretch ? "flex w-full rounded-md bg-well p-0.5" : "inline-flex shrink-0 rounded-sm bg-well p-0.5",
        disabled === true && "pointer-events-none opacity-45"
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-xs whitespace-nowrap transition-colors [&_svg]:size-3.5",
              stretch
                ? "h-8 flex-1 justify-center px-3 text-sm"
                : size === "sm"
                ? "h-6 px-2 text-2xs"
                : "h-7 px-2.5 text-xs",
              "pointer-coarse:h-10",
              // The chosen option carries weight and a lifted tile, not just a lighter ground.
              selected ? "bg-canvas font-semibold text-ink shadow-sm" : "font-normal text-ink-3 hover:text-ink"
            )}
          >
            {option.icon}
            {/* The bold twin holds the width, so choosing an option never shifts its neighbours. */}
            <span className="grid">
              <span className="col-start-1 row-start-1">{option.label}</span>
              <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A setting on one line: its glyph, its name and a detail, and the switch at the end. */
export function ToggleRow({ glyph: G, title, detail, on, onChange }: {
  readonly glyph?: Glyph
  readonly title: string
  readonly detail?: string
  readonly on: boolean
  readonly onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      {G !== undefined && <G size={15} className="shrink-0 text-ink-3" />}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-sm">
        <span className="font-medium text-ink">{title}</span>
        {detail !== undefined && <span className="text-ink-3">· {detail}</span>}
      </span>
      <Toggle label={title} on={on} onChange={onChange} />
    </div>
  )
}
