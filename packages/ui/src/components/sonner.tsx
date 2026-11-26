import { AlertTriangle, CheckCircle2, InfoIcon, Loader, OctagonXIcon } from "@insyte/ui/icons"
import { useTheme } from "next-themes"
import { useCallback, useRef } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * What is pinned to the foot of the window: a reply composer, the unsaved bar, a selection's toolbar. A toast sits
 * above all of them rather than over the field someone is typing in, and drops back to the foot once they are gone.
 * `--toast-clearance` is how far the highest of them reaches up from the bottom edge; the Toaster adds it to its own
 * offset. Capped at half the window, so a tall field never sends the toasts to the top.
 */
const bars = new Set<HTMLElement>()
let frame = 0
let resized: ResizeObserver | null = null

/** How far above the window's bottom edge toasts must sit to clear these boxes, in whole pixels. */
export function toastClearance(
  boxes: Iterable<{ readonly top: number; readonly bottom: number; readonly height: number }>,
  windowHeight: number
): number {
  let reach = 0
  for (const r of boxes) {
    // Hidden (no box) or scrolled out of the window: nothing to keep clear.
    if (r.height === 0 || r.bottom <= 0 || r.top >= windowHeight) continue
    reach = Math.max(reach, windowHeight - r.top)
  }
  return Math.round(Math.min(reach, windowHeight / 2))
}

let current = -1

function measure() {
  frame = 0
  const px = toastClearance([...bars].map((el) => el.getBoundingClientRect()), window.innerHeight)
  // A scroll measures every frame; the page's style is only touched when the answer moves.
  if (px === current) return
  current = px
  document.documentElement.style.setProperty("--toast-clearance", `${px}px`)
}

const schedule = () => {
  if (frame === 0) frame = requestAnimationFrame(measure)
}

/**
 * A ref for a bar at the foot of the window that toasts must not cover. It is measured as it comes, as it changes
 * size, as a scroll or the window moves it, and once more after its entrance has played: an entrance slides it in by
 * a transform, which moves the box it is measured by but fires none of those.
 */
export function useToastClearance<T extends HTMLElement>(): (el: T | null) => void {
  // The element it holds clear: a callback ref is called with `null` when it goes, also through motion's ref.
  const held = useRef<(() => void) | null>(null)
  return useCallback((el: T | null) => {
    held.current?.()
    held.current = el === null ? null : hold(el)
  }, [])
}

function hold(el: HTMLElement): () => void {
  if (bars.size === 0) {
    resized = new ResizeObserver(schedule)
    window.addEventListener("resize", schedule)
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
  }
  bars.add(el)
  resized?.observe(el)
  schedule()
  const settled = window.setTimeout(schedule, 450)
  return () => {
    window.clearTimeout(settled)
    bars.delete(el)
    resized?.unobserve(el)
    if (bars.size === 0) {
      resized?.disconnect()
      resized = null
      window.removeEventListener("resize", schedule)
      document.removeEventListener("scroll", schedule, { capture: true })
    }
    schedule()
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      /* `ToasterProps["theme"]` is an OPTIONAL prop, so under `exactOptionalPropertyTypes` that
         indexed type carries `undefined` and the cast put it straight back after the default
         above had removed it. The non-nullable form says what the destructuring already did. */
      theme={theme as NonNullable<ToasterProps["theme"]>}
      className="toaster group"
      /* Sonner's own 24px (16px on a phone), above whatever is pinned to the foot (`useToastClearance`). */
      offset={{ bottom: "calc(24px + var(--toast-clearance, 0px))" }}
      mobileOffset={{ bottom: "calc(16px + var(--toast-clearance, 0px))" }}
      /* Bottom centre, not the bottom-right corner: that corner is where the plate keeps its File
         button, and a toast saying "filed" sat on top of the button that filed it. The action is the
         brand's primary button, because Undo is the one thing in a toast worth pressing. */
      toastOptions={{
        classNames: {
          actionButton: "!bg-abyss !text-mesh-ink !rounded-md !font-medium !h-7 !px-2.5 hover:!bg-abyss-2",
          description: "!text-ink-2"
        }
      }}
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader className="size-4 animate-spin" />
      }}
      style={{
        "--normal-bg": "var(--paper)",
        "--normal-text": "var(--ink)",
        // A toast is a raised panel, so its edge is the shadow and not a line.
        "--normal-border": "transparent",
        "--border-radius": "var(--radius-lg)",
        "--success-bg": "var(--signal-green-bg)",
        "--success-text": "var(--signal-green)",
        "--success-border": "transparent",
        "--warning-bg": "var(--signal-amber-bg)",
        "--warning-text": "var(--signal-amber)",
        "--warning-border": "transparent",
        "--error-bg": "var(--signal-red-bg)",
        "--error-text": "var(--signal-red)",
        "--error-border": "transparent"
      } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
