import { cn } from "../../../lib/utils.ts"
import { Layer, stroke, type Tone } from "./shared.tsx"

/**
 * The drafting grid with a slow band of light travelling across it diagonally: a second, stronger
 * copy of the grid seen only through a moving mask, so the lines brighten as the band passes.
 */
export function GridShimmer({ tone }: { readonly tone: Tone }) {
  const grid = tone === "dark" ? "drafting-chalk" : "drafting-ink"
  const line = stroke(tone, tone === "dark" ? 30 : 22)
  return (
    <Layer>
      <div className={cn("absolute inset-0 opacity-70", grid)} />
      <div
        className="variant-anim variant-shimmer absolute inset-0"
        style={{
          backgroundImage:
            `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 32px)`
        }}
      />
    </Layer>
  )
}
