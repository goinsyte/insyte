import { Dialog as SheetPrimitive } from "@base-ui-components/react/dialog"
import { X } from "@insyte/ui/icons"
import { backdropMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * A sheet is a dialog that enters from an edge. Under Base UI that is one transition on `translate`
 * between the first frame and the resting frame, which is why the four sides below each name one
 * off-screen offset instead of one of `tw-animate-css`'s eight slide keyframes. It also fixes the
 * close, which used to run a 300ms keyframe against a 150ms transition on the same element.
 */

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />
}

function SheetTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <SheetPrimitive.Trigger
        data-slot="sheet-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props}>
      {children}
    </SheetPrimitive.Trigger>
  )
}

function SheetClose({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Close>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <SheetPrimitive.Close
        data-slot="sheet-close"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <SheetPrimitive.Close data-slot="sheet-close" {...props}>
      {children}
    </SheetPrimitive.Close>
  )
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal {...props} />
}

function SheetOverlay({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Backdrop>, "className"> & { className?: string }) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", backdropMotion, className)}
      {...props}
    />
  )
}

const EDGE = {
  right:
    "inset-y-0 right-0 h-full w-3/4 sm:max-w-sm data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left:
    "inset-y-0 left-0 h-full w-3/4 sm:max-w-sm data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  top: "inset-x-0 top-0 h-auto data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
  bottom: "inset-x-0 bottom-0 h-auto data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full"
} as const

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Popup>, "className"> & {
  className?: string
  side?: keyof typeof EDGE
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 panel-raised outline-none",
          "transition-[translate,opacity] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          EDGE[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 cursor-pointer rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Title>, "className"> & { className?: string }) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("font-semibold text-ink", className)} {...props} />
}

function SheetDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Description>, "className"> & { className?: string }) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-ink-3 text-sm", className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
