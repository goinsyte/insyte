import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Filled, not outlined. `field` is the tinted well with an inset edge; focus turns the fill to paper
 * so the slot being typed into is the lightest thing on the form, and the outline comes from the
 * document rather than from here.
 *
 * `aria-invalid` tints the well from the signal hue instead of adding a red border, because a border
 * that appears on error is a layout shift as well as a second edge language.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "field rounded-md h-9 w-full min-w-0 px-3 py-1 text-sm outline-none",
        "placeholder:text-ink-3 hover:field-hover focus-visible:bg-paper",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-ink file:text-sm",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:bg-signal-red-bg aria-invalid:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
