"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui-components/react/checkbox"
import { Check, Minus } from "@insyte/ui/icons"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI says state in standalone attributes — `data-checked`, `data-unchecked`,
 * `data-indeterminate` — where Radix said it in one `data-state`. Same three states, one fewer
 * level of indirection in the selector.
 *
 * `inline-flex` is load-bearing. Base UI renders the root as a `<span>` where Radix rendered a
 * `<button>`, and an inline box ignores width and height: the table's header checkbox, which sits
 * straight in a `<th>`, measured 0x0 and could not be clicked, while the row checkboxes beside it
 * were fine only because their wrapper is a flex container and blockified them.
 */
function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "className"> & { className?: string }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "field peer group/checkbox inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none",
        "hover:field-hover",
        "data-[checked]:bg-abyss data-[checked]:text-mesh-ink data-[checked]:shadow-none",
        "data-[indeterminate]:bg-abyss data-[indeterminate]:text-mesh-ink",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:bg-signal-red-bg",
        className
      )}
      {...props}
    >
      {
        /* Indeterminate says "some of these", which a tick does not: a header box that reads as fully
          checked while a row below it is clear is simply lying about the selection. */
      }
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <Check className="size-3.5 group-data-[indeterminate]/checkbox:hidden" strokeWidth={2.5} />
        <Minus className="hidden size-3.5 group-data-[indeterminate]/checkbox:block" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
