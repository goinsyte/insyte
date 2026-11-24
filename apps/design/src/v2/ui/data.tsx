import type { ReactNode } from "react"
import { Link } from "../router.tsx"
import { setView } from "../view.ts"
import { Button } from "./button.tsx"
import { cx } from "./cx.ts"
import { Skeleton, SkeletonRow } from "./skeleton.tsx"
import { ErrorState } from "./states.tsx"
import { toast } from "./toast.tsx"

/*
 * The shapes a page of records takes while its data comes, when it does not, and the row of figures
 * under its head. One copy for every area, so a list in Klanten waits and fails the way one in a
 * portal does.
 */

/* ── figures ─────────────────────────────────────────────────────────────────────────────────── */

export type FigureItem = {
  readonly label: string
  readonly value: ReactNode
  readonly note?: ReactNode
  /** Where the figure is counted; the figure then opens it. */
  readonly to?: string
  readonly tone?: "bad" | "warn"
}

/**
 * A short row of figures under a page head: the value, what it counts. No tiles. `md` sits in a line
 * beside the head's meta; `lg` is a portal's or a dashboard's opening, two columns on a phone.
 */
export function Figures({ items, label, size = "md" }: {
  readonly items: ReadonlyArray<FigureItem>
  readonly label: string
  readonly size?: "md" | "lg"
}) {
  const lg = size === "lg"
  return (
    <dl
      aria-label={label}
      className={lg ? "-mx-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" : "flex flex-wrap gap-x-10 gap-y-4"}
    >
      {items.map((it) => {
        const tone = it.tone === "bad" ? "text-bad-ink" : it.tone === "warn" ? "text-warn-ink" : "text-ink"
        const body = lg
          ? (
            <>
              <dt className="text-xs text-ink-3">{it.label}</dt>
              <dd className="flex flex-col gap-0.5">
                <span className={cx("figure text-2xl", tone)}>{it.value}</span>
                {it.note !== undefined && <span className="text-xs text-ink-3">{it.note}</span>}
              </dd>
            </>
          )
          : (
            <>
              <dt className="text-xs text-ink-3">
                {it.label}
                {it.note !== undefined && <span className="text-ink-4">· {it.note}</span>}
              </dt>
              <dd className={cx("figure text-lg", tone)}>{it.value}</dd>
            </>
          )
        const shape = lg
          ? "flex min-w-0 flex-col gap-1.5 rounded-md px-2 py-2"
          : "flex min-w-0 flex-col-reverse gap-0.5 rounded-xs"
        return it.to === undefined
          ? <div key={it.label} className={shape}>{body}</div>
          : (
            <Link
              key={it.label}
              to={it.to}
              className={cx(shape, lg ? "transition-colors hover:bg-hover" : "hover:[&_dd]:text-accent-ink")}
            >
              {body}
            </Link>
          )
      })}
    </dl>
  )
}

export function FiguresSkeleton({ count = 4 }: { readonly count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flex flex-col gap-2 py-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-6 w-20" />
        </span>
      ))}
    </div>
  )
}

/* ── waiting ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * A table still coming: its head and rows at the real height, so nothing jumps when it lands.
 * `columns` is a count, or the real columns' widths in pixels; `toolbar` draws the search and filter
 * row a list keeps above its table.
 */
export function TableSkeleton({ rows = 8, columns = 6, label = "Laden", toolbar = false, avatar = false }: {
  readonly rows?: number
  readonly columns?: number | ReadonlyArray<number>
  readonly label?: string
  readonly toolbar?: boolean
  /** The first column is a person or a product: a round mark before the name. */
  readonly avatar?: boolean
}) {
  const widths = typeof columns === "number"
    ? Array.from({ length: columns }, (_, i) => (i === 0 ? 180 : 72))
    : columns
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-4">
      {toolbar && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-8 w-20" />
        </div>
      )}
      <div className="flex flex-col">
        <div className="flex h-9 items-center gap-6 border-b border-line">
          {widths.map((w, i) => <Skeleton key={i} className="h-2.5" style={{ width: w * 0.5 }} />)}
        </div>
        {Array.from(
          { length: rows },
          (_, r) => (
            <div key={r} className="flex h-11 items-center gap-6 overflow-hidden border-b border-line last:border-0">
              {avatar && <Skeleton className="size-6 shrink-0 rounded-full" />}
              {widths.map((w, i) => (
                <Skeleton key={i} className="h-3 shrink-0" style={{ width: w * (0.6 + ((r + i) % 3) * 0.15) }} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/** A record page still coming: its head, the figures under it, a wide column and a narrow one. */
export function RecordSkeleton({ label = "Laden", figures = true }: {
  readonly label?: string
  readonly figures?: boolean
}) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      {figures && (
        <div className="flex flex-wrap gap-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 10}%` }} />)}
        </div>
      </div>
    </div>
  )
}

/* ── failing ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The data did not come: what failed, the request for whoever helps, and trying again. Give `what`
 * ("De bestellingen") for the standard sentence, or a `title` of your own.
 */
export function LoadError({ what, title, one = false, detail, size = "md", children }: {
  readonly what?: string
  readonly title?: string
  /** One record ("De bestelling kon …") rather than a list ("De bestellingen konden …"). */
  readonly one?: boolean
  /** The failed request, for support: "GET /orders · 503 · req_…". */
  readonly detail: string
  readonly size?: "sm" | "md"
  /** What it means for the person; by default, that nothing was lost. */
  readonly children?: ReactNode
}) {
  return (
    <ErrorState
      size={size}
      title={title ?? `${what ?? "De gegevens"} ${one ? "kon" : "konden"} niet worden geladen`}
      detail={detail}
      action={
        <Button
          size={size === "sm" ? "sm" : "md"}
          onClick={() => {
            setView({ staat: "gewoon" })
            toast({ title: "Opnieuw geladen", tone: "good" })
          }}
        >
          Opnieuw proberen
        </Button>
      }
    >
      {children ?? "De verbinding viel even weg. Er is niets verloren gegaan; probeer het zo opnieuw."}
    </ErrorState>
  )
}
