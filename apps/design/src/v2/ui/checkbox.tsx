import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"
import { cx } from "./cx.ts"

/*
 * Ticks and choices. The browser's own inputs (so the keyboard, the form and the screen reader get
 * the real thing), drawn in the system: a hairline box that fills with the accent when it is on.
 */

const BOX =
  "peer relative size-4 shrink-0 cursor-pointer appearance-none bg-canvas ring-1 ring-line-strong ring-inset transition-colors " +
  "hover:ring-ink-4 checked:bg-accent checked:ring-accent indeterminate:bg-accent indeterminate:ring-accent " +
  "disabled:cursor-not-allowed disabled:bg-well disabled:ring-line disabled:checked:bg-ink-4 disabled:checked:ring-ink-4 " +
  "aria-invalid:ring-bad-ink"

export function Checkbox(
  { checked, indeterminate = false, onChange, label, description, disabled, invalid, className }: {
    readonly checked: boolean
    /** Some of a set: the select-all box when part of a table is selected. */
    readonly indeterminate?: boolean
    readonly onChange: (next: boolean) => void
    /** Shown beside the box. A box without a visible label is a `RowCheckbox`. */
    readonly label: ReactNode
    readonly description?: string
    readonly disabled?: boolean
    readonly invalid?: boolean
    readonly className?: string
  }
) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <span className={cx("inline-flex items-start gap-2.5", className)}>
      <span className="relative mt-0.5 inline-flex">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={invalid === true ? true : undefined}
          aria-describedby={description === undefined ? undefined : `${id}-d`}
          onChange={(event) => onChange(event.target.checked)}
          className={cx(BOX, "rounded-xs")}
        />
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden text-on-accent peer-checked:block peer-indeterminate:block"
        >
          {indeterminate
            ? <path d="M4.5 8H11.5" stroke="currentColor" strokeWidth="1.75" />
            : <path d="M4.25 8.25L6.75 10.75L11.75 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" />}
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className={cx("text-sm", disabled === true ? "text-ink-3" : "text-ink")}>{label}</label>
        {description !== undefined && <span id={`${id}-d`} className="text-xs text-ink-3">{description}</span>}
      </span>
    </span>
  )
}

/** A checkbox with no visible label: the box in a table row or a list's select-all. */
export function RowCheckbox({ checked, indeterminate = false, onChange, label, disabled = false }: {
  readonly checked: boolean
  readonly indeterminate?: boolean
  readonly onChange: (next: boolean) => void
  readonly label: string
  /** Fixed by something else (a channel not connected, a role that may not change it). */
  readonly disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <span className="relative inline-flex align-middle">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={cx(BOX, "rounded-xs")}
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden text-on-accent peer-checked:block peer-indeterminate:block"
      >
        {indeterminate
          ? <path d="M4.5 8H11.5" stroke="currentColor" strokeWidth="1.75" />
          : <path d="M4.25 8.25L6.75 10.75L11.75 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" />}
      </svg>
    </span>
  )
}

type RadioOption<T extends string> = { readonly value: T; readonly label: string; readonly description?: string }

/**
 * One of a few, each with room to explain itself (a refund's method, a store's region). For a choice
 * of two or three short words side by side, `Segmented` is lighter.
 */
export function RadioGroup<T extends string>({ value, onChange, options, label, disabled }: {
  readonly value: T
  readonly onChange: (next: T) => void
  readonly options: ReadonlyArray<RadioOption<T>>
  readonly label: string
  readonly disabled?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2.5" disabled={disabled}>
      <legend className="mb-1 text-xs font-medium text-ink">{label}</legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`
        return (
          <span key={option.value} className="inline-flex items-start gap-2.5">
            <span className="relative mt-0.5 inline-flex">
              <input
                id={id}
                type="radio"
                name={name}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                aria-describedby={option.description === undefined ? undefined : `${id}-d`}
                className={cx(BOX, "rounded-full checked:bg-canvas checked:ring-[5px] disabled:checked:bg-well")}
              />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <label htmlFor={id} className={cx("text-sm", disabled === true ? "text-ink-3" : "text-ink")}>
                {option.label}
              </label>
              {option.description !== undefined && (
                <span id={`${id}-d`} className="text-xs text-ink-3">{option.description}</span>
              )}
            </span>
          </span>
        )
      })}
    </fieldset>
  )
}
