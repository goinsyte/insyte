import { Accordion as AccordionPrimitive } from "@base-ui-components/react/accordion"
import { ChevronDown } from "@insyte/ui/icons"
import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * Base UI replaces Radix's `type="single" | "multiple"` with one boolean, `multiple`, and its
 * panel measures itself into `--accordion-panel-height` so the open and close are a CSS transition
 * on a real number rather than two keyframes that have to be declared somewhere. The keyframes this
 * file used to name — `animate-accordion-up` / `-down` — were never defined in any stylesheet in
 * the repo, so the accordion had been snapping open since the port. It no longer does.
 */
function Accordion({
  type,
  collapsible,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitive.Root>, "className"> & {
  className?: string
  /** Radix's spelling, kept so the call sites read the same. */
  type?: "single" | "multiple"
  collapsible?: boolean
}) {
  return <AccordionPrimitive.Root data-slot="accordion" multiple={type === "multiple"} {...props} />
}

function AccordionItem({
  className,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitive.Item>, "className"> & { className?: string }) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-hairline border-b last:border-b-0", className)}
      {...props}
    />
  )
}

/* No underline on hover: the row tints, the way every other row in the product does. */
function AccordionTrigger({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitive.Trigger>, "className"> & { className?: string }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 cursor-pointer items-start justify-between gap-4 rounded-md px-2 py-4 text-left font-medium text-ink text-sm outline-none",
          "transition-colors duration-[160ms] hover:bg-ink/4",
          "disabled:pointer-events-none disabled:opacity-45 [&[data-panel-open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-ink-3 transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          strokeWidth={1.75}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitive.Panel>, "className"> & { className?: string }) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "h-[var(--accordion-panel-height)] overflow-hidden text-ink-2 text-sm",
        "transition-[height] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        "data-[ending-style]:h-0 data-[starting-style]:h-0"
      )}
      {...props}
    >
      <div className={cn("px-2 pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
