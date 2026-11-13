import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useMarketplaceModalStore } from "../stores/marketplace-modal-store"

// The marketplace is now a near-fullscreen modal. Visiting the /marketplace
// URL opens that modal and bounces back to /dashboard so the URL stays clean.
export function MarketplaceRedirect() {
  const open = useMarketplaceModalStore((s) => s.openModal)
  const navigate = useNavigate()
  useEffect(() => {
    open()
    navigate({ to: "/dashboard", replace: true })
  }, [open, navigate])
  return null
}
