import { Link } from "@tanstack/react-router"
import { motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "../../icons"
import { EmptyPage } from "../common/empty-page"
import { Glyph } from "../common/glyph"
import { addDays, clock, dayKey, dayLabel, dayStart } from "../lib/home/dates"
import { KIND, type Moment, type MomentKind } from "../lib/home/day"
import { cn } from "../lib/utils"
import { useHome } from "../stores/home-store"
import { useDay } from "./use-day"

/**
 * The agenda: every deadline and scheduled thing in the console on one clock — evidence due,
 * supplier hand-offs, tickets with a first-reply deadline, the automations' schedule, the digest and
 * the report — so the operator sees the shape of the day before deciding what to do first. A day is
 * a ruled timeline with an `arc` now-line; a week is seven columns of the same items as rows. Every
 * block opens its record. The kinds along the top filter the clock.
 */

const HOUR = 52
const START = 6
const END = 23

const BLOCK: Record<Moment["tone"], string> = {
  red: "bg-signal-red-bg text-signal-red",
  amber: "bg-signal-amber-bg text-signal-amber",
  arc: "bg-arc-tint text-arc-ink",
  green: "bg-signal-green-bg text-signal-green",
  ink: "bg-mist text-ink-2"
}

export function Agenda() {
  const { now, moments } = useDay()
  const span = useHome((s) => s.agendaSpan)
  const setSpan = useHome((s) => s.setAgendaSpan)
  const [day, setDay] = useState(() => dayKey(now))
  const [off, setOff] = useState<ReadonlySet<MomentKind>>(new Set())
  const kinds = useMemo(() => [...new Set(moments.map((m) => m.kind))], [moments])
  const shown = moments.filter((m) => !off.has(m.kind))
  const step = span === "day" ? 1 : 7
  const weekStart = addDays(dayStart(day), -((new Date(dayStart(day)).getDay() + 6) % 7))
  const title = span === "day"
    ? new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(dayStart(day))
    : `Week van ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(dayStart(weekStart))}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setDay(addDays(dayStart(day), -step))}
            aria-label={span === "day" ? "Vorige dag" : "Vorige week"}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setDay(addDays(dayStart(day), step))}
            aria-label={span === "day" ? "Volgende dag" : "Volgende week"}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink"
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <h2 className="font-medium text-lg text-ink first-letter:uppercase">{title}</h2>
        {day !== dayKey(now) ?
          (
            <button
              type="button"
              onClick={() => setDay(dayKey(now))}
              className="h-8 cursor-pointer rounded-md px-2.5 font-medium text-sm text-arc-ink hover:bg-arc-tint"
            >
              Vandaag
            </button>
          ) :
          null}
        <div
          role="radiogroup"
          aria-label="Spanne van de agenda"
          className="ml-auto flex h-8 items-center rounded-md bg-ink/6 p-0.5"
        >
          {(["day", "week"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={span === s}
              onClick={() => setSpan(s)}
              className={cn(
                "relative flex h-7 cursor-pointer items-center rounded-[7px] px-3 text-sm transition-colors",
                span === s ? "font-medium text-ink" : "text-ink-2 hover:text-ink"
              )}
            >
              {span === s
                ? (
                  <motion.span
                    layoutId="agenda-span"
                    aria-hidden
                    className="absolute inset-0 rounded-[7px] bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                    transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                  />
                )
                : null}
              <span className="relative">{s === "day" ? "Dag" : "Week"}</span>
            </button>
          ))}
        </div>
      </div>
      {kinds.length > 1 ?
        (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Soorten tonen">
            {kinds.map((k) => {
              const on = !off.has(k)
              const n = moments.filter((m) => m.kind === k).length
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setOff((s) => {
                      const next = new Set(s)
                      if (on) next.add(k)
                      else next.delete(k)
                      return next
                    })}
                  className={cn(
                    "glyph-host flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
                    on ? "bg-paper text-ink" : "text-ink-3 line-through decoration-ink-4 hover:text-ink-2"
                  )}
                >
                  <Glyph icon={KIND[k].icon} size={13} draw={false} className={on ? "text-ink-2" : "text-ink-4"} />
                  {KIND[k].label}
                  <span className="text-xs text-ink-3 tabular-nums">{n}</span>
                </button>
              )
            })}
          </div>
        ) :
        null}
      {moments.length === 0 ?
        (
          <div className="rounded-xl bg-paper px-6">
            <EmptyPage
              kind="calendar"
              count="0 momenten"
              title="De agenda is nog leeg"
              body="Deadlines, overdrachten, automatiseringen en taken met een dag komen hier."
              starts={[
                {
                  id: "automations",
                  label: "Een automatisering plannen",
                  body: "Een flow op een vaste tijd.",
                  to: "/automations"
                },
                {
                  id: "suppliers",
                  label: "Leveranciers en hun overdrachten",
                  body: "Wanneer een leverancier aan de vervoerder overdraagt.",
                  to: "/suppliers"
                }
              ]}
            />
          </div>
        ) :
        span === "day" ?
        <DayClock day={day} now={now} moments={shown} /> :
        <Week start={weekStart} now={now} moments={shown} />}
    </div>
  )
}

function DayClock({ day, now, moments }: { day: string; now: number; moments: ReadonlyArray<Moment> }) {
  const still = useReducedMotion()
  const today = day === dayKey(now)
  const items = moments.filter((m) => dayKey(m.at) === day)
  const allDay = items.filter((m) => m.allDay)
  const timed = items.filter((m) => !m.allDay)
  const base = dayStart(day)
  const hourOf = (t: number) => (t - base) / 3_600_000
  const first = Math.min(START, ...timed.map((m) => Math.floor(hourOf(m.at))))
  const last = Math.max(END, ...timed.map((m) => Math.ceil(hourOf(m.at) + 0.75)))
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const top = (t: number) => (hourOf(t) - first) * HOUR

  // Lanes, so two things at once sit side by side instead of on top of each other.
  const placed = useMemo(() => {
    const sorted = [...timed].sort((a, b) => a.at - b.at)
    const lanes: number[] = []
    const out = sorted.map((m) => {
      const end = m.at + Math.max(m.minutes, 40) * 60_000
      let lane = lanes.findIndex((e) => e <= m.at)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(end)
      } else lanes[lane] = end
      return { m, lane }
    })
    return { out, lanes: Math.max(1, lanes.length) }
  }, [timed])

  return (
    <div className="flex flex-col gap-2">
      {allDay.length > 0 ?
        (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-paper px-3 py-2">
            <span className="w-12 text-xs text-ink-3">Hele dag</span>
            {allDay.map((m) => (
              <Link
                key={m.id}
                to={m.to}
                search={m.search as never}
                className={cn("flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-sm", BLOCK[m.tone])}
              >
                <span className="truncate">{m.title}</span>
              </Link>
            ))}
          </div>
        ) :
        null}
      <div className="relative rounded-xl bg-paper py-3 pr-3" style={{ height: hours.length * HOUR + 24 }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: (h - first) * HOUR + 12 }}>
            <span
              className={cn(
                "w-16 shrink-0 -translate-y-2 pr-3 text-right text-xs text-ink-3 tabular-nums",
                today && Math.abs(hourOf(now) - h) < 0.3 && "invisible"
              )}
            >
              {String(h % 24).padStart(2, "0")}:00
            </span>
            <span className="h-px flex-1 bg-ink/8" aria-hidden />
          </div>
        ))}
        <ol className="absolute inset-y-3 right-3 left-16">
          {placed.out.map(({ m, lane }) => {
            const k = KIND[m.kind]
            const past = m.at < now
            const h = Math.max(32, (Math.max(m.minutes, 15) / 60) * HOUR - 3)
            return (
              <li
                key={m.id}
                className="absolute pr-1"
                style={{
                  top: top(m.at) + 1,
                  height: h,
                  left: `${(lane / placed.lanes) * 100}%`,
                  width: `${100 / placed.lanes}%`
                }}
              >
                <Link
                  to={m.to}
                  search={m.search as never}
                  className={cn(
                    "glyph-host flex h-full min-w-0 items-start gap-2 overflow-hidden rounded-md px-2 py-1.5 transition-[filter] hover:brightness-[0.97]",
                    BLOCK[m.tone],
                    past && "opacity-60"
                  )}
                >
                  <Glyph icon={k.icon} size={13} draw={false} className="mt-0.5 shrink-0" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-medium text-sm">
                      <span className="tabular-nums">{clock(m.at)}</span> {m.title}
                    </span>
                    {m.detail && h > 40 ? <span className="truncate text-xs opacity-80">{m.detail}</span> : null}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
        {today ?
          (
            <div
              className="pointer-events-none absolute right-3 left-0 z-10 flex items-center"
              style={{ top: top(now) + 12 }}
              aria-label={`Nu, ${clock(now)}`}
            >
              <span className="w-16 shrink-0 -translate-y-px pr-2 text-right font-medium text-xs text-arc-ink tabular-nums">
                {clock(now)}
              </span>
              <span className="size-2 shrink-0 -translate-x-1 rounded-full bg-arc" aria-hidden />
              <motion.span
                aria-hidden
                className="h-[2px] flex-1 origin-left -translate-x-1 rounded-full bg-arc"
                initial={still ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          ) :
          null}
        {timed.length === 0
          ? <p className="absolute top-14 left-16 text-sm text-ink-3">Op deze dag staat niets met een tijd.</p>
          : null}
      </div>
    </div>
  )
}

function Week({ start, now, moments }: { start: string; now: number; moments: ReadonlyArray<Moment> }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(dayStart(start), i))
  const today = dayKey(now)
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="grid min-w-[880px] grid-cols-7 gap-1.5">
        {days.map((d) => {
          const items = moments.filter((m) => dayKey(m.at) === d)
          const isToday = d === today
          const date = new Date(dayStart(d))
          return (
            <section
              key={d}
              aria-label={dayLabel(d, now)}
              className={cn(
                "flex min-h-64 min-w-0 flex-col gap-1 rounded-xl px-1.5 py-2",
                isToday ? "bg-paper" : "bg-paper/60"
              )}
            >
              <header className="flex items-baseline gap-1.5 px-1.5 pb-1">
                <span
                  className={cn("text-sm first-letter:uppercase", isToday ? "font-medium text-arc-ink" : "text-ink-2")}
                >
                  {new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(date).replace(".", "")}
                </span>
                <span className={cn("text-sm tabular-nums", isToday ? "font-medium text-arc-ink" : "text-ink-3")}>
                  {date.getDate()}
                </span>
              </header>
              {items.map((m) => {
                const past = m.at < now
                const quiet = m.kind === "automation"
                return (
                  <Link
                    key={m.id}
                    to={m.to}
                    search={m.search as never}
                    title={`${m.allDay ? "Hele dag" : clock(m.at)} · ${m.title}${m.detail ? ` · ${m.detail}` : ""}`}
                    className={cn(
                      "flex min-w-0 flex-col rounded-md px-1.5 py-1 leading-tight transition-[filter] hover:brightness-[0.97]",
                      quiet ? "text-ink-2 hover:bg-ink/4" : BLOCK[m.tone],
                      past && "opacity-60"
                    )}
                  >
                    <span className="text-2xs tabular-nums opacity-80">{m.allDay ? "Hele dag" : clock(m.at)}</span>
                    <span className={cn("line-clamp-2 text-xs", quiet ? "" : "font-medium")}>{m.title}</span>
                  </Link>
                )
              })}
              {items.length === 0 ? <p className="px-1.5 text-xs text-ink-3">Niets gepland</p> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
