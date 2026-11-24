import { useState } from "react"
import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import type { Rol } from "../view.ts"
import { BAR_ACTION, BulkActions } from "./bulk.tsx"
import type { RowAction } from "./bulk.tsx"
import { Button, IconButton } from "./button.tsx"
import { cx } from "./cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "./dropdown.tsx"
import {
  appendTo,
  countRules,
  describeRule,
  emptyGroup,
  groupFor,
  OPS,
  retype,
  ruleFor,
  sameFilter,
  updateNode,
  VALUELESS
} from "./filter-model.ts"
import type { FieldType, Group, Join, Rule, TypedField } from "./filter-model.ts"
import {
  Calendar,
  Check,
  ChevronDown,
  Columns,
  Edit,
  FileText,
  Hash,
  List,
  ListFilter,
  MoreHorizontal,
  Pin,
  Plus,
  Save,
  Trash,
  X
} from "./icons.tsx"
import { Input, Select } from "./input.tsx"
import { Popover } from "./popover.tsx"
import { toast } from "./toast.tsx"
import { useSavedViews } from "./views.ts"

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
 *
 * Its actions come one of two ways: as `SelectionAction` children, or as one `actions` list over the
 * ticked `rows` (`bulk.tsx`), which also gives the Acties menu, ⌘K, the single keys, "3 van 5" and
 * the actions a role may not do. Both can sit side by side.
 */
export function SelectionBar<T>({ count, rows, actions, as, noun, onClear, children, className }: {
  /** How many are ticked; with `rows`, their number. */
  readonly count?: number
  readonly rows?: ReadonlyArray<T>
  readonly actions?: ReadonlyArray<RowAction<T>>
  /** Judge the actions' permissions as this role (the kit, a role preview). */
  readonly as?: Rol
  /** Singular and plural ("bestelling", "bestellingen"). */
  readonly noun: readonly [string, string]
  readonly onClear: () => void
  readonly children?: ReactNode
  readonly className?: string
}) {
  const n = count ?? rows?.length ?? 0
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
        <span className="figure">{n}</span> {n === 1 ? noun[0] : noun[1]} gekozen
      </p>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {children}
        {actions !== undefined && rows !== undefined && (
          <BulkActions rows={rows} actions={actions} onClear={onClear} as={as} />
        )}
      </div>
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
    <button type="button" onClick={onClick} className={cx(BAR_ACTION, tone === "danger" && "[&_svg]:text-bad")}>
      {icon}
      {children}
    </button>
  )
}

/* ── the filter builder ─────────────────────────────────────────────────────────────────────────── */

/*
 * The builder: one Filter button opens rules that read as sentences ("Waar Status is een van
 * Vertraagd, Betaald", "en Totaal is hoger dan 100"), the join switchable between En and Of, rows
 * added and taken out where they are, and a group for the "(dit of dat) en het andere" a flat list
 * cannot say. Each field names its type, and the operators offered are the ones that type can
 * answer. What is on stays in view as chips (`FilterRules`), and a chip opens its own rule. A filter
 * worth keeping becomes a view (`SavedViews`).
 *
 * The pickers inside are the browser's own selects and inline choices, not menus on menus, so the
 * panel never closes under a second layer.
 */

const TYPE_GLYPH: Readonly<Record<FieldType, Glyph>> = { option: List, text: FileText, number: Hash, date: Calendar }
const TYPE_LABEL: Readonly<Record<FieldType, string>> = {
  option: "Optie",
  text: "Tekst",
  number: "Getal",
  date: "Datum"
}

type Editor<T> = {
  readonly fields: ReadonlyArray<TypedField<T>>
  /** The rows being filtered: an option field's values and their counts come from them. */
  readonly rows: ReadonlyArray<T>
  readonly value: Group
  readonly onChange: (next: Group) => void
}

/** Where a field is being picked for: a new rule or group at the top, or a rule inside a group. */
type Picking = { readonly into: string; readonly as: "rule" | "group" } | null

