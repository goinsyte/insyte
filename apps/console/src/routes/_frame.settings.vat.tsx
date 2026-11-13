import { VatPage } from "@insyte/ui/app/settings/depth/vat-screen"
import { Receipt } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { depthSections } from "../data/settings-depth.ts"
import { DepthPage } from "../settings/depth-page.tsx"
import { SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Btw (M17 step 20.1b): per store how amounts are shown and refunded, and OSS, over
 * `WorkspaceSettings` section `vat`. Reading takes Instellingen · Bekijken, changing Bewerken.
 */
export const Route = createFileRoute("/_frame/settings/vat")({
  head: () => ({ meta: [{ title: "Btw · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(depthSections.vat)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, depthSections.vat)))
  },
  pendingComponent: () => <SettingsPending title="Btw" />,
  component: VatRoute
})

function VatRoute() {
  return (
    <DepthPage section="vat" title="Btw" icon={Receipt} denied="Je rol kan de btw-instellingen niet zien">
      <VatPage />
    </DepthPage>
  )
}
