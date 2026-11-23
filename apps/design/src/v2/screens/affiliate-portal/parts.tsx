import { useMemo } from "react"
import type { ReactNode } from "react"
import { affiliateBook, linkTotals } from "../../fixtures/affiliate-portal.ts"
import type { LinkTotals } from "../../fixtures/affiliate-portal.ts"
import { Link } from "../../router.tsx"
import { Figures as SharedFigures, LoadError as SharedLoadError } from "../../ui/data.tsx"
import type { FigureItem } from "../../ui/data.tsx"
import { dataState, useView } from "../../view.ts"
import { useAffiliate } from "./store.ts"

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
    <SharedLoadError size={size} what={what} detail="GET /affiliate/v1/portal · 503 · req_7f2a91c4">
      Northwind is even niet bereikbaar. Je links werken gewoon door; alleen dit overzicht wacht.
    </SharedLoadError>
  )
}

/* The affiliate portal's shared pieces: the book with this visit's links, the figures row, the states. */

/** Her links (the ones made in this visit first) and conversions, in the view's state. */
export function useBook() {
  const view = useView()
  const { made } = useAffiliate()
  const druk = view.staat === "druk"
  return useMemo(() => {
    const book = affiliateBook(druk)
    const all = { links: [...made, ...book.links], conversions: book.conversions }
    const totals: ReadonlyArray<LinkTotals> = all.links.map((l) => linkTotals(all, l))
    return { ...all, totals, own: new Set(made.map((l) => l.id)) }
  }, [druk, made])
}

const SHORT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })
const LONG = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" })
const FULL = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })

/** "23 nov" */
export const day = (d: Date) => SHORT.format(d).replace(".", "")
/** "15 december" */
export const dayLong = (d: Date) => LONG.format(d)
/** "4 mei 2026" */
export const dayFull = (d: Date) => FULL.format(d)

/** Always two decimals: a commission is cents. */
export const money = (n: number) =>
  `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`

/** Which of the four states a list draws, from the demo view. */
export function useDataState() {
  return dataState(useView())
}

/** A quiet section foot link: "Alle links ›". */
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
