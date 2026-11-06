import type { IconComponent } from "@insyte/ui/icons"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Nothing here, said with the drawn field rather than with a frame.
 *
 * The old one was bounded by two hairlines, which is a box by another name. This one is the `hatch` —
 * the Drift mark's three offset squares, at the step they offset by — so an empty cell reads as a
 * sheet that has been ruled and not yet drawn on. That is the world's own answer to a blank, and it
 * is the alternative to the centred icon-in-a-circle with a primary button under it.
 *
 * Still left-aligned, still a title and one sentence, still no illustration. The optional icon is a
 * 14px inline marker beside the title, not a 24px badge above it.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: IconComponent
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn("hatch flex flex-col items-start gap-3 rounded-xl bg-ink/[0.02] px-6 py-10", className)}
      {...props}
    >
      <div className="flex items-baseline gap-2.5">
        {Icon ? <Icon className="size-3.5 self-center text-ink-3" strokeWidth={1.75} aria-hidden /> : null}
        <span className="font-medium text-md text-ink">{title}</span>
      </div>
      {description ? <p className="max-w-[58ch] text-sm text-ink-3 leading-[1.55]">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
