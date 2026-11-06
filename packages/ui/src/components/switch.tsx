"use client"

import { Switch as SwitchPrimitive } from "@base-ui-components/react/switch"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Off is the filled well; on is the plate colour. No border on either, and the thumb is paper in
 * both themes rather than flipping to the foreground, so the travel is the only thing that changes.
 */
function Switch({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "className"> & {
  className?: string
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none",
        "transition-colors duration-[160ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        "data-[size=default]:h-[1.15rem] data-[size=sm]:h-3.5 data-[size=default]:w-8 data-[size=sm]:w-6",
        "data-[unchecked]:bg-ink/14 data-[checked]:bg-abyss",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block translate-x-0 rounded-full bg-paper",
          "shadow-[0_1px_2px_color-mix(in_oklch,black_20%,transparent)]",
          "transition-transform duration-[160ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
          "data-[checked]:translate-x-[calc(100%-2px)]",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
