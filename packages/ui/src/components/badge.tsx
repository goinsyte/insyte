import { useAsChild } from "@insyte/ui/lib/render"
import { cn } from "@insyte/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

/*
 * Tonal chips. No borders, and no uppercase: `outline` is still a variant name because call sites
 * use it, but what it paints is the quiet filled chip, because an outlined pill beside a filled one
 * is two ways of saying the same thing.
 *
 * `tabular-nums` because the counts that sit in these — 12 open, 3 overdue — are read down a column.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs tabular-nums outline-none transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-abyss text-mesh-ink [a&]:hover:bg-abyss-2",
        secondary: "bg-mist text-ink-2 [a&]:hover:bg-ink/8",
        destructive: "bg-signal-red-bg text-signal-red [a&]:hover:bg-signal-red-bg/70",
        outline: "bg-ink/6 text-ink-2 [a&]:hover:bg-ink/10",
        ghost: "text-ink-3 [a&]:hover:bg-ink/6 [a&]:hover:text-ink",
        link: "text-arc underline-offset-4 [a&]:hover:underline"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  return useAsChild<HTMLSpanElement>({
    asChild,
    children,
    defaultTagName: "span",
    props: {
      "data-slot": "badge",
      "data-variant": variant,
      className: cn(badgeVariants({ variant }), className),
      ...props
    }
  })
}

export { Badge, badgeVariants }
