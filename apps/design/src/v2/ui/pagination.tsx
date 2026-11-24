import { IconButton } from "./button.tsx"
import { cx } from "./cx.ts"
import { ChevronLeft, ChevronRight } from "./icons.tsx"

const count = new Intl.NumberFormat("nl-NL")

/** The page numbers to show: the first, the last, the current and its neighbours, gaps as null. */
function pages(current: number, last: number): ReadonlyArray<number | null> {
  const wanted = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last))
  const sorted = [...wanted].toSorted((a, b) => a - b)
  const out: Array<number | null> = []
  for (const [i, p] of sorted.entries()) {
    const prev = sorted[i - 1]
    if (prev !== undefined && p - prev > 1) out.push(null)
    out.push(p)
  }
  return out
}

/**
 * Pages of a long list: which rows you see of how many, and the way to the others. The range is
 * always there (it is the useful part); the numbered pages fold away on a phone, leaving back and next.
 */
export function Pagination({ page, pageSize, total, onChange, label = "Paginering" }: {
  /** 1-based. */
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly onChange: (next: number) => void
  readonly label?: string
}) {
  const last = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
      <p className="text-ink-3">
        <span className="figure text-ink-2">{count.format(from)}–{count.format(to)}</span> van{" "}
        <span className="figure text-ink-2">{count.format(total)}</span>
      </p>
      <div className="flex items-center gap-0.5">
        <IconButton label="Vorige pagina" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft />
        </IconButton>
        <ul className="hidden items-center gap-0.5 sm:flex">
          {pages(page, last).map((p, i) =>
            p === null
              ? <li key={`gap-${i}`} className="w-6 text-center text-ink-3" aria-hidden="true">…</li>
              : (
                <li key={p}>
                  <button
                    type="button"
                    aria-current={p === page ? "page" : undefined}
                    aria-label={`Pagina ${p}`}
                    onClick={() => onChange(p)}
                    className={cx(
                      "figure h-7 min-w-7 rounded-sm px-1.5 text-xs transition-colors",
                      p === page ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
                    )}
                  >
                    {p}
                  </button>
                </li>
              )
          )}
        </ul>
        <IconButton label="Volgende pagina" size="sm" disabled={page >= last} onClick={() => onChange(page + 1)}>
          <ChevronRight />
        </IconButton>
      </div>
    </nav>
  )
}
