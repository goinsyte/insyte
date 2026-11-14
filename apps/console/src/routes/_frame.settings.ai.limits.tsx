import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { AiBudgets } from "@insyte/modules/agent/domain/Autonomy"
import { LimitsPage } from "@insyte/ui/app/ai/limits-screen"
import { LimitsSourceProvider } from "@insyte/ui/app/ai/limits-source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Wallet } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleLimitsSource } from "../agent/limits-source.ts"
import { budgetsAtom } from "../data/agent.ts"

/**
 * Instellingen → Insyte AI → Limieten (M15 step 6): the reference's page over `AiBudget.get`, in the settings sheet.
 * Read by the whole team, changed with `ai.autonomy`; the loader reads the month's budgets on the server. A read that
 * failed says so and offers to try again.
 */
export const Route = createFileRoute("/_frame/settings/ai/limits")({
  head: () => ({ meta: [{ title: "Limieten · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(budgetsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, budgetsAtom)))
  },
  pendingComponent: Pending,
  component: LimitsRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Limieten" />
    </div>
  )
}

function LimitsRoute() {
  const result = useAtomValue(budgetsAtom)
  const refresh = useAtomRefresh(budgetsAtom)
  const budgets = Option.getOrUndefined(AsyncResult.value(result))
  if (budgets !== undefined) return <Loaded budgets={budgets} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Limieten" icon={Wallet}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">De AI-limieten konden niet worden geladen.</p>
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

function Loaded({ budgets }: { budgets: AiBudgets }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <LimitsSourceProvider value={useConsoleLimitsSource(budgets)}>
        <SettingsSheet title="Limieten" icon={Wallet}>
          <LimitsPage />
        </SettingsSheet>
      </LimitsSourceProvider>
    </div>
  )
}
