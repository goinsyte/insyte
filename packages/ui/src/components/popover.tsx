"use client"

import { Popover as PopoverPrimitive } from "@base-ui-components/react/popover"
import { popupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof PopoverPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <PopoverPrimitive.Trigger
        data-slot="popover-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  )
}

function PopoverContent({
  className,
  align = "center",
  side,
  sideOffset = 4,
  alignOffset,
  children,
  ...props
}: Omit<React.ComponentProps<typeof PopoverPrimitive.Popup>, "className" | "align"> & {
  className?: string
  align?: React.ComponentProps<typeof PopoverPrimitive.Positioner>["align"]
  side?: React.ComponentProps<typeof PopoverPrimitive.Positioner>["side"]
  sideOffset?: number
  alignOffset?: number
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="z-50"
        align={align}
        sideOffset={sideOffset}
        {...(side === undefined ? {} : { side })}
        {...(alignOffset === undefined ? {} : { alignOffset })}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn("w-72 panel-raised rounded-xl p-4 text-ink outline-hidden", popupMotion, className)}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

/*
 * Radix's `Anchor` let a popover sit against an element that was not its trigger. Base UI says the
 * same thing with an `anchor` prop on the positioner, so there is nothing to render; the component
 * stays as a passthrough because two call sites import it.
 */
function PopoverAnchor({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("flex flex-col gap-1 text-sm", className)} {...props} />
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="popover-description" className={cn("text-ink-3", className)} {...props} />
}

export { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
