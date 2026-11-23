import { useId } from "react"
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import { cx } from "./cx.ts"
import { AlertTriangle, ChevronDown, Search, X } from "./icons.tsx"
import { Kbd } from "./kbd.tsx"

/*
 * The text controls: one field shape for all of them (32px, a hairline, the accent ring on focus, the
 * bad ink when it is wrong) so a form reads as one surface. A field is always named: by a `Field`
 * label, or by `aria-label` where the context names it (a search in a toolbar).
 */

const FIELD =
  "w-full min-w-0 rounded-sm bg-canvas text-sm text-ink ring-1 ring-line-strong ring-inset transition-shadow outline-none " +
  "placeholder:text-ink-3 hover:ring-ink-4 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-well disabled:text-ink-3 disabled:ring-line " +
  "aria-invalid:ring-bad-ink aria-invalid:focus-visible:ring-bad-ink read-only:bg-well read-only:ring-line"

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  /** A unit or sign in front of the value ("€"), inside the field. */
  readonly prefix?: string
  /** A unit after the value ("dagen", "%"). */
  readonly suffix?: string
}

export function Input({ prefix, suffix, className, ...rest }: InputProps) {
  if (prefix === undefined && suffix === undefined) {
    return <input className={cx(FIELD, "h-8 px-2.5 pointer-coarse:h-11", className)} {...rest} />
  }
  return (
    <span className={cx("relative flex items-center", className)}>
      {prefix !== undefined && (
        <span className="pointer-events-none absolute left-2.5 text-sm text-ink-3" aria-hidden="true">{prefix}</span>
      )}
      <input
        className={cx(
          FIELD,
          "h-8 pointer-coarse:h-11",
          prefix !== undefined ? "pl-7" : "pl-2.5",
          suffix !== undefined ? "pr-14" : "pr-2.5",
          rest.inputMode === "decimal" || rest.inputMode === "numeric" ? "figure" : undefined
        )}
        {...rest}
      />
      {suffix !== undefined && (
        <span className="pointer-events-none absolute right-2.5 text-xs text-ink-3" aria-hidden="true">{suffix}</span>
      )}
    </span>
  )
}

export function Textarea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cx(FIELD, "resize-y px-2.5 py-1.5 leading-5", className)} {...rest} />
}

/**
 * A choice from a list: the browser's own select, drawn as a field. Native on purpose: it is the
 * best keyboard and phone picker there is, and a list of a few options needs nothing more.
 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative flex items-center", className)}>
      <select className={cx(FIELD, "h-8 appearance-none pr-8 pl-2.5 pointer-coarse:h-11")} {...rest}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-ink-3" />
    </span>
  )
}

/**
 * Search in a toolbar or a list: the glyph, the query, a way to clear it, and the shortcut while it
 * is empty.
 */
export function SearchField({ value, onChange, label, placeholder = "Zoeken", shortcut, className }: {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly label: string
  readonly placeholder?: string
  readonly shortcut?: string
  readonly className?: string
}) {
  return (
    <span className={cx("relative flex items-center", className)}>
      <Search size={15} className="pointer-events-none absolute left-2.5 text-ink-3" />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.stopPropagation()
            onChange("")
          }
        }}
        className={cx(FIELD, "h-8 pr-8 pl-8 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value === ""
        ? shortcut !== undefined && (
          <span className="pointer-events-none absolute right-2" aria-hidden="true">
            <Kbd>{shortcut}</Kbd>
          </span>
        )
        : (
          <button
            type="button"
            aria-label="Zoekopdracht wissen"
            onClick={() => onChange("")}
            className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
    </span>
  )
}

/** A field's name. `optional` says so in words rather than starring the required ones. */
export function FieldLabel({ htmlFor, children, optional }: {
  readonly htmlFor?: string
  readonly children: ReactNode
  readonly optional?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-xs font-medium text-ink">
      {children}
      {optional === true && <span className="font-normal text-ink-3">optioneel</span>}
    </label>
  )
}

export type FieldControl = {
  readonly id: string
  readonly "aria-describedby"?: string
  readonly "aria-invalid"?: true
}

/**
 * One form field: the label, the control, a hint under it, and the error in its place when the value
 * is wrong (with a sign, not only red). The control is a render prop so it gets the ids that tie the
 * three together for a screen reader.
 */
export function Field({ label, hint, error, optional, children, className }: {
  readonly label: string
  readonly hint?: ReactNode
  readonly error?: string
  readonly optional?: boolean
  readonly children: (control: FieldControl) => ReactNode
  readonly className?: string
}) {
  const id = useId()
  const note = `${id}-note`
  const hasNote = error !== undefined || hint !== undefined
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={id} optional={optional}>{label}</FieldLabel>
      {children({
        id,
        "aria-describedby": hasNote ? note : undefined,
        "aria-invalid": error === undefined ? undefined : true
      })}
      {error !== undefined
        ? (
          <p id={note} className="flex items-start gap-1.5 text-xs text-bad-ink">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )
        : hint !== undefined && <p id={note} className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}
