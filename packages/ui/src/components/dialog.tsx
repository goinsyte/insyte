"use client"

import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog"
import { Button } from "@insyte/ui/components/button"
import { X } from "@insyte/ui/icons"
import { backdropMotion, centredPopupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI calls Radix's `Content` a `Popup` and Radix's `Overlay` a `Backdrop`, and marks open and
 * closed with `data-open` / `data-closed` plus a first and last frame. Everything exported here
 * keeps the name it had, so the fifty call sites that write `<DialogContent>` keep working; what
 * changed underneath is that the open and close are now one interruptible transition instead of two
 * keyframe animations that needed `tw-animate-css` to exist.
 */

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

function DialogTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <DialogPrimitive.Trigger
        data-slot="dialog-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props}>
      {children}
    </DialogPrimitive.Trigger>
  )
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />
}

function DialogClose({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Close>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <DialogPrimitive.Close
        data-slot="dialog-close"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <DialogPrimitive.Close data-slot="dialog-close" {...props}>
      {children}
    </DialogPrimitive.Close>
  )
}

function DialogOverlay({
  className,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Backdrop>, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/40", backdropMotion, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Popup>, "className"> & {
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 panel-raised rounded-xl p-5 outline-none sm:max-w-lg",
          centredPopupMotion,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
          >
            <X />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 pr-8 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      /* A band of `mist` rather than a rule: the actions sit on their own surface at the foot of the
         dialog, which is how every other separation in the console is drawn. */
      className={cn(
        "-mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 rounded-b-xl bg-mist px-5 py-3 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant="ghost" />}>Close</DialogPrimitive.Close>}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Title>, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-medium text-lg text-ink leading-snug", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Description>, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-base text-ink-2 leading-normal", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}