/** The Filter button and its builder. With `views`, a filter can be kept as a view of that list. */
export function FilterBuilder<T>({ views, ...editor }: Editor<T> & { readonly views?: string }) {
  const n = countRules(editor.value)
  return (
    <Popover
      label="Filters"
      width="w-[min(40rem,calc(100vw-1rem))]"
      trigger={(props) => (
        <Button
          size="sm"
          variant="ghost"
          icon={<ListFilter />}
          className={n > 0 ? "bg-accent-tint text-accent-ink hover:bg-accent-tint hover:text-accent-ink" : undefined}
          {...props}
        >
          Filter
          {n > 0 && <span className="figure font-normal">{n}</span>}
        </Button>
      )}
    >
      <Builder {...editor} views={views} />
    </Popover>
  )
}

function Builder<T>({ fields, rows, value, onChange, views }: Editor<T> & { readonly views?: string }) {
  const [picking, setPicking] = useState<Picking>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const saved = useSavedViews(views ?? "")
  const empty = value.children.length === 0
  const add = (field: TypedField<T>) => {
    if (picking === null) return
    const node = picking.as === "group" ? groupFor(field) : ruleFor(field)
    onChange(appendTo(value, picking.into, node))
    setPicking(null)
  }
  return (
    <div className="flex flex-col">
      <header className="flex h-11 items-center gap-2 px-4">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        {!empty && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => onChange(emptyGroup(value.join))}
          >
            Alles wissen
          </Button>
        )}
      </header>
      <div className="flex flex-col gap-2 px-4 pb-3">
        {empty
          ? <p className="text-sm text-ink-3">Nog geen filters: de hele lijst staat er.</p>
          : (
            <GroupRows
              group={value}
              root={value}
              fields={fields}
              rows={rows}
              onChange={onChange}
              picking={picking}
              onPick={setPicking}
              onAdd={add}
            />
          )}
        {picking !== null && picking.into === value.id && (
          <FieldChoice
            fields={fields}
            onPick={add}
            onCancel={() => setPicking(null)}
          />
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-1 px-2 pb-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          onClick={() => setPicking({ into: value.id, as: "rule" })}
        >
          Filter toevoegen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          onClick={() => setPicking({ into: value.id, as: "group" })}
        >
          Groep toevoegen
        </Button>
        {views !== undefined && countRules(value) > 0 && (
          naming === null
            ? (
              <Button size="sm" variant="ghost" icon={<Save />} className="ml-auto" onClick={() => setNaming("")}>
                Opslaan als weergave
              </Button>
            )
            : (
              <form
                className="ml-auto flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = naming.trim()
                  if (name === "") return
                  saved.save(name, value)
                  setNaming(null)
                  toast({ title: `Weergave ‘${name}’ bewaard`, tone: "good" })
                }}
              >
                <Input
                  autoFocus
                  value={naming}
                  onChange={(event) => setNaming(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return
                    event.stopPropagation()
                    setNaming(null)
                  }}
                  placeholder="Naam van de weergave"
                  aria-label="Naam van de weergave"
                  className="h-7 w-44"
                />
                <Button size="sm" variant="primary" type="submit" disabled={naming.trim() === ""}>Opslaan</Button>
              </form>
            )
        )}
      </footer>
    </div>
  )
}

/** The fields to start a rule on, inline under the rules: each with its type. */
function FieldChoice<T>({ fields, onPick, onCancel }: {
  readonly fields: ReadonlyArray<TypedField<T>>
  readonly onPick: (field: TypedField<T>) => void
  readonly onCancel: () => void
}) {
  return (
    <div role="group" aria-label="Filteren op" className="flex flex-wrap items-center gap-1">
      <span className="pr-1 text-xs text-ink-3">Filteren op</span>
      {fields.map((field) => {
        const G = TYPE_GLYPH[field.type]
        return (
          <button
            key={field.key}
            type="button"
            title={TYPE_LABEL[field.type]}
            onClick={() => onPick(field)}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-well px-2 text-xs text-ink transition-colors hover:bg-hover"
          >
            <G size={13} className="text-ink-3" />
            {field.label}
          </button>
        )
      })}
      <Button size="sm" variant="ghost" onClick={onCancel}>Annuleren</Button>
    </div>
  )
}

