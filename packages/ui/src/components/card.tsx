import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * A card here is a PANEL: paper on the canvas, no border, a shadow that is felt rather than seen.
 *
 * The component kept its name because sixteen screens call it, but what it paints changed. The old
 * one was `rounded-xl border bg-card shadow-sm` — an outlined box, which is the container people
 * reach for when they have not decided how the page is organised, and this product had nine of them
 * stacked on its dashboard.
 *
 * `data-nested` is the part that matters. A panel inside a panel drops its ground and its shadow and
 * keeps only its padding, so the lazy move fails quietly instead of producing the double-framed box.
 * Nothing has to remember the rule; the component enforces it off the DOM.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "panel flex flex-col gap-6 py-6 text-ink",
        "[&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:px-0 [&_[data-slot=card]]:shadow-none",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold text-md text-ink leading-none", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-ink-3 text-sm", className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
