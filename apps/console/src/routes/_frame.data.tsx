import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { DataOverview } from "@insyte/modules/data/domain/Data"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import { DataPage } from "@insyte/ui/app/data/data-screen"
import { VIEWS } from "@insyte/ui/app/data/data-search"
import { DataSourceProvider } from "@insyte/ui/app/data/data-source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, type Atom, AtomRegistry } from "effect/reactivity"
import { useCallback } from "react"
import { useConsoleDataSource } from "../data-hub/data-source.ts"
import { dataOverviewAtom, exportsAtom, importsAtom } from "../data/data.ts"
import { keysAtom } from "../data/developer.ts"
import { ordersAtom } from "../data/orders.ts"
import { storesAtom } from "../data/stores.ts"
import { webhooksAtom } from "../data/webhooks.ts"

/**
 * Data (M14 step 5): the reference's hub over `Data.*`, in the frame, its view from `?view=`. The loader reads the
 * counts, the imported files and the member's exports on the server, with the newest orders, the stores and the
 * developer lists the other views show; until the counts are in, the reference's skeleton stands in. A role without
 * Data · Bekijken is told so; a read that failed says so and offers to try again.
 */

type View = (typeof VIEWS)[number]
const isView = (v: unknown): v is View => typeof v === "string" && (VIEWS as ReadonlyArray<string>).includes(v)

export const Route = createFileRoute("/_frame/data")({
  head: () => ({ meta: [{ title: "Data · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): { view?: View | undefined } => ({
    view: isView(s["view"]) ? s["view"] : undefined
  }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    const read = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
      context.registry.mount(atom)
      return Effect.ignore(AtomRegistry.getResult(context.registry, atom))
    }
    await Effect.runPromise(
      Effect.all([
        read(dataOverviewAtom),
        read(importsAtom),
        read(exportsAtom),
        read(ordersAtom),
        read(storesAtom),
        read(webhooksAtom),
        read(keysAtom)
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: DataRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Data" />
}

const isForbidden = Schema.is(Forbidden)

/** What a read holds now: its value, or the one before while it reads again. */
const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  AsyncResult.isSuccess(result) ? result.value : Option.getOrUndefined(AsyncResult.value(result))

function DataRoute() {
  const result = useAtomValue(dataOverviewAtom)
  const refresh = useAtomRefresh(dataOverviewAtom)
  const overview = valueOf(result)
  if (overview !== undefined) return <Loaded overview={overview} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    const refused = result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
      return (
        <DeniedPanel
          title="Je rol kan Data niet zien"
          denial={{
            perm: refused.error.permission as Permission,
            arg: refused.error.level as Level,
            roleLabel: refused.error.roleLabel,
            grantingRoles: [],
            granters: [],
            request: { state: "none" },
            action: "Data.overview"
          }}
        />
      )
    }
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Data" />
        <div role="alert" className="flex flex-col items-start gap-3 px-5">
          <p className="text-base text-ink-2">Data kon niet worden geladen.</p>
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

function Loaded({ overview }: { overview: DataOverview }) {
  const exports = useAtomValue(exportsAtom)
  const refreshExports = useAtomRefresh(exportsAtom)
  const refreshOverview = useAtomRefresh(dataOverviewAtom)
  const refresh = useCallback(() => {
    refreshExports()
    refreshOverview()
  }, [refreshExports, refreshOverview])
  const source = useConsoleDataSource({
    overview,
    imports: valueOf(useAtomValue(importsAtom)),
    exports: valueOf(exports),
    orders: valueOf(useAtomValue(ordersAtom)),
    stores: valueOf(useAtomValue(storesAtom)),
    endpoints: valueOf(useAtomValue(webhooksAtom)),
    keys: valueOf(useAtomValue(keysAtom)),
    refresh
  })
  return (
    <DataSourceProvider value={source}>
      <DataPage />
    </DataSourceProvider>
  )
}
