import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ReturnList, ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ReturnsList } from "@insyte/ui/app/returns/returns-screen"
import { ReturnsListSourceProvider } from "@insyte/ui/app/returns/source"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { returnsAtom, returnSettingsAtom } from "../data/returns.ts"
import { storesAtom } from "../data/stores.ts"
import { useConsoleReturnsListSource } from "../returns/returns-source.tsx"

/**
 * Retouren (step 11.2, M9.1): the reference's queue over `Returns.list`, in the frame, with the policy beside it for the
 * reasons' names and whether the portal is on. The loader reads both and the stores (for the Winkel filter) on the
 * server; until they are in, the reference's table skeleton stands in. A role that may not see returns is told which
 * permission it misses.
 *
 * The list is this layout, as in the reference's `ReturnsLayout`, so a return opened over it leaves its filters, sort
 * and scroll as they were. A return reached by its URL is a page with no list behind it.
 */
export const Route = createFileRoute("/_frame/returns")({
  validateSearch: (s: Record<string, unknown>): { view?: string } =>
    typeof s["view"] === "string" ? { view: s["view"] } : {},
  head: () => ({ meta: [{ title: "Retouren · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(returnsAtom)
    context.registry.mount(returnSettingsAtom)
    context.registry.mount(storesAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, returnsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, returnSettingsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: ReturnsLayout
})

const atList = (pathname: string) => pathname.replace(/\/$/, "") === "/returns"

function ReturnsLayout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({ select: (s) => atList(s.location.pathname) })
  return (
    <>
      {atIndex || asModal ? <ReturnsRoute /> : null}
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="table" title="Retouren" />
}

const isForbidden = Schema.is(Forbidden)

function ReturnsRoute() {
  const result = useAtomValue(returnsAtom)
  const settings = Option.getOrUndefined(AsyncResult.value(useAtomValue(returnSettingsAtom)))
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom))) ?? []
  // A refresh keeps showing the list as it was until the new one is in.
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} settings={settings} stores={stores} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de retouren niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Returns.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded(
  { list, settings, stores }: {
    list: ReturnList
    settings: ReturnSettingsDoc | undefined
    stores: ReadonlyArray<StoreView>
  }
) {
  const source = useConsoleReturnsListSource(list, settings, stores)
  return (
    <ReturnsListSourceProvider value={source}>
      <ReturnsList />
    </ReturnsListSourceProvider>
  )
}
