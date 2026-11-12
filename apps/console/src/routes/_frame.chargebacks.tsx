import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ChargebackList } from "@insyte/modules/chargebacks/domain/Chargebacks"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ChargebacksPage } from "@insyte/ui/app/chargebacks/chargebacks-screen"
import { ChargebacksListSourceProvider } from "@insyte/ui/app/chargebacks/source"
import { useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleChargebacksListSource } from "../chargebacks/chargebacks-source.tsx"
import { chargebacksAtom } from "../data/chargebacks.ts"

/**
 * Chargebacks (M13): the reference's cases over `Chargebacks.list`, in the frame, with the workspace's record in the
 * header. The loader reads them on the server; until they are in, the reference's table skeleton stands in. A role
 * that may not see chargebacks is told which permission it misses.
 *
 * The list is this layout, as in the reference's `ChargebacksLayout`, so a case opened over it leaves its filters, sort
 * and scroll as they were. A case reached by its URL is a page with no list behind it.
 */
export const Route = createFileRoute("/_frame/chargebacks")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s["tab"] === "string" ? { tab: s["tab"] } : {},
  head: () => ({ meta: [{ title: "Chargebacks · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(chargebacksAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, chargebacksAtom)))
  },
  pendingComponent: Pending,
  component: ChargebacksLayout
})

const atList = (pathname: string) => pathname.replace(/\/$/, "") === "/chargebacks"

function ChargebacksLayout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({ select: (s) => atList(s.location.pathname) })
  return (
    <>
      {atIndex || asModal ? <ChargebacksRoute /> : null}
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="table" title="Chargebacks" />
}

const isForbidden = Schema.is(Forbidden)

function ChargebacksRoute() {
  const result = useAtomValue(chargebacksAtom)
  // A refresh keeps showing the list as it was until the new one is in.
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de chargebacks niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Chargebacks.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: ChargebackList }) {
  return (
    <ChargebacksListSourceProvider value={useConsoleChargebacksListSource(list)}>
      <ChargebacksPage />
    </ChargebacksListSourceProvider>
  )
}