function GroupRows<T>({ group, root, fields, rows, onChange, picking, onPick, onAdd }: {
  readonly group: Group
  readonly root: Group
  readonly fields: ReadonlyArray<TypedField<T>>
  readonly rows: ReadonlyArray<T>
  readonly onChange: (next: Group) => void
  readonly picking: Picking
  readonly onPick: (next: Picking) => void
  readonly onAdd: (field: TypedField<T>) => void
}) {
  const toggleJoin = () =>
    onChange(
      updateNode(root, group.id, (g) => (g.kind === "group" ? { ...g, join: g.join === "and" ? "or" : "and" } : g))
    )
  return (
    <>
      {group.children.map((child, i) => (
        <div key={child.id} className="flex items-start gap-2">
          <JoinCell index={i} join={group.join} onToggle={toggleJoin} />
          {child.kind === "rule"
            ? (
              <RuleRow
                rule={child}
                fields={fields}
                rows={rows}
                onChange={(next) => onChange(updateNode(root, child.id, () => next))}
                onRemove={() => onChange(updateNode(root, child.id, () => null))}
              />
            )
            : (
              <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-md bg-well p-2">
                <GroupRows
                  group={child}
                  root={root}
                  fields={fields}
                  rows={rows}
                  onChange={onChange}
                  picking={picking}
                  onPick={onPick}
                  onAdd={onAdd}
                />
                {picking !== null && picking.into === child.id
                  ? <FieldChoice fields={fields} onPick={onAdd} onCancel={() => onPick(null)} />
                  : (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Plus />}
                        onClick={() => onPick({ into: child.id, as: "rule" })}
                      >
                        Toevoegen aan groep
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => onChange(updateNode(root, child.id, () => null))}
                      >
                        Groep weghalen
                      </Button>
                    </div>
                  )}
              </div>
            )}
        </div>
      ))}
    </>
  )
}

/** "Waar" before the first rule; the join before the second, where it switches; its word after. */
function JoinCell(
  { index, join, onToggle }: { readonly index: number; readonly join: Join; readonly onToggle: () => void }
) {
  const word = index === 0 ? "Waar" : join === "and" ? "En" : "Of"
  if (index !== 1) return <span className="flex h-8 w-12 shrink-0 items-center text-sm text-ink-3">{word}</span>
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Wissel tussen alle regels en een van de regels"
      aria-label={`${word}: wisselen naar ${join === "and" ? "of" : "en"}`}
      className="flex h-8 w-12 shrink-0 items-center justify-between rounded-sm px-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-tint"
    >
      {word}
      <ChevronDown size={12} />
    </button>
  )
}

function RuleRow<T>({ rule, fields, rows, onChange, onRemove }: {
  readonly rule: Rule
  readonly fields: ReadonlyArray<TypedField<T>>
  readonly rows: ReadonlyArray<T>
  readonly onChange: (next: Rule) => void
  readonly onRemove: () => void
}) {
  const field = fields.find((f) => f.key === rule.field)
  if (field === undefined) return null
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <Select
        aria-label="Veld"
        value={rule.field}
        className="w-36"
        onChange={(event) => {
          const next = fields.find((f) => f.key === event.target.value)
          if (next !== undefined && next.key !== rule.field) onChange({ ...ruleFor(next), id: rule.id })
        }}
      >
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </Select>
      <Select
        aria-label={`Hoe ${field.label} moet zijn`}
        value={rule.op}
        className="w-36"
        onChange={(event) => {
          const op = OPS[field.type].find((o) => o.op === event.target.value)?.op
          if (op !== undefined) onChange({ ...rule, op, value: retype(rule.value, field.type, op) })
        }}
      >
        {OPS[field.type].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </Select>
      {!VALUELESS.has(rule.op) && field.type !== "option" && (
        <ValueField
          rule={rule}
          field={field}
          onChange={(value) => onChange({ ...rule, value })}
        />
      )}
      <IconButton size="sm" label={`Filter op ${field.label} weghalen`} className="ml-auto" onClick={onRemove}>
        <X />
      </IconButton>
      {!VALUELESS.has(rule.op) && field.type === "option" && (
        <OptionChoice
          field={field}
          rows={rows}
          value={Array.isArray(rule.value) ? rule.value : []}
          onChange={(value) => onChange({ ...rule, value })}
        />
      )}
    </div>
  )
}

