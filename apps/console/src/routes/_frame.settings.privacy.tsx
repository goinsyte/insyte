import { PrivacyPage } from "@insyte/ui/app/settings/depth/privacy-screen"
import { ShieldCheck } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { depthSections } from "../data/settings-depth.ts"
import { DepthPage } from "../settings/depth-page.tsx"
import { SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Gegevens en privacy (M17 step 20.1b): how long each kind of data is kept, over `WorkspaceSettings`
 * section `retention`, the dry run (`Retention.count`) and the nightly erase switch (`Retention.setErasing`). Reading
 * takes Instellingen · Bekijken; the periods and switching the erase on take Beheren.
 */
export const Route = createFileRoute("/_frame/settings/privacy")({
  head: () => ({ meta: [{ title: "Gegevens en privacy · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(depthSections.retention)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, depthSections.retention)))
  },
  pendingComponent: () => <SettingsPending title="Gegevens en privacy" />,
  component: PrivacyRoute
})

function PrivacyRoute() {
  return (
    <DepthPage
      section="retention"
      title="Gegevens en privacy"
      icon={ShieldCheck}
      denied="Je rol kan de bewaartermijnen niet zien"
      level={3}
    >
      <PrivacyPage />
    </DepthPage>
  )
}
