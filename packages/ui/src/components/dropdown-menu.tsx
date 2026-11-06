"use client"

import { Menu as MenuPrimitive } from "@base-ui-components/react/menu"
import { Check, ChevronRight, Circle } from "@insyte/ui/icons"
import { popupMotion } from "@insyte/ui/lib/popup"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI has one `Menu`; a dropdown menu is that menu with a button trigger. The names below are
 * the shadcn ones because a hundred call sites write them, and the parts they stand for changed:
 * `Content` is now a portal, a positioner and a popup; the highlighted row is `data-highlighted`
 * rather than `:focus`, because Base UI leaves DOM focus on the trigger and moves a marker instead;
 * and `Label` is `GroupLabel`, which is what it always was.
 *
 * The 36px row and the 14px type are this product's, not shadcn's: a menu is read down, in a hurry,
 * beside a table whose rows are the same height.
 */

const ITEM = [
  "relative flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm text-base outline-none",
  "data-[highlighted]:bg-ink/6 data-[highlighted]:text-ink",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-ink-3 [&_svg]:pointer-events-none [&_svg]:shrink-0"
].join(" ")

function DropdownMenu({ ...props }: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props} />
}

function DropdownMenuPortal({ ...props }: React.ComponentProps<typeof MenuPrimitive.Portal>) {
  return <MenuPrimitive.Portal {...props} />
}

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.Trigger>, "className"> & {
  className?: string
  asChild?: boolean
}) {
  if (asChild === true) {
    return (
      <MenuPrimitive.Trigger
        data-slot="dropdown-menu-trigger"
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props}>
      {children}
    </MenuPrimitive.Trigger>
  )
}

function DropdownMenuContent({
  className,
  align,
  side,
  sideOffset = 4,
  alignOffset,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.Popup>, "className" | "align"> & {
  className?: string
  align?: React.ComponentProps<typeof MenuPrimitive.Positioner>["align"]
  side?: React.ComponentProps<typeof MenuPrimitive.Positioner>["side"]
  sideOffset?: number
  alignOffset?: number
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50"
        sideOffset={sideOffset}
        {...(align === undefined ? {} : { align })}
        {...(side === undefined ? {} : { side })}
        {...(alignOffset === undefined ? {} : { alignOffset })}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-(--available-height) min-w-[9rem] overflow-y-auto overflow-x-hidden panel-raised rounded-lg p-1 text-ink outline-none",
            popupMotion,
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.Item>, "className"> & {
  className?: string
  inset?: boolean
  variant?: "default" | "destructive"
  /** A row that is a link: the anchor is rendered in the item's place, not inside it. */
  asChild?: boolean
}) {
  const itemClassName = cn(
    ITEM,
    "px-2 data-[inset]:pl-7",
    "data-[variant=destructive]:text-signal-red data-[variant=destructive]:data-[highlighted]:bg-signal-red-bg data-[variant=destructive]:data-[highlighted]:text-signal-red data-[variant=destructive]:*:[svg]:text-signal-red!",
    className
  )
  if (asChild === true) {
    return (
      <MenuPrimitive.Item
        data-slot="dropdown-menu-item"
        data-inset={inset}
        data-variant={variant}
        className={itemClassName}
        nativeButton={false}
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={itemClassName}
      {...props}
    >
      {children}
    </MenuPrimitive.Item>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.CheckboxItem>, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(ITEM, "pr-2 pl-7", className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-1.5 flex size-3.5 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <Check className="size-3.5" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: React.ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.RadioItem>, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(ITEM, "pr-2 pl-7", className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-1.5 flex size-3.5 items-center justify-center">
        <MenuPrimitive.RadioItemIndicator>
          <Circle className="size-2 fill-current" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

/*
 * A plain `<div>`, not `Menu.GroupLabel`.
 *
 * Base UI's group label reads a context and throws outside `<Menu.Group>`, and almost every menu in
 * this product heads a flat list with one word — "Templates", "Account" — without a group around
 * it. A heading that crashes the page when it is not wrapped is not the right part for that, and
 * Radix's `Label` was a `<div>` with an id anyway. Where a menu does group its items, the group is
 * labelled by `Menu.Group`'s own `aria-label`.
 */
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      role="presentation"
      className={cn("px-2 pt-1.5 pb-1 font-medium text-2xs text-ink-3 data-[inset]:pl-7", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.Separator>, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-ink/8", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-ink-3 text-xs tracking-widest", className)}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>) {
  return <MenuPrimitive.SubmenuRoot {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger>, "className"> & {
  className?: string
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(ITEM, "px-2 data-[inset]:pl-7 data-[popup-open]:bg-ink/6 data-[popup-open]:text-ink", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.Popup>, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="z-50" sideOffset={2}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(
            "min-w-[8rem] overflow-hidden panel-raised rounded-lg p-1 text-ink outline-none",
            popupMotion,
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
}
