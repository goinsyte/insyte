import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field rounded-md field-sizing-content flex min-h-16 w-full px-3 py-2 text-sm outline-none",
        "placeholder:text-ink-3 hover:field-hover focus-visible:bg-paper",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:bg-signal-red-bg",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
