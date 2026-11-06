import { AlertDialog as AlertDialogPrimitive } from "@base-ui-components/react/alert-dialog"
import { Button } from "@insyte/ui/components/button"
import { backdropMotion, centredPopupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI's alert dialog is the dialog with its dismissals removed: no outside press, no escape.
 * There is no `Action` or `Cancel` part, because both are a `Close` with a different button on it —
 * which is all they ever were, and is what the two below render.
 */

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root {...props} />
}

function AlertDialogTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <AlertDialogPrimitive.Trigger
        data-slot="alert-dialog-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props}>
      {children}
    </AlertDialogPrimitive.Trigger>
  )
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Backdrop>, "className"> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", backdropMotion, className)}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Popup>, "className"> & {
  className?: string
  size?: "default" | "sm"
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content -translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 panel-raised rounded-xl p-6 outline-none data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg",
          centredPopupMotion,
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "-mx-6 -mb-6 mt-1 flex flex-col-reverse gap-2 rounded-b-xl bg-mist px-6 py-3 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Title>, "className"> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-medium text-lg text-ink leading-snug sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Description>, "className"> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-base text-ink-2 leading-normal", className)}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-ink/8 sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}:
  & Omit<React.ComponentProps<typeof AlertDialogPrimitive.Close>, "className">
  & { className?: string }
  & Pick<React.ComponentProps<typeof Button>, "variant" | "size">)
{
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      render={<Button variant={variant} size={size} />}
      className={cn(className)}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Close>
  )
}

function AlertDialogCancel({
  className,
  variant = "ghost",
  size = "default",
  children,
  ...props
}:
  & Omit<React.ComponentProps<typeof AlertDialogPrimitive.Close>, "className">
  & { className?: string }
  & Pick<React.ComponentProps<typeof Button>, "variant" | "size">)
{
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} size={size} />}
      className={cn(className)}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Close>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger
}
