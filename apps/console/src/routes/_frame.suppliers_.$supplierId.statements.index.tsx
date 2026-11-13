import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { StatementList } from "@insyte/modules/suppliers/domain/Statements"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SupplierStatements } from "@insyte/ui/app/supplier/statements-screen"
import { StatementsSourceProvider } from "@insyte/ui/app/supplier/statements-source"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { statementsAtom } from "../data/suppliers.ts"
import { useConsoleStatements } from "../suppliers/statements-source.tsx"

/**
 * A supplier's statements (step 15.6, M13 step 6): the design's statements page, the brand's side, over
 * `Suppliers.statements`, reached from the supplier's dialog. The loader reads them on the server; until they are in,
 * the table skeleton stands in. A supplier that is not there is the router's not-found; a role that may not see
 * suppliers is told which permission it misses.
 */
export const Route = createFileRoute("/_frame/suppliers_/$supplierId/statements/")({
  head: () => ({ meta: [{ title: "Afrekeningen · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = statementsAtom(params.supplierId)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: StatementsRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Afrekeningen" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function StatementsRoute() {
  const { supplierId } = Route.useParams()
  const result = useAtomValue(statementsAtom(supplierId))
  const list = Option.getOrUndefined(AsyncResult.value(result))
  if (list !== undefined) return <Loaded list={list} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de afrekeningen niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Suppliers.statements"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: StatementList }) {
  return (
    <StatementsSourceProvider value={useConsoleStatements(list)}>
      <SupplierStatements />
    </StatementsSourceProvider>
  )
}
