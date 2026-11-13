import { MarketplaceRedirect } from "@insyte/ui/app/marketplace/marketplace-screen"
import { createFileRoute } from "@tanstack/react-router"

/** `/marketplace` (M17 step 3): as in the reference, the Marketplace opens over the dashboard and the address stays clean. */
export const Route = createFileRoute("/_frame/marketplace")({
  component: MarketplaceRedirect
})
