"use client"

import { Separator as SeparatorPrimitive } from "@base-ui-components/react/separator"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * A rule, and the only line this system draws on purpose. It marks a data boundary — between two
 * groups in a menu, between a table's head and its body — never a section edge, which is said with
 * a surface change instead.
 *
 * Base UI's separator is always decorative (`role="separator"` with no semantic value to announce),
 * so the `decorative` prop Radix carried is gone. Nothing passed it anything but its default.
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: Omit<React.ComponentProps<typeof SeparatorPrimitive>, "className"> & { className?: string }) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-hairline",
        "data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
