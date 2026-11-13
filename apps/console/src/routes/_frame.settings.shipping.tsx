import { useAtomValue } from "@effect/atom-react"
import { ShippingPage } from "@insyte/ui/app/settings/depth/shipping-screen"
import { Truck } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { depthSections, statusCountsAtom } from "../data/settings-depth.ts"
import { DepthPage, valueOf } from "../settings/depth-page.tsx"
import { SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Verzending (M17 step 20.1b): what the customer reads per carrier status, over `WorkspaceSettings`
 * section `shipping`, with "Nu" from `Shipping.statusCounts`. Reading takes Instellingen · Bekijken, changing Bewerken.
 */
export const Route = createFileRoute("/_frame/settings/shipping")({
  head: () => ({ meta: [{ title: "Verzending · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(depthSections.shipping)
    context.registry.mount(statusCountsAtom)
    await Effect.runPromise(Effect.all([
      Effect.ignore(AtomRegistry.getResult(context.registry, depthSections.shipping)),
      Effect.ignore(AtomRegistry.getResult(context.registry, statusCountsAtom))
    ], { concurrency: "unbounded" }))
  },
  pendingComponent: () => <SettingsPending title="Verzending" />,
  component: ShippingRoute
})

function ShippingRoute() {
  const counts = valueOf(useAtomValue(statusCountsAtom))
  return (
    <DepthPage
      section="shipping"
      title="Verzending"
      icon={Truck}
      denied="Je rol kan de verzendinstellingen niet zien"
      counts={counts}
    >
      <ShippingPage />
    </DepthPage>
  )
}
