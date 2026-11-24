import { useState } from "react"
import { useDemo } from "../../demo.ts"
import { KIND_LABEL, MOMENTS } from "../../fixtures/home.ts"
import type { Moment, MomentKind } from "../../fixtures/home.ts"
import { Link, paths } from "../../router.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { ChevronLeft, ChevronRight } from "../../ui/icons.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import {
  addDays,
  columnDay,
  dayAfter,
  daysFromToday,
  longDay,
  minutesOf,
  NOW_MINUTES,
  TODAY_KEY,
  weekStart
} from "./dates.ts"
import { BLOCK, KIND_GLYPH } from "./kinds.ts"
import { useHome } from "./store.ts"

/*
 * The Agenda: every deadline and scheduled thing in Insyte on one clock (evidence due, supplier
 * hand-offs, a ticket's claim deadline, the automations, the morning digest, the report) so the
 * operator sees the shape of the day before choosing what to do first. A day is a timeline with a
 * line for now; a week is seven columns of the same things. Every block opens its record, a queue
 * deadline opens its row on Overzicht, and what is already settled is struck through. The kinds
 * along the top switch a kind off and on.
 */

const HOUR = 48
const FIRST_HOUR = 6
const LAST_HOUR = 22

type Item = Moment & { readonly key: string; readonly settled: boolean }

/** The fixture's moments on their days, with your own dated to-dos as all-day items. */
function useMoments(): ReadonlyArray<Item> {
  const demo = useDemo()
  const home = useHome()
  const fixed = MOMENTS.map((m): Item => {
    const settled = m.queueId !== undefined &&
      (demo.decisions[m.queueId] !== undefined || home.settled[m.queueId] !== undefined)
    return { ...m, key: dayAfter(m.day), settled }
  })
  const todos = home.todos.flatMap((t): ReadonlyArray<Item> =>
    t.due === undefined ? [] : [{
      id: t.id,
      kind: "taak",
      day: daysFromToday(t.due),
      minutes: 0,
      title: t.text,
      tone: "neutral",
      href: `${paths.home}?weergave=werk`,
      key: t.due,
      settled: t.done
    }]
  )
  return [...fixed, ...todos]
}

const hrefOf = (m: Item) => (m.queueId === undefined ? m.href : `${paths.home}?rij=${m.queueId}`)

export function Agenda() {
  const all = useMoments()
  const [span, setSpan] = useState<"dag" | "week">("dag")
  const [day, setDay] = useState(TODAY_KEY)
  const [off, setOff] = useState<ReadonlySet<MomentKind>>(new Set())
  const kinds = [...new Set(all.map((m) => m.kind))]
  const shown = all.filter((m) => !off.has(m.kind))
  const step = span === "dag" ? 1 : 7
  const monday = weekStart(day)
  const title = span === "dag"
    ? longDay(day)
    : `Week van ${
      new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(new Date(`${monday}T12:00:00`))
    }`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <IconButton label={span === "dag" ? "Vorige dag" : "Vorige week"} onClick={() => setDay(addDays(day, -step))}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label={span === "dag" ? "Volgende dag" : "Volgende week"}
            onClick={() => setDay(addDays(day, step))}
          >
            <ChevronRight />
          </IconButton>
        </div>
        <h2 className="text-md font-semibold text-ink first-letter:uppercase">{title}</h2>
        {day !== TODAY_KEY && <Button size="sm" variant="ghost" onClick={() => setDay(TODAY_KEY)}>Vandaag</Button>}
        <span className="ml-auto">
          <Segmented
            size="sm"
            label="Wat de agenda toont"
            value={span}
            options={[{ value: "dag", label: "Dag" }, { value: "week", label: "Week" }]}
            onChange={setSpan}
          />
        </span>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Soorten tonen">
        {kinds.map((kind) => {
          const on = !off.has(kind)
          const Glyph = KIND_GLYPH[kind]
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setOff((s) => {
                  const next = new Set(s)
                  if (on) next.add(kind)
                  else next.delete(kind)
                  return next
                })}
              className={cx(
                "flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
                on ? "text-ink hover:bg-hover" : "text-ink-4 line-through decoration-ink-4 hover:text-ink-3"
              )}
            >
              <Glyph size={13} className={on ? "text-ink-3" : "text-ink-4"} />
              {KIND_LABEL[kind]}
              <span className="figure text-ink-3">{all.filter((m) => m.kind === kind).length}</span>
            </button>
          )
        })}
      </div>

      {span === "dag" ? <DayClock day={day} items={shown} /> : <Week start={monday} items={shown} />}
    </div>
  )
}

/** Things at the same time sit side by side, each in its own lane. */
function lanes(timed: ReadonlyArray<Item>) {
  const ends: Array<number> = []
  const placed = timed.toSorted((a, b) => minutesOf(a.time ?? "") - minutesOf(b.time ?? "")).map((m) => {
    const start = minutesOf(m.time ?? "")
    const end = start + Math.max(m.minutes, 40)
    let lane = ends.findIndex((e) => e <= start)
    if (lane === -1) {
      lane = ends.length
      ends.push(end)
    } else ends[lane] = end
    return { m, lane }
  })
  return { placed, count: Math.max(1, ends.length) }
}

