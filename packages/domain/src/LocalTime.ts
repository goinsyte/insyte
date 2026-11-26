/*
 * A moment as a file writes it: ISO 8601 in a named timezone with its offset ("2026-11-21T19:26:11+01:00"), so a
 * reader sees the workspace's own clock and a program still reads the exact moment. An export's "Geplaatst" column
 * (the server's and the design app's) writes it.
 */

const formats = new Map<string, Intl.DateTimeFormat>()

const formatOf = (timeZone: string) => {
  let format = formats.get(timeZone)
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    formats.set(timeZone, format)
  }
  return format
}

const pad = (n: number) => String(n).padStart(2, "0")

/** `at` in `timeZone`, to the second, with the offset that zone had then: `2026-07-01T14:00:00+02:00`, `…Z` never. */
export const localIso = (at: Date, timeZone: string): string => {
  const parts = Object.fromEntries(formatOf(timeZone).formatToParts(at).map((p) => [p.type, p.value]))
  const [y, mo, d, h, mi, s] = [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second].map(Number)
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!)
  const offset = Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
  const sign = offset < 0 ? "-" : "+"
  const abs = Math.abs(offset)
  return `${y}-${pad(mo!)}-${pad(d!)}T${pad(h!)}:${pad(mi!)}:${pad(s!)}${sign}${pad(Math.floor(abs / 60))}:${
    pad(abs % 60)
  }`
}
