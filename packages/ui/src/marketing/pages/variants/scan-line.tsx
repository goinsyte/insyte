import { cn } from "../../../lib/utils.ts"
import { Layer, type Tone } from "./shared.tsx"

/**
 * The plate's scan: one hairline sweeping down the drafting grid every few seconds, the grid under
 * it lit for a moment as it passes. A single line, no trail of colour.
 */
export function ScanLine({ tone }: { readonly tone: Tone }) {
  const dark = tone === "dark"
  return (
    <Layer>
      <div
        className={cn(
          "absolute inset-0 [mask-image:linear-gradient(180deg,black,transparent_90%)]",
          dark ? "drafting-chalk" : "drafting-ink"
        )}
      />
      <div className="variant-anim variant-scan absolute inset-x-0 top-0 h-px">
        <div className={cn("h-px w-full", dark ? "bg-mesh-ink/45" : "bg-abyss/30")} />
      </div>
    </Layer>
  )
}
