import type { QuietHours } from "./Notifications.ts"

/*
 * Quiet hours (M11 step 13.5): push and Slack wait while they last, in the workspace's timezone; the app and e-mail do
 * not (widgets/04 §D, the page's guide). Hours that cross midnight (22:00 to 07:00) end the next morning; with the
 * weekend on, Saturday and Sunday are quiet whole and the hours end on Monday at their usual time.
 */

interface Local {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly minutes: number
  /** 1 is Monday, 7 is Sunday. */
  readonly weekday: number
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

const localOf = (at: Date, timezone: string): Local => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23"
    }).formatToParts(at).map((p) => [p.type, p.value])
  )
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    minutes: Number(parts["hour"]) * 60 + Number(parts["minute"]),
    weekday: WEEKDAYS[parts["weekday"] ?? "Mon"] ?? 1
  }
}

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))

/** The instant a local date and time is in the timezone (twice round the offset, for a day the clocks change). */
const instantOf = (year: number, month: number, day: number, minutes: number, timezone: string): Date => {
  const wall = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const local = localOf(new Date(guess), timezone)
    const seen = Date.UTC(local.year, local.month - 1, local.day, Math.floor(local.minutes / 60), local.minutes % 60)
    guess += wall - seen
  }
  return new Date(guess)
}

/** The local date `days` after this one, as a date in the calendar (not in any timezone). */
const plusDays = (local: Local, days: number) => {
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** When a push or Slack message raised at `at` may go: `null` now, or the end of the quiet hours it fell in. */
export const quietUntil = (at: Date, quiet: QuietHours, timezone: string): Date | null => {
  if (!quiet.on) return null
  const local = localOf(at, timezone)
  const from = minutesOf(quiet.from)
  const to = minutesOf(quiet.to)
  const weekend = quiet.weekend && local.weekday >= 6
  const inside = from < to
    ? local.minutes >= from && local.minutes < to
    : local.minutes >= from || local.minutes < to
  if (!inside && !weekend) return null
  // The day the hours end on: today, or tomorrow when they cross midnight and it is evening yet.
  let ends = from > to && local.minutes >= from ? 1 : 0
  if (!inside) ends = local.minutes < to ? 0 : 1
  if (quiet.weekend) {
    // A weekend day, or a night that ends on one, waits for Monday.
    const weekday = ((local.weekday - 1 + ends) % 7) + 1
    if (weekday >= 6) ends += 8 - weekday
  }
  const day = plusDays(local, ends)
  return instantOf(day.year, day.month, day.day, to, timezone)
}
