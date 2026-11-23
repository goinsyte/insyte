import type { ReactNode } from "react"
import { Toaster } from "../ui/toast.tsx"

/**
 * The frame of the screens that stand outside the product: signing in, setting up, an invitation,
 * and the pages a customer or a supplier reaches by a link (the return portal, a quality check). No
 * rail, no menu, no werkdraad: one canvas that scrolls, and the toasts. The screen draws the rest.
 */
export function BareLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <main id="main" className="flex min-h-0 flex-1 flex-col">{children}</main>
      <Toaster />
    </div>
  )
}
