import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { StatementDetail } from "@insyte/modules/suppliers/domain/Statements"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { StatementPage } from "@insyte/ui/app/supplier/statement-screen"
import { StatementSourceProvider } from "@insyte/ui/app/supplier/statements-source"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { statementAtom } from "../data/suppliers.ts"
import { useConsoleStatement } from "../suppliers/statements-source.tsx"

/**
 * One month of a supplier's statement (step 15.6, M13 step 6): the design's statement page over `Suppliers.statement`,
 * line by line, with its invoice and "Als betaald markeren". A month with nothing in it, or a supplier that is not
 * there, is the router's not-found.
 */
export const Route = createFileRoute("/_frame/suppliers_/$supplierId/statements/$month")({
  head: () => ({ meta: [{ title: "Afrekening · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) throw notFound()
    const atom = statementAtom(`${params.supplierId}/${params.month}`)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: StatementRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function StatementRoute() {
  const { supplierId, month } = Route.useParams()
  const result = useAtomValue(statementAtom(`${supplierId}/${month}`))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined) return <Loaded detail={detail} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze afrekening niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Suppliers.statement"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ detail }: { detail: StatementDetail }) {
  return (
    <StatementSourceProvider value={useConsoleStatement(detail)}>
      <StatementPage />
    </StatementSourceProvider>
  )
}
