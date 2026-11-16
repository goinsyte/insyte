import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ChannelAgentView } from "@insyte/modules/channel-agent/domain/ChannelAgent"
import { CustomerAgentPage } from "@insyte/ui/app/ai/customer-agent-screen"
import { CustomerAgentSourceProvider } from "@insyte/ui/app/ai/customer-agent-source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { MessageCircle } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleCustomerAgentSource } from "../agent/customer-agent-source.ts"
import { agentDayAtom, channelAgentAtom } from "../data/agent.ts"

/**
 * Instellingen → Insyte AI → Klantagent (M15 step 8): the reference's page over `ChannelAgent.get`, in the settings
 * sheet. Read with Instellingen · Bekijken, saved with Beheren and `ai.autonomy`; the loader reads the settings and the
 * day on the server. A read that failed says so and offers to try again.
 */
export const Route = createFileRoute("/_frame/settings/ai/customer-agent")({
  head: () => ({ meta: [{ title: "Klantagent · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(channelAgentAtom)
    context.registry.mount(agentDayAtom)
    await Effect.runPromise(
      Effect.ignore(
        Effect.all([
          AtomRegistry.getResult(context.registry, channelAgentAtom),
          AtomRegistry.getResult(context.registry, agentDayAtom)
        ], { concurrency: "unbounded" })
      )
    )
  },
  pendingComponent: Pending,
  component: CustomerAgentRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Klantagent" />
    </div>
  )
}

function CustomerAgentRoute() {
  const result = useAtomValue(channelAgentAtom)
  const refresh = useAtomRefresh(channelAgentAtom)
  const view = Option.getOrUndefined(AsyncResult.value(result))
  if (view !== undefined) return <Loaded view={view} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Klantagent" icon={MessageCircle}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">De klantagent kon niet worden geladen.</p>
            <button
              type="button"
              onClick={refresh}
              className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
            >
              Opnieuw proberen
            </button>
          </div>
        </SettingsSheet>
      </div>
    )
  }
  return <Pending />
}

function Loaded({ view }: { view: ChannelAgentView }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <CustomerAgentSourceProvider value={useConsoleCustomerAgentSource(view)}>
        <SettingsSheet title="Klantagent" icon={MessageCircle}>
          <CustomerAgentPage />
        </SettingsSheet>
      </CustomerAgentSourceProvider>
    </div>
  )
}
