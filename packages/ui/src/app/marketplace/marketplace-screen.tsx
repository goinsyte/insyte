import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { useMarketplaceModalStore } from "../stores/marketplace-modal-store"

// The marketplace is now a near-fullscreen modal. Visiting the /marketplace URL opens that modal over the page it was
// reached from, so closing it lands there again; opened as the first page, it is over /dashboard. The URL stays clean.
export function MarketplaceRedirect() {
  const open = useMarketplaceModalStore((s) => s.openModal)
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  useEffect(() => {
    open()
    if (canGoBack) router.history.back()
    else navigate({ to: "/dashboard", replace: true })
  }, [open, navigate, router, canGoBack])
  return null
}