function DayClock({ day, items }: { readonly day: string; readonly items: ReadonlyArray<Item> }) {
  const today = day === TODAY_KEY
  const on = items.filter((m) => m.key === day)
  const allDay = on.filter((m) => m.time === undefined)
  const timed = on.filter((m) => m.time !== undefined)
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  const top = (minutes: number) => ((minutes - FIRST_HOUR * 60) / 60) * HOUR
  const { placed, count } = lanes(timed)
  const past = (m: Item) => daysFromToday(day) < 0 || (today && minutesOf(m.time ?? "") + m.minutes <= NOW_MINUTES)

  return (
    <div className="flex flex-col gap-3">
      {allDay.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-2xs text-ink-3">Hele dag</span>
          {allDay.map((m) => (
            <Link
              key={m.id}
              to={hrefOf(m)}
              className={cx(
                "flex h-7 max-w-full items-center rounded-sm px-2 text-xs",
                BLOCK[m.tone],
                m.settled && "line-through opacity-60"
              )}
            >
              <span className="truncate">{m.title}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="relative" style={{ height: hours.length * HOUR }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: top(h * 60) }}>
            <span className="figure w-14 shrink-0 -translate-y-2 pr-3 text-right text-2xs text-ink-3">
              {String(h).padStart(2, "0")}:00
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-grid" />
          </div>
        ))}
        <ol className="absolute inset-y-0 right-0 left-14">
          {placed.map(({ m, lane }) => {
            const Glyph = KIND_GLYPH[m.kind]
            const height = Math.max(30, (Math.max(m.minutes, 20) / 60) * HOUR - 3)
            return (
              <li
                key={m.id}
                className="absolute pr-1"
                style={{
                  top: top(minutesOf(m.time ?? "")) + 1,
                  height,
                  left: `${(lane / count) * 100}%`,
                  width: `${100 / count}%`
                }}
              >
                <Link
                  to={hrefOf(m)}
                  className={cx(
                    "flex h-full min-w-0 items-start gap-1.5 overflow-hidden rounded-sm px-2 py-1 transition-[filter] hover:brightness-95",
                    BLOCK[m.tone],
                    (past(m) || m.settled) && "opacity-60"
                  )}
                >
                  <Glyph size={13} className="mt-0.5 shrink-0" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={cx("truncate text-xs font-medium", m.settled && "line-through")}>
                      <span className="figure">{m.time}</span> {m.title}
                    </span>
                    {m.detail !== undefined && height > 40 && (
                      <span className="truncate text-2xs opacity-80">{m.detail}</span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
        {today && (
          <div
            className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
            style={{ top: top(NOW_MINUTES) }}
            role="img"
            aria-label="Nu, 14:30"
          >
            <span className="figure w-14 shrink-0 pr-2 text-right text-2xs font-semibold text-accent-ink">14:30</span>
            <span aria-hidden="true" className="size-2 shrink-0 -translate-x-1 rounded-full bg-accent" />
            <span aria-hidden="true" className="h-0.5 flex-1 -translate-x-1 rounded-full bg-accent" />
          </div>
        )}
        {timed.length === 0 && (
          <p className="absolute top-12 left-16 text-sm text-ink-3">Op deze dag staat niets met een tijd.</p>
        )}
      </div>
    </div>
  )
}

function Week({ start, items }: { readonly start: string; readonly items: ReadonlyArray<Item> }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[52rem] grid-cols-7 gap-3">
        {days.map((d) => {
          const on = items.filter((m) => m.key === d).toSorted((a, b) =>
            (a.time === undefined ? -1 : minutesOf(a.time)) - (b.time === undefined ? -1 : minutesOf(b.time))
          )
          const isToday = d === TODAY_KEY
          const { name, date } = columnDay(d)
          return (
            <section key={d} aria-label={longDay(d)} className="flex min-h-64 min-w-0 flex-col gap-1.5">
              <header
                className={cx(
                  "flex items-baseline gap-1.5 pb-1 text-sm",
                  isToday ? "font-semibold text-accent-ink" : "text-ink-2"
                )}
              >
                <span className="first-letter:uppercase">{name}</span>
                <span className="figure">{date}</span>
              </header>
              {on.map((m) => {
                const quiet = m.kind === "automatisering" || m.kind === "overzicht"
                return (
                  <Link
                    key={m.id}
                    to={hrefOf(m)}
                    title={`${m.time ?? "Hele dag"} · ${m.title}${m.detail === undefined ? "" : ` · ${m.detail}`}`}
                    className={cx(
                      "flex min-w-0 flex-col rounded-sm px-1.5 py-1 leading-tight transition-[filter] hover:brightness-95",
                      quiet ? "text-ink-3 hover:bg-hover" : BLOCK[m.tone],
                      (daysFromToday(d) < 0 || m.settled) && "opacity-60"
                    )}
                  >
                    <span className="figure text-2xs opacity-80">{m.time ?? "Hele dag"}</span>
                    <span className={cx("line-clamp-2 text-xs", !quiet && "font-medium", m.settled && "line-through")}>
                      {m.title}
                    </span>
                  </Link>
                )
              })}
              {on.length === 0 && <p className="text-xs text-ink-4">Niets gepland</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** What the Agenda tab counts: what is still ahead today. */
export const aheadToday = () =>
  MOMENTS.filter((m) => m.day === 0 && m.time !== undefined && minutesOf(m.time) > NOW_MINUTES).length
