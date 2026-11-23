import type { ReactNode } from "react"
import { dueOf } from "../../fixtures/supplier-portal.ts"
import type { SupOrder } from "../../fixtures/supplier-portal.ts"
import { Link } from "../../router.tsx"
import { Figures as SharedFigures, LoadError as SharedLoadError } from "../../ui/data.tsx"
import type { FigureItem } from "../../ui/data.tsx"
import { dataState, useView } from "../../view.ts"

export { saveFile } from "../../ui/acts.ts"
export type { FigureItem } from "../../ui/data.tsx"
export { FiguresSkeleton, TableSkeleton } from "../../ui/data.tsx"

/** The portal opens on its figures, large, each one a way into where it is counted. */
export function Figures(props: { readonly items: ReadonlyArray<FigureItem>; readonly label: string }) {
  return <SharedFigures size="lg" {...props} />
}

/** The data did not come: what failed, the request for whoever helps, and trying again. */
export function LoadError({ what, size = "md" }: { readonly what: string; readonly size?: "sm" | "md" }) {
  return (
    <SharedLoadError size={size} what={what} detail="GET /supplier/v1/allure-fulfillment · 503 · req_3c81e0d2">
      Insyte is even niet bereikbaar. Bestellingen die Northwind stuurt komen gewoon binnen en staan hier zodra het weer
      werkt.
    </SharedLoadError>
  )
}

/* The supplier portal's shared pieces: dates the way a warehouse reads them, the figures row, the states. */

const SHORT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })
const WEEKDAY = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })
const LONG = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" })
const FULL = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
const TIME = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" })

/** "23 nov" */
export const day = (d: Date) => SHORT.format(d).replace(".", "")
/** "ma 23 nov" */
export const weekday = (d: Date) => WEEKDAY.format(d).replaceAll(".", "")
/** "maandag 23 november" */
export const dayLong = (d: Date) => LONG.format(d)
/** "15 december" */
export const dayMonth = (d: Date) => FULL.format(d).replace(/ \d{4}$/, "")
/** "15 december 2026" */
export const dayFull = (d: Date) => FULL.format(d)
/** "14:30" */
export const time = (d: Date) => TIME.format(d)

/** Always cents: what Northwind pays is an invoice amount. */
export const money = (n: number) =>
  `${n < 0 ? "− " : ""}€ ${Math.abs(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const count = (n: number) => n.toLocaleString("nl-NL")

export const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`

/** The hand-off as the list reads it: the day, and Te laat or Vandaag when it matters. */
export function Handoff({ order }: { readonly order: SupOrder }) {
  const open = order.status === "te-accepteren" || order.status === "te-verzenden"
  const due = dueOf(order.handoff)
  return (
    <span className="flex flex-col">
      <span className="figure text-ink">{weekday(order.handoff)}, {time(order.handoff)}</span>
      {open && due === "late" && <span className="text-xs font-medium text-bad-ink">Te laat</span>}
      {open && due === "today" && <span className="text-xs text-warn-ink">Vandaag</span>}
    </span>
  )
}

export function useDataState() {
  return dataState(useView())
}

/** A quiet foot link under a section. */
export function MoreLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-8 items-center gap-1 self-start rounded-xs text-xs text-ink-3 hover:text-ink pointer-coarse:min-h-11"
    >
      {children}
    </Link>
  )
}
