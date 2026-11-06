import { useAsChild } from "@insyte/ui/lib/render"
import { cn } from "@insyte/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

/*
 * A button in De Blauwdruk is a filled shape or it is nothing.
 *
 * No variant draws a border and none draws its own focus ring: `app.css` puts one 2px `arc` outline
 * on every focusable thing in the document, which is why a button that wanted a different ring used
 * to be the first place the system came apart. `outline` kept its name because fifty call sites use
 * it, but it is now the filled well that `field` describes — the same surface as an input, because
 * on this floor a secondary action and an editable slot have the same standing.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[background-color,box-shadow,color] duration-[160ms] ease-[cubic-bezier(0.25,1,0.5,1)] disabled:pointer-events-none disabled:opacity-45 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The plate colour, carrying the chalk. One button per view earns it.
        default: "bg-abyss text-mesh-ink hover:bg-abyss-2 active:bg-abyss",
        primary: "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2 active:bg-abyss",
        // On a plate the ground is already dark, so the loud button is the light one.
        "primary-mesh": "bg-paper text-abyss hover:bg-mesh-ink active:bg-paper",
        destructive: "bg-signal-red text-paper hover:bg-signal-red/90",
        outline: "field hover:field-hover active:bg-ink/10",
        secondary: "bg-mist text-ink hover:bg-ink/8 active:bg-ink/12",
        ghost: "text-ink hover:bg-ink/6 active:bg-ink/10",
        link: "text-arc underline underline-offset-4 decoration-arc/35 hover:decoration-arc"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  return useAsChild<HTMLButtonElement>({
    asChild,
    children,
    defaultTagName: "button",
    props: {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  })
}

export { Button, buttonVariants }
