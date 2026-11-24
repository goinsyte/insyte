import { useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import type { TriggerProps } from "./dropdown.tsx"
import { FloatingLayer } from "./floating.tsx"
import type { Placement } from "./floating.tsx"

/**
 * A panel that opens beside its trigger and holds more than a list: the period picker, the
 * notifications, a peek at a record. Not modal: the page stays usable, and a press outside or Escape
 * closes it. For a list of actions use `DropdownMenu`; for a task that must be finished or cancelled,
 * a `Dialog`.
 */
export function PopoverPanel({ children, className, label, width = "w-80" }: {
  readonly children: ReactNode
  readonly className?: string
  readonly label?: string
  readonly width?: string
}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className={cx("animate-rise rounded-lg bg-canvas shadow-pop ring-1 ring-line", width, className)}
    >
      {children}
    </div>
  )
}

export function Popover({ trigger, children, label, placement = "bottom-start", width, className }: {
  readonly trigger: (props: TriggerProps) => ReactNode
  readonly children: ReactNode | ((close: () => void) => ReactNode)
  readonly label: string
  readonly placement?: Placement
  readonly width?: string
  readonly className?: string
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => setOpen(false)
  return (
    <>
      {trigger({
        ref: anchor,
        onClick: () => {
          setOpen(!open)
          if (!open) {
            window.requestAnimationFrame(() =>
              layer.current?.querySelector<HTMLElement>("button, input, select, [tabindex='0']")?.focus()
            )
          }
        },
        onKeyDown: () => undefined,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined
      })}
      <FloatingLayer open={open} onClose={close} anchor={anchor} placement={placement} id={id} layerRef={layer}>
        <PopoverPanel label={label} width={width} className={className}>
          {typeof children === "function" ? children(close) : children}
        </PopoverPanel>
      </FloatingLayer>
    </>
  )
}
