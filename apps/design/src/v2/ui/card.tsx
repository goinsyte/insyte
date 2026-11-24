import type { ReactNode } from "react"
import { cx } from "./cx.ts"

/** A card: white on a hairline, 12px corners. Never nested in another card; inside, use a well. */
export function Card({ children, className, as: As = "section", ...rest }: {
  readonly children: ReactNode
  readonly className?: string
  readonly as?: "section" | "div" | "article"
  readonly "aria-labelledby"?: string
}) {
  return (
    <As className={cx("rounded-lg bg-canvas ring-1 ring-line", className)} {...rest}>
      {children}
    </As>
  )
}

/** A card's head: the title, an optional count or note after it, an optional line under it, actions right. */
export function CardHead({ id, title, after, sub, actions }: {
  readonly id?: string
  readonly title: ReactNode
  readonly after?: ReactNode
  readonly sub?: ReactNode
  readonly actions?: ReactNode
}) {
  return (
    <header className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id={id} className="flex items-baseline gap-2 text-sm font-semibold text-ink">
          {title}
          {after !== undefined && <span className="text-xs font-normal text-ink-3">{after}</span>}
        </h2>
        {sub !== undefined && <p className="text-xs text-ink-3">{sub}</p>}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
