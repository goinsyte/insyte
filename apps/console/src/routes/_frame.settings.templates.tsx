import { useAtomValue } from "@effect/atom-react"
import { TemplatesPage } from "@insyte/ui/app/settings/depth/templates-screen"
import { MessageSquareText } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { depthSections, linkUsageAtom } from "../data/settings-depth.ts"
import { DepthPage, valueOf } from "../settings/depth-page.tsx"
import { SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Sjablonen (M17 step 20.1b): the fixed links reply templates fill in, over `WorkspaceSettings`
 * section `links`, with "In N sjablonen" from `Templates.linkUsage`. Reading takes Instellingen · Bekijken, changing Bewerken.
 */
export const Route = createFileRoute("/_frame/settings/templates")({
  head: () => ({ meta: [{ title: "Sjablonen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(depthSections.links)
    context.registry.mount(linkUsageAtom)
    await Effect.runPromise(Effect.all([
      Effect.ignore(AtomRegistry.getResult(context.registry, depthSections.links)),
      Effect.ignore(AtomRegistry.getResult(context.registry, linkUsageAtom))
    ], { concurrency: "unbounded" }))
  },
  pendingComponent: () => <SettingsPending title="Sjablonen" />,
  component: TemplatesRoute
})

function TemplatesRoute() {
  const usage = valueOf(useAtomValue(linkUsageAtom))
  return (
    <DepthPage
      section="links"
      title="Sjablonen"
      icon={MessageSquareText}
      denied="Je rol kan de sjablooninstellingen niet zien"
      usage={usage}
    >
      <TemplatesPage />
    </DepthPage>
  )
}
