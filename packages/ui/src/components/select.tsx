import { Select as SelectPrimitive } from "@base-ui-components/react/select"
import { Check, ChevronDown, ChevronUp } from "@insyte/ui/icons"
import { popupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI's select keeps the value, not the label, so `<Select.Value>` shows "paypal" unless the
 * root is told what the options are. That is what the `items` prop is for, and it is the one change
 * a call site has to make: a record of value to label beside the items it already renders.
 *
 * `position="item-aligned"` is gone with Radix. Base UI positions the popup against the trigger the
 * way every other anchored surface here is positioned, which is also why the motion is the shared
 * one rather than this component's own.
 */

function Select<Value, Multiple extends boolean | undefined = false>(
  props: React.ComponentProps<typeof SelectPrimitive.Root<Value, Multiple>>
) {
  return <SelectPrimitive.Root {...props} />
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  placeholder,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Value>, "className"> & {
  className?: string
  /**
   * Radix's spelling, kept so shadcn markup compiles. Base UI has no placeholder prop: it resolves
   * the label from `items` on `<Select>`, and a `placeholder` here replaces that resolution with a
   * function, so the trigger would read the raw value once something is selected. A select that
   * wants both gives `<Select items>` an entry for the empty value and omits this prop.
   */
  placeholder?: React.ReactNode
}) {
  return (
    <SelectPrimitive.Value data-slot="select-value" {...props}>
      {
        /* No children and no placeholder: Base UI looks the label up in `items`, which is what we
          want. Supplying a function here unconditionally — as this wrapper first did — shadowed
          that lookup and printed `paypal` where the trigger should read `PayPal`. */
      }
      {children
        ?? (placeholder == null
          ? undefined
          : (value: unknown) => (value === null || value === undefined || value === "" ? placeholder : String(value)))}
    </SelectPrimitive.Value>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Trigger>, "className"> & {
  className?: string
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "field flex w-fit cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm outline-none hover:field-hover disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:bg-signal-red-bg data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-3 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDown className="size-4 opacity-50" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align,
  side,
  sideOffset = 4,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Popup>, "className" | "align"> & {
  className?: string
  align?: React.ComponentProps<typeof SelectPrimitive.Positioner>["align"]
  side?: React.ComponentProps<typeof SelectPrimitive.Positioner>["side"]
  sideOffset?: number
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-50"
        /* Base UI's default lays the selected item over the trigger, the way a native <select> on
           macOS does. Every other anchored surface in this product drops below what opened it, and
           one of the two has to give. */
        alignItemWithTrigger={false}
        sideOffset={sideOffset}
        {...(align === undefined ? {} : { align })}
        {...(side === undefined ? {} : { side })}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden panel-raised rounded-lg p-1 text-ink outline-none",
            popupMotion,
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.GroupLabel>, "className"> & { className?: string }) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-ink-3 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Item>, "className"> & { className?: string }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-[highlighted]:bg-ink/6 data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-3 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Separator>, "className"> & { className?: string }) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-hairline", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>, "className"> & { className?: string }) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-pointer items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>, "className"> & { className?: string }) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-pointer items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue
}
