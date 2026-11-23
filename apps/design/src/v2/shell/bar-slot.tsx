import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * A screen's own actions in the main bar, left of Nieuw and Zoeken. The werkdraad already names the
 * thing you work on, so a screen does not repeat it in a header row of its own just to hang its
 * actions on (the chat: history, share, more). The shell owns the slot; a screen portals into it.
 */
export const BarSlot = createContext<HTMLElement | null>(null)

export function BarActions({ children }: { readonly children: ReactNode }) {
  const slot = useContext(BarSlot)
  return slot === null ? null : createPortal(children, slot)
}
