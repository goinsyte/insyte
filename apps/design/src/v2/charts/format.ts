/**
 * How a figure is written, in one place: every chart, tile and table cell goes through `formatValue`,
 * so "€ 48.210" is the same string on a board, in an answer and in a tooltip. `nl-NL` throughout.
 */
export type Format = "euro" | "count" | "percent" | "minutes" | "days"

const count = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 })
const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatValue(value: number, format: Format): string {
  switch (format) {
    case "euro":
      return euro.format(value)
    case "count":
      return count.format(value)
    case "percent":
      return `${oneDecimal.format(value)}%`
    case "minutes":
      return `${count.format(value)} min`
    case "days":
      return `${oneDecimal.format(value)} d`
  }
}

/** The short form for an axis: "€ 6k", "38k". */
export function formatAxis(value: number, format: Format): string {
  // A step of 2,5 is a nice step too: write its marks with their decimal instead of rounding them away.
  const plain = (v: number) => (Number.isInteger(v) ? count.format(v) : oneDecimal.format(v))
  if (format === "percent") return `${plain(value)}%`
  const short = Math.abs(value) >= 1000 ? `${oneDecimal.format(value / 1000).replace(/,0$/, "")}k` : plain(value)
  return format === "euro" ? `€ ${short}` : short
}

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±")

/**
 * The change from one value to another: a signed percentage ("+7,6%", "−26,3%"), or for a figure that
 * is itself a percentage, the difference in percentage points ("+0,8 pp"). A rate going from 2,6% to
 * 3,4% did not rise 31%; it rose 0,8 points.
 */
export function formatChange(current: number, previous: number, format?: Format): string {
  if (format === "percent") {
    const points = current - previous
    return `${sign(points)}${oneDecimal.format(Math.abs(points))} pp`
  }
  if (previous === 0) return "nieuw"
  const change = ((current - previous) / previous) * 100
  return `${sign(change)}${oneDecimal.format(Math.abs(change))}%`
}

export type Better = "higher" | "lower"

/** Whether a move is good news, given which direction is better for this figure. */
export function judge(current: number, previous: number, better: Better): "good" | "bad" | "flat" {
  if (current === previous) return "flat"
  const up = current > previous
  return up === (better === "higher") ? "good" : "bad"
}
