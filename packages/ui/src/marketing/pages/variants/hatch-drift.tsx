import { cn } from "../../../lib/utils.ts"
import { Layer, type Tone } from "./shared.tsx"

/** The Drift hatch — the mark's three offset squares as a pattern — drifting slowly on a diagonal. */
export function HatchDrift({ tone }: { readonly tone: Tone }) {
  return (
    <Layer>
      <div
        style={{ filter: tone === "dark" ? "brightness(2.2)" : "contrast(2)" }}
        className={cn(
          "variant-anim variant-drift absolute -inset-12 [mask-image:radial-gradient(70%_70%_at_50%_45%,transparent_20%,black_80%)]",
          tone === "dark" ? "hatch-chalk" : "hatch-ink"
        )}
      />
    </Layer>
  )
}
