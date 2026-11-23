import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { Button, IconButton } from "./button.tsx"
import { cx } from "./cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "./dropdown.tsx"
import { Check, Columns, ListFilter, X } from "./icons.tsx"

/*
 * The pieces above a record table: what it is filtered on, a way to add a filter, which columns show,
 * and (when rows are ticked) what to do with them. `ListToolbar` lays them out; the table below
 * stays the same whatever the toolbar shows.
 */

/** The toolbar row: search and filters at the start, view controls at the end. Wraps on a phone. */
export function ListToolbar({ start, end }: { readonly start: ReactNode; readonly end?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{start}</div>
      {end !== undefined && <div className="flex shrink-0 items-center gap-1">{end}</div>}
    </div>
  )
}

/**
 * One filter that is on: the field, the value, and the way to take it off. Drawn on the accent tint
 * because it changes what the list shows; that is worth seeing at a glance.
 */
export function FilterChip({ field, value, onRemove }: {
  readonly field: string
  readonly value: string
  readonly onRemove: () => void
}) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-sm bg-accent-tint pr-1 pl-2 text-xs text-accent-ink">
      <span className="text-accent-ink">{field}</span>
      <span className="font-medium">{value}</span>
      <button
        type="button"
        aria-label={`Filter ${field}: ${value} weghalen`}
        onClick={onRemove}
        className="ml-0.5 inline-flex size-5 items-center justify-center rounded-xs hover:bg-canvas/70"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  )
}

export type FilterField = {
  readonly key: string
  readonly label: string
  readonly glyph?: Glyph
  readonly options: ReadonlyArray<string>
}

/** "Filter": a menu of fields, each with its values; a chosen value becomes a `FilterChip`. */
export function AddFilter({ fields, active, onAdd }: {
  readonly fields: ReadonlyArray<FilterField>
  /** What is on now, as `field:value`, so it is ticked in the menu. */
  readonly active: ReadonlySet<string>
  readonly onAdd: (field: string, value: string) => void
}) {
  return (
    <DropdownMenu
      label="Filter toevoegen"
      width="w-60"
      trigger={(props) => (
        <Button size="sm" variant="ghost" icon={<ListFilter />} {...props}>
          Filter
        </Button>
      )}
    >
      {fields.map((field, i) => (
        <div key={field.key}>
          {i > 0 && <DropdownSeparator />}
          <DropdownLabel>{field.label}</DropdownLabel>
          {field.options.map((option) => (
            <DropdownItem
              key={option}
              checked={active.has(`${field.key}:${option}`)}
              onSelect={() => onAdd(field.key, option)}
            >
              {option}
            </DropdownItem>
          ))}
        </div>
      ))}
    </DropdownMenu>
  )
}

export type ColumnOption = { readonly key: string; readonly label: string; readonly locked?: boolean }

/** Which columns the table shows. The column that names the row is locked on. */
export function ColumnPicker({ columns, visible, onChange }: {
  readonly columns: ReadonlyArray<ColumnOption>
  readonly visible: ReadonlySet<string>
  readonly onChange: (next: ReadonlySet<string>) => void
}) {
  return (
    <DropdownMenu
      label="Kolommen"
      placement="bottom-end"
      width="w-52"
      trigger={(props) => (
        <IconButton label="Kolommen kiezen" size="sm" {...props}>
          <Columns />
        </IconButton>
      )}
    >
      <DropdownLabel>Kolommen</DropdownLabel>
      {columns.map((column) => (
        <DropdownItem
          key={column.key}
          checked={visible.has(column.key)}
          disabled={column.locked}
          hint={column.locked === true ? "altijd" : undefined}
          onSelect={() => {
            const next = new Set(visible)
            if (next.has(column.key)) next.delete(column.key)
            else next.add(column.key)
            onChange(next)
          }}
        >
          {column.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  )
}

/**
 * What to do with the ticked rows: the count, the actions, and the way out. It replaces the toolbar
 * while rows are ticked, in ink so it reads as a mode, and is announced when it appears.
 */
export function SelectionBar({ count, noun, onClear, children, className }: {
  readonly count: number
  /** Singular and plural ("bestelling", "bestellingen"). */
  readonly noun: readonly [string, string]
  readonly onClear: () => void
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div
      role="region"
      aria-label="Selectie"
      className={cx(
        "flex min-h-9 flex-wrap items-center gap-2 rounded-md bg-ink py-1 pr-1 pl-3 text-on-ink",
        className
      )}
    >
      <p className="flex items-center gap-2 text-xs font-medium" aria-live="polite">
        <Check size={14} />
        <span className="figure">{count}</span> {count === 1 ? noun[0] : noun[1]} gekozen
      </p>
      <div className="flex flex-1 flex-wrap items-center gap-1">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="h-7 rounded-sm px-2 text-xs text-on-ink/80 hover:bg-on-ink/10 hover:text-on-ink"
      >
        Selectie wissen
      </button>
    </div>
  )
}

/** An action inside the selection bar: light text on the ink, so it keeps its contrast in both modes. */
export function SelectionAction({ children, icon, onClick, tone = "default" }: {
  readonly children: ReactNode
  readonly icon?: ReactNode
  readonly onClick?: () => void
  readonly tone?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium hover:bg-on-ink/10 [&_svg]:size-3.5",
        "text-on-ink",
        tone === "danger" && "[&_svg]:text-bad"
      )}
    >
      {icon}
      {children}
    </button>
  )
}
