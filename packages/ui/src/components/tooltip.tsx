import { Tooltip as TooltipPrimitive } from "@base-ui-components/react/tooltip"
import { popupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI splits what Radix called `Content` into a positioner and a popup: the first one is told
 * where to sit, the second one is the thing you see. `TooltipContent` keeps its name and its props
 * and renders both, so no call site has to know that.
 */

function TooltipProvider({
  delayDuration = 0,
  skipDelayDuration,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Provider>, "delay" | "timeout"> & {
  /** Radix's spelling for `delay`. */
  delayDuration?: number
  /** Radix's spelling for `timeout`: how long the group stays warm after one closes. */
  skipDelayDuration?: number
}) {
  return (
    <TooltipPrimitive.Provider
      delay={delayDuration}
      {...(skipDelayDuration === undefined ? {} : { timeout: skipDelayDuration })}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  )
}

/*
 * The plate colour, not `foreground`. A tooltip is the smallest dark ground in the product, so it is
 * the same blue-black as the plate rather than a neutral black box — which also means it reads the
 * same in both themes instead of inverting with the ramp.
 */
function TooltipContent({
  className,
  side,
  sideOffset = 6,
  align,
  alignOffset,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Popup>, "className"> & {
  className?: string
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"]
  sideOffset?: number
  align?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["align"]
  alignOffset?: number
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="z-50"
        sideOffset={sideOffset}
        {...(side === undefined ? {} : { side })}
        {...(align === undefined ? {} : { align })}
        {...(alignOffset === undefined ? {} : { alignOffset })}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit max-w-[22rem] text-balance rounded-md bg-abyss px-2.5 py-1.5 text-mesh-ink text-xs leading-snug",
            popupMotion,
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-abyss" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
