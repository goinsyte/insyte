import { DEMO_NOW } from "../../fixtures/workspace.ts"

/*
 * Start's days, as keys ("2026-11-23") on the demo's calendar: today is Monday 23 November, 14:30,
 * whatever day it really is. A fixture says a day as days after that Monday; a screen as the words
 * people use ("morgen", "vrijdag", "2 dec").
 */

const pad = (n: number) => String(n).padStart(2, "0")

const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const dateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
}

export const TODAY_KEY = dayKey(DEMO_NOW.date)

export function addDays(key: string, n: number): string {
  const d = dateOf(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

/** Days from today to `key`: 0 today, 1 tomorrow, −1 yesterday. */
export const daysFromToday = (key: string) =>
  Math.round((dateOf(key).getTime() - dateOf(TODAY_KEY).getTime()) / 86_400_000)

/** The day key `n` days after the demo's Monday. */
export const dayAfter = (n: number) => addDays(TODAY_KEY, n)

const weekday = new Intl.DateTimeFormat("nl-NL", { weekday: "long" })
const short = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

/** "vandaag", "morgen", "gisteren", "vrijdag" within the week, else "2 dec". */
export function dayLabel(key: string): string {
  const n = daysFromToday(key)
  if (n === 0) return "vandaag"
  if (n === 1) return "morgen"
  if (n === -1) return "gisteren"
  if (n === 2) return "overmorgen"
  if (n > 2 && n < 7) return weekday.format(dateOf(key))
  return short.format(dateOf(key)).replace(".", "")
}

/** "maandag 23 november" for a heading. */
export const longDay = (key: string) =>
  new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(dateOf(key))

/** "ma 23" for a week column. */
export const columnDay = (key: string) => {
  const d = dateOf(key)
  return { name: new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(d).replace(".", ""), date: d.getDate() }
}

/** The Monday of the week `key` falls in. */
export const weekStart = (key: string) => addDays(key, -((dateOf(key).getDay() + 6) % 7))

const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"]

/**
 * A quick-add line with its day at the end: "Linyi bellen morgen", "Allure mailen vrijdag",
 * "Kosten doorsturen volgende week". The day comes off the text; without one there is no date.
 */
export function parseDue(line: string): { readonly text: string; readonly due?: string } {
  const text = line.trim()
  const lower = text.toLowerCase()
  const cut = (word: string) => text.slice(0, text.length - word.length).trim()
  const rules: ReadonlyArray<readonly [string, () => string]> = [
    ["volgende week", () => addDays(weekStart(TODAY_KEY), 7)],
    ["overmorgen", () => addDays(TODAY_KEY, 2)],
    ["morgen", () => addDays(TODAY_KEY, 1)],
    ["vandaag", () => TODAY_KEY],
    ...DAYS.map((day, i) =>
      [day, () => {
        const ahead = (i - dateOf(TODAY_KEY).getDay() + 7) % 7
        return addDays(TODAY_KEY, ahead === 0 ? 7 : ahead)
      }] as const
    )
  ]
  for (const [word, due] of rules) {
    if (lower.endsWith(` ${word}`) && cut(word) !== "") return { text: cut(word), due: due() }
  }
  return { text }
}

/** "14:30" to minutes after midnight. */
export const minutesOf = (clock: string) => {
  const [h, m] = clock.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export const NOW_MINUTES = DEMO_NOW.hours * 60 + DEMO_NOW.minutes

/** The demo clock while the page is open: 14:30 when Start opened, moving on with real time. */
const OPENED = Date.now()
export function clockNow(): string {
  const total = NOW_MINUTES + Math.floor((Date.now() - OPENED) / 60_000)
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
}