function ValueField<T>({ rule, field, onChange }: {
  readonly rule: Rule
  readonly field: TypedField<T>
  readonly onChange: (next: string) => void
}) {
  const text = Array.isArray(rule.value) ? "" : String(rule.value)
  if (field.type === "date" && rule.op === "last_days") {
    return (
      <Input
        type="number"
        min={1}
        inputMode="numeric"
        suffix="dagen"
        value={text}
        aria-label="Aantal dagen"
        className="w-32"
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <Input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={text}
      placeholder={field.type === "number" ? "0" : "Typ een waarde"}
      aria-label={`Waarde voor ${field.label}`}
      className={field.type === "text" ? "min-w-40 flex-1" : "w-40"}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** An option field's values as choices that tick on and off, each with how many rows have it. */
function OptionChoice<T>({ field, rows, value, onChange }: {
  readonly field: TypedField<T>
  readonly rows: ReadonlyArray<T>
  readonly value: ReadonlyArray<string>
  readonly onChange: (next: ReadonlyArray<string>) => void
}) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const v = field.get(row)
    if (v !== null && v !== undefined && v !== "") counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
  }
  const options = field.options ?? [...counts.keys()].toSorted((a, b) => a.localeCompare(b, "nl"))
  return (
    <div role="group" aria-label={`Waarden voor ${field.label}`} className="flex w-full flex-wrap gap-1">
      {options.map((option) => {
        const on = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== option) : [...value, option])}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
              on ? "bg-accent-tint font-medium text-accent-ink" : "bg-well text-ink-2 hover:bg-hover hover:text-ink"
            )}
          >
            {on && <Check size={12} />}
            {option}
            <span className={cx("figure font-normal", on ? "text-accent-ink/70" : "text-ink-3")}>
              {counts.get(option) ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * What is on, as one chip per rule beside the toolbar: the join word between them, a chip that opens
 * its own rule where it sits, its cross that takes it off. A group is one chip that opens the group.
 */
export function FilterRules<T>({ fields, rows, value, onChange }: Editor<T>) {
  const live = value.children.filter((c) => countRules(c) > 0)
  if (live.length === 0) return null
  return (
    <>
      {live.map((node, i) => (
        <span key={node.id} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-ink-3">{value.join === "and" ? "en" : "of"}</span>}
          <RuleChip node={node} fields={fields} rows={rows} value={value} onChange={onChange} />
        </span>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange(emptyGroup(value.join))}>Wissen</Button>
    </>
  )
}

function RuleChip<T>({ node, fields, rows, value, onChange }: Editor<T> & { readonly node: Rule | Group }) {
  const [picking, setPicking] = useState<Picking>(null)
  const remove = () => onChange(updateNode(value, node.id, () => null))
  const n = countRules(node)
  const face = node.kind === "rule"
    ? describeRule(node, fields)
    : {
      field: "Groep",
      op: node.join === "and" ? "past bij alle" : "past bij een van",
      value: `${n} ${n === 1 ? "regel" : "regels"}`
    }
  const type = node.kind === "rule" ? fields.find((f) => f.key === node.field)?.type : undefined
  const G = type === undefined ? ListFilter : TYPE_GLYPH[type]
  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-sm bg-accent-tint text-xs text-accent-ink">
      <Popover
        label={`Filter op ${face.field}`}
        width="w-[min(36rem,calc(100vw-1rem))]"
        className="p-3"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="inline-flex h-full max-w-72 items-center gap-1 rounded-l-sm pr-1 pl-2 hover:bg-canvas/50"
          >
            <G size={12} className="shrink-0" />
            <span className="font-medium">{face.field}</span>
            <span className="text-accent-ink/80">{face.op}</span>
            {face.value !== "" && <span className="truncate font-medium">{face.value}</span>}
          </button>
        )}
      >
        {node.kind === "rule"
          ? (
            <RuleRow
              rule={node}
              fields={fields}
              rows={rows}
              onChange={(next) => onChange(updateNode(value, node.id, () => next))}
              onRemove={remove}
            />
          )
          : (
            <div className="flex flex-col gap-2">
              <GroupRows
                group={node}
                root={value}
                fields={fields}
                rows={rows}
                onChange={onChange}
                picking={picking}
                onPick={setPicking}
                onAdd={(field) => {
                  onChange(appendTo(value, node.id, ruleFor(field)))
                  setPicking(null)
                }}
              />
              {picking === null
                ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus />}
                    className="self-start"
                    onClick={() => setPicking({ into: node.id, as: "rule" })}
                  >
                    Toevoegen aan groep
                  </Button>
                )
                : (
                  <FieldChoice
                    fields={fields}
                    onPick={(field) => {
                      onChange(appendTo(value, node.id, ruleFor(field)))
                      setPicking(null)
                    }}
                    onCancel={() => setPicking(null)}
                  />
                )}
            </div>
          )}
      </Popover>
      <button
        type="button"
        aria-label={`Filter op ${face.field} weghalen`}
        onClick={remove}
        className="inline-flex h-full w-6 items-center justify-center rounded-r-sm hover:bg-canvas/50"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  )
}

