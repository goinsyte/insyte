import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react"
import { createPortal } from "react-dom"

/**
 * The layer every popover, menu and tooltip floats on: a portal to `<body>`, positioned against its
 * anchor with `position: fixed`, so a pane that scrolls or clips (`overflow: auto`) can never cut it
 * off. It flips above the anchor when there is no room below, stays 8px inside the viewport, follows
 * scrolling and resizing, and carries the anchor's theme (`data-accent`, `data-theme`) with it, so a
 * menu opened inside a themed preview is drawn in that preview's theme.
 */

export type Placement = "bottom-start" | "bottom-end" | "bottom" | "top" | "right" | "left"

const GAP = 6
const EDGE = 8

type Position = { readonly style: CSSProperties; readonly accent?: string; readonly theme?: string }

function place(anchor: DOMRect, panel: DOMRect, placement: Placement): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top: number
  let left: number
  if (placement === "right" || placement === "left") {
    top = anchor.top + anchor.height / 2 - panel.height / 2
    left = placement === "right" ? anchor.right + GAP : anchor.left - panel.width - GAP
    if (left + panel.width > vw - EDGE) left = anchor.left - panel.width - GAP
    if (left < EDGE) left = anchor.right + GAP
  } else {
    const below = anchor.bottom + GAP
    const above = anchor.top - GAP - panel.height
    const wantsTop = placement === "top"
    top = wantsTop
      ? (above < EDGE ? below : above)
      : (below + panel.height > vh - EDGE && above >= EDGE ? above : below)
    left = placement === "bottom-end"
      ? anchor.right - panel.width
      : placement === "bottom-start"
      ? anchor.left
      : anchor.left + anchor.width / 2 - panel.width / 2
  }
  left = Math.min(Math.max(left, EDGE), Math.max(vw - panel.width - EDGE, EDGE))
  top = Math.min(Math.max(top, EDGE), Math.max(vh - panel.height - EDGE, EDGE))
  return { position: "fixed", top: Math.round(top), left: Math.round(left) }
}

/** Positions `panel` against `anchor` while `open`, and keeps it there. */
function useAnchored(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  placement: Placement
): Position {
  const [position, setPosition] = useState<Position>({ style: { position: "fixed", top: 0, left: 0, opacity: 0 } })

  const update = useCallback(() => {
    const a = anchor.current
    const p = panel.current
    if (a === null || p === null) return
    const themed = a.closest<HTMLElement>("[data-accent]")
    const moded = a.closest<HTMLElement>("[data-theme]")
    setPosition({
      style: place(a.getBoundingClientRect(), p.getBoundingClientRect(), placement),
      accent: themed?.dataset["accent"],
      theme: moded?.dataset["theme"]
    })
  }, [anchor, panel, placement])

  useLayoutEffect(() => {
    if (!open) return
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    const observer = new ResizeObserver(update)
    if (panel.current !== null) observer.observe(panel.current)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      observer.disconnect()
    }
  }, [open, update, panel])

  return position
}

/** Closes on a press outside both the anchor and the panel, and on Escape (focus goes back to the anchor). */
function useDismiss(
  open: boolean,
  onClose: () => void,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (anchor.current?.contains(target) === true || panel.current?.contains(target) === true) return
      close.current()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      close.current()
      anchor.current?.focus()
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, anchor, panel])
}

/** The portal itself: the panel at its computed place, in the anchor's theme. */
export function FloatingLayer(
  { open, onClose, anchor, placement = "bottom-start", children, id, role, label, onKeyDown, layerRef }: {
    readonly open: boolean
    /** Without it the layer does not dismiss itself (a tooltip closes on its own pointer events). */
    readonly onClose?: () => void
    readonly anchor: RefObject<HTMLElement | null>
    readonly placement?: Placement
    readonly children: ReactNode
    readonly id?: string
    readonly role?: string
    readonly label?: string
    readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
    /** The layer's element, for a caller that moves focus inside it. */
    readonly layerRef?: RefObject<HTMLDivElement | null>
  }
) {
  const fallback = useRef<HTMLDivElement>(null)
  const own = layerRef ?? fallback
  const position = useAnchored(open, anchor, own, placement)
  useDismiss(open && onClose !== undefined, onClose ?? noop, anchor, own)
  if (!open) return null
  return createPortal(
    <div
      ref={own}
      id={id}
      role={role}
      aria-label={label}
      data-accent={position.accent}
      data-theme={position.theme}
      style={{ ...position.style, zIndex: 60 }}
      onKeyDown={onKeyDown}
      className="text-ink"
    >
      {children}
    </div>,
    document.body
  )
}

const noop = () => undefined
