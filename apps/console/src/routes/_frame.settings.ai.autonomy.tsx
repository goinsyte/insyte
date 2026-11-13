import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { AiBudgets, AutonomyPolicy } from "@insyte/modules/agent/domain/Autonomy"
import { AutonomyPage, type AutonomySearch } from "@insyte/ui/app/ai/autonomy-screen"
import { AutonomySourceProvider } from "@insyte/ui/app/ai/autonomy-source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Shield } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleAutonomySource } from "../agent/autonomy-source.ts"
import { autonomyAtom, budgetsAtom } from "../data/agent.ts"

/**
 * Instellingen → Insyte AI → Zelfstandigheid (M15 step 6): the reference's page over `Autonomy.get`, in the settings
 * sheet. Read by the whole team, changed with `ai.autonomy`; the loader reads the rules and the month's budget on the
 * server. A read that failed says so and offers to try again.
 */
export const Route = createFileRoute("/_frame/settings/ai/autonomy")({
  validateSearch: (s: Record<string, unknown>): AutonomySearch => (typeof s["actie"] === "string"
    ? { actie: s["actie"] }
    : {}),
  head: () => ({ meta: [{ title: "Zelfstandigheid · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(autonomyAtom)
    context.registry.mount(budgetsAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, autonomyAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, budgetsAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: AutonomyRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Zelfstandigheid" />
    </div>
  )
}

function AutonomyRoute() {
  const result = useAtomValue(autonomyAtom)
  const refresh = useAtomRefresh(autonomyAtom)
  const budgets = Option.getOrUndefined(AsyncResult.value(useAtomValue(budgetsAtom)))
  const policy = Option.getOrUndefined(AsyncResult.value(result))
  if (policy !== undefined) return <Loaded policy={policy} budgets={budgets} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Zelfstandigheid" icon={Shield}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">De regels voor Insyte konden niet worden geladen.</p>
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

function Loaded({ policy, budgets }: { policy: AutonomyPolicy; budgets: AiBudgets | undefined }) {
  const source = useConsoleAutonomySource(policy, budgets)
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <AutonomySourceProvider value={source}>
        <SettingsSheet title="Zelfstandigheid" icon={Shield}>
          <AutonomyPage />
        </SettingsSheet>
      </AutonomySourceProvider>
    </div>
  )
}
