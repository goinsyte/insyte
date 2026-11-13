import { BrandPage } from "@insyte/ui/app/settings/depth/brand-screen"
import { Palette } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { depthSections } from "../data/settings-depth.ts"
import { DepthPage } from "../settings/depth-page.tsx"
import { SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Huisstijl (M17 step 20.1b): the sender, colour and logo mails and the chat carry, over
 * `WorkspaceSettings` section `brand`; the logo goes up through `Brand.uploadLogo`. Reading takes Bekijken, changing Bewerken.
 */
export const Route = createFileRoute("/_frame/settings/brand")({
  head: () => ({ meta: [{ title: "Huisstijl · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(depthSections.brand)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, depthSections.brand)))
  },
  pendingComponent: () => <SettingsPending title="Huisstijl" />,
  component: BrandRoute
})

function BrandRoute() {
  return (
    <DepthPage section="brand" title="Huisstijl" icon={Palette} denied="Je rol kan de huisstijl niet zien">
      <BrandPage />
    </DepthPage>
  )
}
