import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { cx } from "./cx.ts"
import { AlertTriangle } from "./icons.tsx"

/*
 * What a region shows when it has nothing to show. Empty teaches: it says what will appear here and
 * gives the one action that makes it appear. Error names what failed and how to recover, and keeps
 * the technical detail one fold away. Loading is not here: a loading region draws its own shape in
 * skeletons (`skeleton.tsx`).
 */

export function EmptyState({ glyph: G, title, children, action, size = "md", className }: {
  readonly glyph?: Glyph
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  /** `sm` inside a card or a table; `md` for a whole page or pane. */
  readonly size?: "sm" | "md"
  readonly className?: string
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 text-center",
        size === "sm" ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      {G !== undefined && (
        <span
          className={cx(
            "inline-flex items-center justify-center rounded-full bg-well text-ink-3",
            size === "sm" ? "size-9" : "size-11"
          )}
        >
          <G size={size === "sm" ? 17 : 20} />
        </span>
      )}
      <div className="flex max-w-[44ch] flex-col gap-1">
        <p className={cx("font-semibold text-ink", size === "sm" ? "text-sm" : "text-md")}>{title}</p>
        {children !== undefined && <div className="text-sm text-pretty text-ink-2">{children}</div>}
      </div>
      {action !== undefined && <div className="flex flex-wrap justify-center gap-2 pt-1">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, children, action, detail, size = "md", className }: {
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  /** The technical reason (a status code, a request id), folded away for whoever has to report it. */
  readonly detail?: string
  readonly size?: "sm" | "md"
  readonly className?: string
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col items-center gap-3 text-center",
        size === "sm" ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      <span
        className={cx(
          "inline-flex items-center justify-center rounded-full bg-bad-tint text-bad-ink",
          size === "sm" ? "size-9" : "size-11"
        )}
      >
        <AlertTriangle size={size === "sm" ? 17 : 20} />
      </span>
      <div className="flex max-w-[44ch] flex-col gap-1">
        <p className={cx("font-semibold text-ink", size === "sm" ? "text-sm" : "text-md")}>{title}</p>
        {children !== undefined && <div className="text-sm text-pretty text-ink-2">{children}</div>}
      </div>
      {action !== undefined && <div className="flex flex-wrap justify-center gap-2 pt-1">{action}</div>}
      {detail !== undefined && (
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer rounded-xs hover:text-ink">Technische details</summary>
          <code className="figure mt-1.5 block rounded-sm bg-well px-2 py-1 text-2xs text-ink-2">{detail}</code>
        </details>
      )}
    </div>
  )
}
