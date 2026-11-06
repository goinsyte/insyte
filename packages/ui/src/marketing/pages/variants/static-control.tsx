import { cn } from "../../../lib/utils.ts"
import { Layer, type Tone } from "./shared.tsx"

/** The control: the drafting grid and the Drift hatch, still — what the live pages draw today. */
export function StaticControl({ tone }: { readonly tone: Tone }) {
  return (
    <Layer>
      <div
        className={cn(
          "absolute inset-0 [mask-image:linear-gradient(180deg,black,transparent_85%)]",
          tone === "dark" ? "drafting-chalk" : "drafting-ink"
        )}
      />
      {tone === "dark"
        ? (
          <div className="absolute inset-0 hatch-chalk [mask-image:radial-gradient(60%_70%_at_100%_0%,black,transparent_75%)]" />
        )
        : null}
    </Layer>
  )
}
