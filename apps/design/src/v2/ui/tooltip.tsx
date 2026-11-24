import { cloneElement, useId, useRef, useState } from "react"
import type { ReactElement, ReactNode, Ref } from "react"
import { FloatingLayer } from "./floating.tsx"
import type { Placement } from "./floating.tsx"
import { Kbd } from "./kbd.tsx"

/**
 * A name or a short explanation for a control, on hover after a beat and at once on keyboard focus.
 * Never the only place something is said: an icon button still has its `aria-label`, and a tooltip
 * holds no button or link. Ink, like the rail's labels, so it reads as the system talking.
 */
export function TooltipBubble({ children, shortcut }: { readonly children: ReactNode; readonly shortcut?: string }) {
  return (
    <span className="flex max-w-64 items-center gap-2 rounded-sm bg-ink px-2 py-1 text-xs font-medium text-on-ink shadow-pop">
      {children}
      {shortcut !== undefined && (
        <span className="opacity-80">
          <Kbd>{shortcut}</Kbd>
        </span>
      )}
    </span>
  )
}

const DELAY_MS = 450

type Child = ReactElement<{
  ref?: Ref<HTMLElement>
  "aria-describedby"?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
}>

export function Tooltip({ content, shortcut, placement = "top", children }: {
  readonly content: ReactNode
  readonly shortcut?: string
  readonly placement?: Placement
  /** One element that takes a ref (a button, a link). */
  readonly children: Child
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const show = (now: boolean) => {
    window.clearTimeout(timer.current)
    if (now) setOpen(true)
    else timer.current = window.setTimeout(() => setOpen(true), DELAY_MS)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }
  return (
    <>
      {cloneElement(children, {
        ref: anchor,
        "aria-describedby": open ? id : undefined,
        onPointerEnter: () => show(false),
        onPointerLeave: hide,
        onFocus: () => show(true),
        onBlur: hide
      })}
      <FloatingLayer open={open} anchor={anchor} placement={placement} id={id} role="tooltip">
        <TooltipBubble shortcut={shortcut}>{content}</TooltipBubble>
      </FloatingLayer>
    </>
  )
}
