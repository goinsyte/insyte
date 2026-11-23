import type { ReactNode } from "react"

/** A key to press, as the keyboard draws it: in a menu row, the palette's foot, a tooltip. */
export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="figure inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-well px-1 text-2xs text-ink-3 ring-1 ring-line ring-inset">
      {children}
    </kbd>
  )
}
