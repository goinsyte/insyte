import type { ReactNode } from "react"
import { Link } from "../router.tsx"
import { cx } from "./cx.ts"

/**
 * A list of things that are not a table: the agents at work, the team, what waits on you. Each row
 * is a lead (a disc or a glyph tile), a title with one line under it, and something trailing (a
 * figure, a time, an action). `divided` puts hairlines between rows when they sit in a card.
 */
export function List({ children, divided = false, label, className }: {
  readonly children: ReactNode
  readonly divided?: boolean
  readonly label?: string
  readonly className?: string
}) {
  return (
    <ul
      aria-label={label}
      className={cx(
        "flex flex-col",
        divided ? "[&>li]:border-b [&>li]:border-line [&>li:last-child]:border-0" : "gap-px",
        className
      )}
    >
      {children}
    </ul>
  )
}

export function ListRow({ lead, title, meta, trail, href, onClick, padded = true }: {
  readonly lead?: ReactNode
  readonly title: ReactNode
  readonly meta?: ReactNode
  readonly trail?: ReactNode
  /** The whole row goes there. */
  readonly href?: string
  readonly onClick?: () => void
  /** Rows in a card get the card's inset; rows in a pane sit flush. */
  readonly padded?: boolean
}) {
  const body = (
    <>
      {lead !== undefined && <span className="flex shrink-0">{lead}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-ink">{title}</span>
        {meta !== undefined && <span className="truncate text-xs text-ink-3">{meta}</span>}
      </span>
      {trail !== undefined && <span className="flex shrink-0 items-center gap-2 text-xs text-ink-2">{trail}</span>}
    </>
  )
  const shape = cx("flex w-full items-center gap-3 rounded-md py-(--row-pad) text-left", padded ? "px-2" : "px-0")
  return (
    <li>
      {href !== undefined
        ? <Link to={href} className={cx(shape, "transition-colors hover:bg-hover")}>{body}</Link>
        : onClick !== undefined
        ? (
          <button type="button" onClick={onClick} className={cx(shape, "transition-colors hover:bg-hover")}>
            {body}
          </button>
        )
        : <div className={shape}>{body}</div>}
    </li>
  )
}

/** A glyph on a well tile: the lead of a row that is about a thing, not a person. */
export function GlyphTile({ children, size = 32 }: { readonly children: ReactNode; readonly size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-well text-ink-2"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/** A hairline between two groups that are not rows: in a toolbar, between a list and its foot. */
export function Separator(
  { vertical = false, className }: { readonly vertical?: boolean; readonly className?: string }
) {
  return (
    <span
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cx("block shrink-0 bg-line", vertical ? "h-5 w-px" : "h-px w-full", className)}
    />
  )
}
