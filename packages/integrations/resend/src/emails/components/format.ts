/*
 * Dates, money and counts as the console writes them (docs/dutch-copy.md): `nl-NL`, months in lower case in running
 * text, Amsterdam time, because a mail has no browser to ask for a zone.
 */

const ZONE = "Europe/Amsterdam"

/** A date, or the same date after a trip through JSON (the preview server's props editor sends strings). */
type When = Date | string

const on = (at: When) => (typeof at === "string" ? new Date(at) : at)

/** "15 november". */
export const day = (at: When) => on(at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: ZONE })

/** "maandag 9 november". */
export const weekday = (at: When) =>
  on(at).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE })

/** "oktober 2026". */
export const month = (at: When) =>
  on(at).toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: ZONE })

/** "9 november om 08:14". */
export const moment = (at: When) =>
  `${day(at)} om ${on(at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE })}`

/** Minor units in a currency: "€ 1.284,50". */
export const money = (minor: number, currency = "EUR") =>
  (minor / 100).toLocaleString("nl-NL", { style: "currency", currency })

/** "1.284". */
export const count = (n: number) => n.toLocaleString("nl-NL")

/** "1 bestelling", "3 bestellingen". */
export const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`
