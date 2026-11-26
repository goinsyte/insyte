import { afterEach, describe, expect, it } from "vitest"
import {
  currencySymbol,
  DEFAULT_NOTATION,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPriceFrom,
  minorDigitsOf,
  type Notation,
  readNotationFrom,
  WHOLE
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

/* Amounts: a record's keeps the currency's minor digits; a figure that sums many asks for whole units. */
// Intl writes a non-breaking space between the sign and the amount.
const plain = (s: string) => s.replace(/\u00a0/g, " ")

describe("formatCurrency", () => {
  it("writes an order's or a product's amount with its cents, never rounded to whole units", () => {
    expect(plain(formatCurrency(24.95, "USD"))).toBe("US$ 24,95")
    expect(plain(formatCurrency(25, "EUR"))).toBe("€ 25,00")
    expect(plain(formatCurrency(1234.5, "GBP"))).toBe("£ 1.234,50")
  })

  it("keeps a currency without minor units whole, and a three-decimal one at Insyte's two", () => {
    expect(minorDigitsOf("JPY")).toBe(0)
    expect(plain(formatCurrency(2495, "JPY" as never))).toBe("JP¥ 2.495")
    expect(minorDigitsOf("KWD")).toBe(2)
    expect(minorDigitsOf("EUR")).toBe(2)
  })

  it("writes whole units where the caller opts in, as a KPI tile does", () => {
    expect(plain(formatCurrency(1234.56, "EUR", WHOLE))).toBe("€ 1.235")
    expect(plain(formatCurrency(24.95, "USD", { ...WHOLE, currencyDisplay: "narrowSymbol" }))).toBe("$ 25")
  })

  it("writes vanaf before a product's lowest price only when a variant costs more", () => {
    expect(plain(formatPriceFrom(9.95, 49.95, "USD"))).toBe("vanaf US$ 9,95")
    expect(plain(formatPriceFrom(24.95, 24.95, "USD"))).toBe("US$ 24,95")
    expect(plain(formatPriceFrom(24.95, undefined, "USD"))).toBe("US$ 24,95")
  })
})
