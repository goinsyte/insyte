import type { ReactNode } from "react"
import { cn } from "../lib/utils.ts"

/*
 * The construction frame: the lines that define the page's container, as a drawing defines a part.
 *
 * Two thin dashed vertical rails at the content column's edges, drawn by every section so they run the whole
 * page height in one line; a dashed rule across the full width at each section's top; and a small cross
 * where they meet. Ink tint on paper and glacier, chalk tint on abyss. All of it is decoration, so it
 * is `aria-hidden`, costs no layout and never takes the pointer.
 */

function Cross({ side, tone }: { readonly side: "left" | "right"; readonly tone: "light" | "dark" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "-top-[5px] pointer-events-none absolute size-[11px] max-md:hidden",
        side === "left" ? "-left-[5px]" : "-right-[5px]"
      )}
    >
      <span className={cn("absolute top-[5px] left-0 h-px w-full", tone === "dark" ? "bg-mesh-ink/40" : "bg-ink/30")} />
      <span className={cn("absolute top-0 left-[5px] h-full w-px", tone === "dark" ? "bg-mesh-ink/40" : "bg-ink/30")} />
    </span>
  )
}

export function Frame(
  { children, tone = "light", top = true, className, inner }: {
    readonly children: ReactNode
    readonly tone?: "light" | "dark"
    /** Whether this section opens with the full-width hairline and its two crosses. */
    readonly top?: boolean
    readonly className?: string
    /** Classes for the content column itself. */
    readonly inner?: string
  }
) {
  return (
    <div className={cn("relative", className)}>
      {top
        ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-px",
              tone === "dark" ? "dash-x-chalk" : "dash-x"
            )}
          />
        )
        : null}
      <div
        className={cn(
          "relative mx-auto w-full max-w-[1180px] px-4 sm:px-8",
          tone === "dark" ? "rails" : "rails-ink",
          inner
        )}
      >
        {top
          ? (
            <>
              <Cross side="left" tone={tone} />
              <Cross side="right" tone={tone} />
            </>
          )
          : null}
        {children}
      </div>
    </div>
  )
}
