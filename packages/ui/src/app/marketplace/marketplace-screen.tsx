import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { useMarketplaceModalStore } from "../stores/marketplace-modal-store"

// The marketplace is now a near-fullscreen modal. Visiting the /marketplace URL opens that modal over the page it was
// reached from, so closing it lands there again; opened as the first page, it is over /dashboard. The URL stays clean.
export function MarketplaceRedirect() {
  const open = useMarketplaceModalStore((s) => s.openModal)
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  // Once: StrictMode runs the effect twice, and a second back() would leave the page the member came from too.
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    open()
    // Reached by a link inside the app: back to that page, with the modal open over it.
    // Opened as the first page: /dashboard takes its place in history, so back leaves the app as it came.
    if (canGoBack) router.history.back()
    else navigate({ to: "/dashboard", replace: true })
  }, [open, navigate, router, canGoBack])
  return null
}
