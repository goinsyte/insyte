import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * A plain `<label>`.
 *
 * Base UI has no label primitive, and does not need one: what Radix's `Label` added over the
 * element was a mousedown guard so that double-clicking the text selects nothing, which is four
 * lines and belongs here rather than behind a dependency.
 */
function Label({ className, onMouseDown, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the caller's, via htmlFor or nesting
    <label
      data-slot="label"
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if (!event.defaultPrevented && event.detail > 1) {
          event.preventDefault()
        }
      }}
      className={cn(
        "flex select-none items-center gap-2 font-medium text-ink-2 text-sm leading-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-45",
        className
      )}
      {...props}
    />
  )
}

export { Label }
