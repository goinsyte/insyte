import type { ReactNode } from "react"
import { cx } from "./cx.ts"

/*
 * The frame of a page inside the shell, so fifty pages share one rhythm: the pane that scrolls, one
 * measure, one head. The werkdraad in the main bar already names the record; a page head names the
 * page's job and carries its actions, it does not repeat the werkdraad.
 *
 *   <Page>                     the scrolling pane, centred, the gutters (16px on a phone, 32px wide)
 *     <PageHead title meta actions />
 *     …sections, separated by space and type, not by rules or boxes
 *   </Page>
 *
 * `width`: "wide" for a list (a table wants room), "text" for a record or a form, "full" for a pane
 * that lays out its own columns (an inbox, a chat). A page with two panes of its own uses `Split`.
 */

const WIDTH = {
  text: "max-w-3xl",
  record: "max-w-5xl",
  wide: "max-w-[1240px]",
  full: "max-w-none"
} as const

export type PageWidth = keyof typeof WIDTH

export function Page({ children, width = "wide", className, label }: {
  readonly children: ReactNode
  readonly width?: PageWidth
  readonly className?: string
  /** The page's name for assistive tech, when there is no visible `PageHead` title. */
  readonly label?: string
}) {
  return (
    <div className="pane-scroll flex-1" aria-label={label}>
      <div
        className={cx(
          "mx-auto flex w-full flex-col gap-8 px-4 py-5 sm:gap-10 sm:px-8 sm:py-8",
          WIDTH[width],
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** A page's head: its title (the one `h1`), an optional line under it, and its actions on the right. */
export function PageHead({ title, meta, actions, after, id }: {
  readonly title: ReactNode
  /** One line under the title: a count, when it last changed, what the page is for. */
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  /** Next to the title, in small type: a status, a count. */
  readonly after?: ReactNode
  readonly id?: string
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 id={id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xl font-semibold text-ink">
          <span className="min-w-0 text-balance">{title}</span>
          {after !== undefined && <span className="text-sm font-normal text-ink-3">{after}</span>}
        </h1>
        {meta !== undefined && <p className="text-sm text-pretty text-ink-3">{meta}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A titled part of a page: a small heading in type, then its content. No box, no rule. */
export function PageSection({ title, id, meta, actions, children, className }: {
  readonly title: ReactNode
  readonly id: string
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <section aria-labelledby={id} className={cx("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-md font-semibold text-ink">
          {title}
          {meta !== undefined && <span className="ml-2 text-sm font-normal text-ink-3">{meta}</span>}
        </h2>
        {actions !== undefined && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Two panes that scroll on their own: a list and the record it opened (an inbox, a chat), or a record
 * and its side column. On a phone only one shows: `show` says which.
 */
export function Split({ list, detail, show = "list", listWidth = "22rem" }: {
  readonly list: ReactNode
  readonly detail: ReactNode
  readonly show?: "list" | "detail"
  readonly listWidth?: string
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cx(
          "min-h-0 min-w-0 flex-col bg-panel md:flex md:flex-none",
          show === "list" ? "flex flex-1" : "hidden"
        )}
        style={{ flexBasis: listWidth, maxWidth: "100%" }}
      >
        {list}
      </div>
      <div className={cx("min-h-0 min-w-0 flex-1 flex-col md:flex", show === "detail" ? "flex" : "hidden")}>
        {detail}
      </div>
    </div>
  )
}

/** A side column's part on a record page: a small heading in type over its content, no box. */
export function Side({ id, title, action, children }: {
  readonly id: string
  readonly title: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
