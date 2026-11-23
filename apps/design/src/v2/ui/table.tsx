import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "./icons.tsx"

/*
 * A record table: the list of orders, tickets, agents. Words left, figures right, hairlines
 * between rows because rows are data, a grey head in small type. A row can be selected (accent tint
 * and its box ticked) and opens its record. On a narrow screen the table scrolls sideways inside its
 * own frame rather than squeezing every cell.
 *
 * The chart system's `DataTable` (`charts/data-table.tsx`) is a figure on a board, not this.
 */

export type Align = "left" | "right"
export type Sort = "asc" | "desc" | null

export function Table({ children, label, minWidth = 640, className }: {
  readonly children: ReactNode
  /** What the table lists, for screen readers. */
  readonly label: string
  readonly minWidth?: number
  readonly className?: string
}) {
  return (
    // Focusable so a keyboard can scroll a table that is wider than its pane.
    <div role="region" aria-label={label} tabIndex={0} className={cx("pane-scroll overflow-x-auto", className)}>
      <table aria-label={label} className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function THead({ children }: { readonly children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  )
}

export function TBody({ children }: { readonly children: ReactNode }) {
  return <tbody>{children}</tbody>
}

/** A column head. With `onSort` it is a button that cycles the sort and says which way it is. */
export function Th({ children, align = "left", sort, onSort, width, className }: {
  readonly children?: ReactNode
  readonly align?: Align
  readonly sort?: Sort
  readonly onSort?: () => void
  readonly width?: number | string
  readonly className?: string
}) {
  const content = onSort === undefined ? children : (
    <button
      type="button"
      onClick={onSort}
      className={cx(
        // The hover pad grows away from the column's edge, so a right-aligned last column never
        // pushes past the table.
        "inline-flex items-center gap-1 rounded-xs hover:text-ink",
        align === "right" ? "flex-row-reverse pl-1" : "-ml-1 px-1",
        sort !== null && sort !== undefined && "text-ink"
      )}
    >
      {children}
      {sort === "asc" ?
        <ArrowUp size={12} /> :
        sort === "desc" ?
        <ArrowDown size={12} /> :
        <ChevronsUpDown size={12} className="text-ink-4" />}
    </button>
  )
  return (
    <th
      scope="col"
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
      style={{ width }}
      className={cx(
        "h-(--row-head) px-3 text-xs font-medium whitespace-nowrap text-ink-3 first:pl-0 last:pr-0",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {content}
    </th>
  )
}

export function Tr({ children, selected = false, onOpen, className }: {
  readonly children: ReactNode
  readonly selected?: boolean
  /** The row opens its record on a press (the first cell holds the real link or button too). */
  readonly onOpen?: () => void
  readonly className?: string
}) {
  return (
    <tr
      aria-selected={onOpen === undefined ? undefined : selected}
      onClick={(event) => {
        if (onOpen === undefined) return
        const target = event.target as HTMLElement
        if (target.closest("a, button, input, label, select") !== null) return
        onOpen()
      }}
      className={cx(
        "border-b border-line transition-colors last:border-0",
        selected ? "bg-accent-tint" : "hover:bg-hover has-focus-visible:bg-hover",
        onOpen !== undefined && "cursor-pointer",
        className
      )}
    >
      {children}
    </tr>
  )
}

export function Td({ children, align, figure = false, muted = false, className, header = false }: {
  readonly children?: ReactNode
  readonly align?: Align
  /** A number: proportional numerals (`.figure`), right-aligned unless it names the row or `align` says so. */
  readonly figure?: boolean
  readonly muted?: boolean
  /** The cell that names the row (`<th scope="row">`). */
  readonly header?: boolean
  readonly className?: string
}) {
  const Cell = header ? "th" : "td"
  return (
    <Cell
      scope={header ? "row" : undefined}
      className={cx(
        "h-(--row-height) px-3 font-normal first:pl-0 last:pr-0",
        figure && "figure whitespace-nowrap",
        align === "right" || (figure && !header && align === undefined) ? "text-right" : "text-left",
        muted ? "text-ink-3" : figure ? "text-ink" : "text-ink-2",
        header && "text-ink",
        className
      )}
    >
      {children}
    </Cell>
  )
}
