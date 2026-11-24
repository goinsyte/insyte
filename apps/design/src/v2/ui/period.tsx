import { useState } from "react"
import { Button, IconButton } from "./button.tsx"
import { cx } from "./cx.ts"
import { Calendar as CalendarGlyph, ChevronDown, ChevronLeft, ChevronRight } from "./icons.tsx"
import { Select } from "./input.tsx"
import { Popover } from "./popover.tsx"

/*
 * Dates. A `Calendar` is one month, Monday first, in Dutch; a range is drawn as a band of the accent
 * tint between two accent days. The `PeriodPicker` is how a board, a list or an export chooses its
 * period: the presets people use (most of the time), a calendar for the rest, and what to compare
 * with, applied together so a board never redraws half-chosen.
 */

type Range = { readonly from: Date; readonly to: Date }

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const monthName = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })
const dayName = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" })
const short = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const

/** "16–22 nov", "28 okt – 3 nov", "23 nov". */
export function formatRange({ from, to }: Range): string {
  if (sameDay(from, to)) return short.format(from).replace(".", "")
  if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${short.format(to).replace(".", "")}`
  return `${short.format(from).replace(".", "")} – ${short.format(to).replace(".", "")}`
}

function Calendar({ month, onMonth, range, onPick, today }: {
  /** Any day in the month shown. */
  readonly month: Date
  readonly onMonth: (next: Date) => void
  readonly range: Range | null
  readonly onPick: (day: Date) => void
  readonly today: Date
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: ReadonlyArray<Date | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))
  ]
  const inRange = (d: Date) => range !== null && d >= startOfDay(range.from) && d <= startOfDay(range.to)
  const edge = (d: Date) => range !== null && (sameDay(d, range.from) || sameDay(d, range.to))

  return (
    <div className="flex w-[15.5rem] flex-col gap-2">
      <div className="flex items-center justify-between">
        <IconButton
          label="Vorige maand"
          size="sm"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft />
        </IconButton>
        <p className="text-sm font-medium text-ink first-letter:uppercase" aria-live="polite">
          {monthName.format(month)}
        </p>
        <IconButton
          label="Volgende maand"
          size="sm"
          onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight />
        </IconButton>
      </div>
      <div role="grid" aria-label={monthName.format(month)} className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAYS.map((d) => (
          <span key={d} role="columnheader" className="flex h-7 items-center justify-center text-2xs text-ink-3">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />
          const within = inRange(day)
          const isEdge = edge(day)
          const future = day > today
          return (
            <span
              key={day.toISOString()}
              role="gridcell"
              aria-selected={within}
              className={cx("flex h-8 items-center justify-center", within && !isEdge && "bg-accent-tint")}
            >
              <button
                type="button"
                disabled={future}
                aria-label={dayName.format(day)}
                aria-current={sameDay(day, today) ? "date" : undefined}
                onClick={() => onPick(day)}
                className={cx(
                  "figure inline-flex size-8 items-center justify-center rounded-sm text-xs transition-colors",
                  "disabled:text-ink-4",
                  isEdge
                    ? "bg-accent font-semibold text-on-accent"
                    : within
                    ? "text-accent-ink hover:bg-canvas"
                    : "text-ink hover:bg-hover",
                  sameDay(day, today) && !isEdge && "font-semibold underline underline-offset-4"
                )}
              >
                {day.getDate()}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export type Compare = "periode" | "jaar" | "geen"

export type Period = { readonly preset: string; readonly range: Range; readonly compare: Compare }

type Preset = { readonly id: string; readonly label: string; readonly range: (today: Date) => Range }

const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

export const PRESETS: ReadonlyArray<Preset> = [
  { id: "vandaag", label: "Vandaag", range: (t) => ({ from: t, to: t }) },
  { id: "gisteren", label: "Gisteren", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { id: "deze-week", label: "Deze week", range: (t) => ({ from: monday(t), to: t }) },
  {
    id: "vorige-week",
    label: "Vorige week",
    range: (t) => ({ from: addDays(monday(t), -7), to: addDays(monday(t), -1) })
  },
  { id: "30-dagen", label: "Laatste 30 dagen", range: (t) => ({ from: addDays(t, -29), to: t }) },
  {
    id: "deze-maand",
    label: "Deze maand",
    range: (t) => ({ from: new Date(t.getFullYear(), t.getMonth(), 1), to: t })
  },
  {
    id: "vorige-maand",
    label: "Vorige maand",
    range: (t) => ({
      from: new Date(t.getFullYear(), t.getMonth() - 1, 1),
      to: new Date(t.getFullYear(), t.getMonth(), 0)
    })
  }
]

const COMPARE_LABEL: Record<Compare, string> = {
  periode: "Periode ervoor",
  jaar: "Zelfde periode vorig jaar",
  geen: "Niet vergelijken"
}

/** The period's name for the trigger: the preset's word, or the dates when it is custom. */
function periodLabel(period: Period): string {
  const preset = PRESETS.find((p) => p.id === period.preset)
  return preset === undefined ? formatRange(period.range) : `${preset.label} · ${formatRange(period.range)}`
}

/** The picker's body, for the kit and for the popover. */
export function PeriodPanel({ value, today, onApply, onCancel }: {
  readonly value: Period
  readonly today: Date
  readonly onApply: (next: Period) => void
  readonly onCancel?: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [month, setMonth] = useState(value.range.to)
  const [anchor, setAnchor] = useState<Date | null>(null)

  const pick = (day: Date) => {
    if (anchor === null) {
      setAnchor(day)
      setDraft({ ...draft, preset: "aangepast", range: { from: day, to: day } })
    } else {
      const [from, to] = day < anchor ? [day, anchor] : [anchor, day]
      setAnchor(null)
      setDraft({ ...draft, preset: "aangepast", range: { from, to } })
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col sm:flex-row">
        <ul
          className="flex flex-row flex-wrap gap-1 border-b border-line p-2 sm:w-44 sm:flex-col sm:flex-nowrap sm:gap-px sm:border-r sm:border-b-0"
          aria-label="Snelkeuze"
        >
          {PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                aria-pressed={draft.preset === preset.id}
                onClick={() => {
                  const range = preset.range(today)
                  setDraft({ ...draft, preset: preset.id, range })
                  setMonth(range.to)
                  setAnchor(null)
                }}
                className={cx(
                  "flex h-7 w-full items-center rounded-sm px-2 text-left text-xs whitespace-nowrap transition-colors",
                  draft.preset === preset.id
                    ? "bg-selected font-medium text-ink"
                    : "text-ink-2 hover:bg-hover hover:text-ink"
                )}
              >
                {preset.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 p-3">
          <Calendar month={month} onMonth={setMonth} range={draft.range} onPick={pick} today={today} />
          <p className="figure text-xs text-ink-2" aria-live="polite">
            {anchor === null ? formatRange(draft.range) : "Kies de laatste dag"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-3">
          <span className="shrink-0">Vergelijken met</span>
          <Select
            value={draft.compare}
            onChange={(event) => setDraft({ ...draft, compare: event.target.value as Compare })}
            className="min-w-0 flex-1"
          >
            {(Object.keys(COMPARE_LABEL) as ReadonlyArray<Compare>).map((c) => (
              <option key={c} value={c}>{COMPARE_LABEL[c]}</option>
            ))}
          </Select>
        </label>
        {onCancel !== undefined && <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>}
        <Button variant="primary" size="sm" disabled={anchor !== null} onClick={() => onApply(draft)}>Toepassen</Button>
      </div>
    </div>
  )
}

export function PeriodPicker({ value, onChange, today }: {
  readonly value: Period
  readonly onChange: (next: Period) => void
  readonly today: Date
}) {
  return (
    <Popover
      label="Periode kiezen"
      width="w-auto"
      placement="bottom-end"
      trigger={(props) => (
        <Button size="sm" icon={<CalendarGlyph />} {...props}>
          <span className="figure">{periodLabel(value)}</span>
          <ChevronDown className="text-ink-3" />
        </Button>
      )}
    >
      {(close) => (
        <PeriodPanel
          value={value}
          today={today}
          onCancel={close}
          onApply={(next) => {
            onChange(next)
            close()
          }}
        />
      )}
    </Popover>
  )
}
