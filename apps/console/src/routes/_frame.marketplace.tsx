import { MarketplaceRedirect } from "@insyte/ui/app/marketplace/marketplace-screen"
import { createFileRoute } from "@tanstack/react-router"

/**
 * `/marketplace` (M17 step 3): the Marketplace opens over the page it was reached from (the dashboard, as a first
 * page) and the address stays clean.
 */
export const Route = createFileRoute("/_frame/marketplace")({
  component: MarketplaceRedirect
})
