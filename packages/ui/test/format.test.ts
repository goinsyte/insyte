import { afterEach, describe, expect, it } from "vitest"
import {
  currencySymbol,
  DEFAULT_NOTATION,
  formatDate,
  formatDateTime,
  type Notation,
  readNotationFrom
} from "../src/app/lib/format.ts"

/* The console's shared date formatters follow the workspace's notation (Instellingen → Regio). */

const AFTERNOON = "2026-11-22T12:09:00Z" // 13:09 in Amsterdam
const MORNING = "2026-03-05T08:05:00Z" // 09:05 in Amsterdam

const DUTCH: Notation = DEFAULT_NOTATION
const ISO_12H: Notation = { dateFormat: "YYYY-MM-DD", timeFormat: "12h" }
const MONTH_FIRST: Notation = { dateFormat: "MMM DD, YYYY", timeFormat: "24h" }

afterEach(() => readNotationFrom(() => undefined))

describe("formatDate in the workspace's notation", () => {
  it("writes the Dutch day-month-year and the 24-hour clock by default", () => {
    expect(formatDate(AFTERNOON, undefined, DUTCH)).toBe("22 nov 2026")
    expect(formatDateTime(AFTERNOON, DUTCH)).toBe("22 nov 2026, 13:09")
    expect(formatDate(AFTERNOON, { year: undefined, hour: "2-digit", minute: "2-digit" }, DUTCH)).toBe("22 nov, 13:09")
  })

  it("writes year-month-day in numbers and the 12-hour clock", () => {
    expect(formatDate(AFTERNOON, undefined, ISO_12H)).toBe("2026-11-22")
    expect(formatDateTime(AFTERNOON, ISO_12H)).toBe("2026-11-22, 1:09 p.m.")
    expect(formatDateTime(MORNING, ISO_12H)).toBe("2026-03-05, 9:05 a.m.")
    // A date without its year keeps the month and day.
    expect(formatDate(AFTERNOON, { year: undefined, hour: "2-digit", minute: "2-digit" }, ISO_12H)).toBe(
      "11-22, 01:09 p.m."
    )
  })

  it("writes the month first", () => {
    expect(formatDate(AFTERNOON, undefined, MONTH_FIRST)).toBe("nov 22, 2026")
    expect(formatDate(AFTERNOON, { day: "numeric", month: "long", year: "numeric" }, MONTH_FIRST)).toBe(
      "november 22, 2026"
    )
    expect(formatDate(AFTERNOON, { weekday: "long", day: "numeric", month: "long", year: undefined }, MONTH_FIRST))
      .toBe("zondag november 22")
    expect(formatDateTime(MORNING, MONTH_FIRST)).toBe("mrt 5, 2026, 9:05")
  })

  it("lets the 12-hour clock win over a caller's own", () => {
    expect(formatDate(AFTERNOON, { hour: "2-digit", minute: "2-digit", hour12: false }, ISO_12H)).toBe(
      "2026-11-22, 01:09 p.m."
    )
  })

  it("reads the notation from where the host says", () => {
    expect(formatDateTime(AFTERNOON)).toBe("22 nov 2026, 13:09")
    readNotationFrom(() => ISO_12H)
    expect(formatDateTime(AFTERNOON)).toBe("2026-11-22, 1:09 p.m.")
    readNotationFrom(() => undefined)
    expect(formatDateTime(AFTERNOON)).toBe("22 nov 2026, 13:09")
  })
})

describe("currencySymbol", () => {
  it("writes the sign Dutch writes an amount with", () => {
    expect(currencySymbol("EUR")).toBe("€")
    expect(currencySymbol("USD")).toBe("US$")
    expect(currencySymbol("GBP")).toBe("£")
    expect(currencySymbol("nope")).toBe("nope")
  })
})
