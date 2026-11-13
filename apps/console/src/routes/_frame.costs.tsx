import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { CostsList } from "@insyte/modules/costs/domain/Costs"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import { CostsPage } from "@insyte/ui/app/costs/costs-screen"
import { CostsSourceProvider } from "@insyte/ui/app/costs/costs-source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleCostsSource } from "../costs/costs-source.ts"
import { costsAtom } from "../data/costs.ts"

/**
 * Kosten (step 15.5, M13 step 5): the reference's costs table over `Costs.list`, in the frame. The loader reads the
 * five months up to the current one on the server; until they are in, the reference's table skeleton stands in. A role
 * without Analyse · Bekijken is told so; a read that failed says so and offers to try again.
 */
export const Route = createFileRoute("/_frame/costs")({
  head: () => ({ meta: [{ title: "Kosten · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(costsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, costsAtom)))
  },
  pendingComponent: Pending,
  component: CostsRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Kosten" />
}

const isForbidden = Schema.is(Forbidden)

function CostsRoute() {
  const result = useAtomValue(costsAtom)
  const refresh = useAtomRefresh(costsAtom)
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    const refused = result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
      return (
        <DeniedPanel
          title="Je rol kan de kosten niet zien"
          denial={{
            perm: refused.error.permission as Permission,
            arg: refused.error.level as Level,
            roleLabel: refused.error.roleLabel,
            grantingRoles: [],
            granters: [],
            request: { state: "none" },
            action: "Costs.list"
          }}
        />
      )
    }
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Kosten" crumbs={[{ label: "Analyse", to: "/analytics" }]} />
        <div role="alert" className="flex flex-col items-start gap-3 px-5">
          <p className="text-base text-ink-2">De kosten konden niet worden geladen.</p>
          <button
            type="button"
            onClick={refresh}
            className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: CostsList }) {
  const source = useConsoleCostsSource(list)
  return (
    <CostsSourceProvider value={source}>
      <CostsPage />
    </CostsSourceProvider>
  )
}
