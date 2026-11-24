import type { CSSProperties } from "react"
import { cx } from "./cx.ts"

/**
 * The shape of what is coming: a block in the well grey with a slow sweep across it. A loading
 * table draws rows this tall and columns this wide, so the page does not jump when the data lands.
 * Read out once by the region that holds them (`aria-busy`), not per block.
 */
export function Skeleton({ className, style }: { readonly className?: string; readonly style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={{
        backgroundImage: "linear-gradient(90deg, transparent 0%, var(--color-hover) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        ...style
      }}
      className={cx("block animate-shimmer rounded-xs bg-well motion-reduce:animate-none", className)}
    />
  )
}

/** Lines of text still coming: full lines and a shorter last one. */
export function SkeletonText({ lines = 3, className }: { readonly lines?: number; readonly className?: string }) {
  return (
    <span className={cx("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from(
        { length: lines },
        (_, i) => <Skeleton key={i} className="h-3" style={{ width: i === lines - 1 ? "62%" : "100%" }} />
      )}
    </span>
  )
}

/** A list row still coming: the disc, two lines, the trailing figure. */
export function SkeletonRow() {
  return (
    <span className="flex items-center gap-3 py-2.5" aria-hidden="true">
      <Skeleton className="size-7 rounded-full" />
      <span className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-3/5" />
      </span>
      <Skeleton className="h-3 w-12" />
    </span>
  )
}
