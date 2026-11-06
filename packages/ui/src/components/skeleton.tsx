import { cn } from "@insyte/ui/lib/utils"

/*
 * Placeholder. Achromatic on purpose — the shadcn default resolves to `arc-tint` here, which reads
 * as the AI surface glowing rather than as content not having arrived. It breathes between two steps
 * of the ink ramp instead of pulsing to transparent, so a column of them does not flicker.
 *
 * `prefers-reduced-motion` stops it in `app.css`, where every animation in the product is clamped.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-ink/8 [animation-duration:1.6s]", className)}
      {...props}
    />
  )
}

export { Skeleton }
