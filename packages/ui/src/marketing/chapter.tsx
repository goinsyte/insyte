import type { ReactNode } from "react"
import { cn } from "../lib/utils.ts"
import { Frame } from "./frame.tsx"

/**
 * A dark band: full-bleed flat abyss with the brand's drafting grid at a few percent and the Drift
 * hatch fading in at the edges, framed by the construction lines in chalk. No black, no glow.
 * `data-ground="dark"` tells the navbar to take chalk while it is over the band.
 */
export function Chapter(
  { id, labelledBy, children, className }: {
    readonly id?: string
    readonly labelledBy: string
    readonly children: ReactNode
    readonly className?: string
  }
) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-ground="dark"
      className={cn("chapter relative isolate overflow-hidden chapter-ground", className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 drafting-chalk" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hatch-chalk [mask-image:linear-gradient(90deg,black,transparent_30%,transparent_70%,black)]"
      />
      <Frame tone="dark" top={false}>{children}</Frame>
    </section>
  )
}

/** A chapter's heading: left-aligned, chalk, one sentence of lede under it. */
export function ChapterHead(
  { id, title, children, className }: {
    readonly id: string
    readonly title: string
    readonly children?: ReactNode
    readonly className?: string
  }
) {
  return (
    <div className={cn("flex max-w-[40rem] flex-col gap-5 py-20 sm:py-28", className)}>
      <h2 id={id} className="font-medium text-4xl text-mesh-ink sm:text-display-sm">
        {title}
      </h2>
      {children === undefined ? null : <p className="max-w-[52ch] text-lg text-mesh-ink-2">{children}</p>}
    </div>
  )
}