/* ── saved views ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The views over a list, as tabs: the list's own "Alles" and every filter kept under a name, the
 * pinned ones first. A view whose filter was changed offers to keep the change; the view's menu pins
 * it, renames it in place or deletes it, with the way back.
 */
export function SavedViews({ list, value, onPick, allLabel = "Alles" }: {
  /** The list's key, the same as the builder's `views`. */
  readonly list: string
  /** The filter on screen, to tell whether the view was changed. */
  readonly value: Group
  readonly onPick: (filter: Group) => void
  readonly allLabel?: string
}) {
  const saved = useSavedViews(list)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")
  const { views, active } = saved
  if (views.length === 0) return null
  const changed = active !== null && !sameFilter(active.filter, value)
  const pick = (id: string | null) => {
    saved.setActive(id)
    onPick(id === null ? emptyGroup() : views.find((v) => v.id === id)?.filter ?? emptyGroup())
  }
  const commit = () => {
    if (renaming !== null && name.trim() !== "") saved.rename(renaming, name.trim())
    setRenaming(null)
  }
  const tab = (id: string | null, label: string, pinned = false) => {
    const on = (active?.id ?? null) === id
    return (
      <button
        key={id ?? "alles"}
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => pick(id)}
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm whitespace-nowrap transition-colors pointer-coarse:h-11",
          on ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
        )}
      >
        {pinned && <Pin size={12} className="text-ink-3" />}
        {label}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <div role="tablist" aria-label="Weergaven" className="flex flex-wrap items-center gap-0.5">
        {tab(null, allLabel)}
        {views.map((view) =>
          renaming === view.id
            ? (
              <Input
                key={view.id}
                autoFocus
                value={name}
                aria-label="Nieuwe naam van de weergave"
                className="h-8 w-44"
                onChange={(event) => setName(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit()
                  if (event.key === "Escape") {
                    event.stopPropagation()
                    setRenaming(null)
                  }
                }}
              />
            )
            : tab(view.id, view.name, view.pinned)
        )}
      </div>
      {changed && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Save />}
          onClick={() => {
            saved.update(active.id, value)
            toast({ title: `‘${active.name}’ bijgewerkt`, tone: "good" })
          }}
        >
          Opslaan in {active.name}
        </Button>
      )}
      {active !== null && renaming === null && (
        <DropdownMenu
          label={`Weergave ${active.name}`}
          width="w-52"
          trigger={(props) => (
            <IconButton size="sm" label={`Opties voor ${active.name}`} {...props}>
              <MoreHorizontal />
            </IconButton>
          )}
        >
          <DropdownItem glyph={Pin} onSelect={() => saved.togglePin(active.id)}>
            {active.pinned ? "Losmaken" : "Vastzetten"}
          </DropdownItem>
          <DropdownItem
            glyph={Edit}
            onSelect={() => {
              setName(active.name)
              setRenaming(active.id)
            }}
          >
            Naam wijzigen
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            glyph={Trash}
            tone="danger"
            onSelect={() => {
              const undo = saved.remove(active.id)
              const filter = active.filter
              onPick(emptyGroup())
              toast({
                title: `Weergave ‘${active.name}’ verwijderd`,
                action: {
                  label: "Ongedaan maken",
                  onClick: () => {
                    undo()
                    onPick(filter)
                  }
                }
              })
            }}
          >
            Weergave verwijderen
          </DropdownItem>
        </DropdownMenu>
      )}
    </div>
  )
}
