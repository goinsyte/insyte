import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { ReturnDetail, ReturnRow, ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ReturnDetailPage } from "@insyte/ui/app/returns/return-screen"
import { ReturnDetailSourceProvider } from "@insyte/ui/app/returns/source"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { returnAtom, returnsAtom, returnSettingsAtom } from "../data/returns.ts"
import { useArrivingReturnSource, useConsoleReturnDetailSource } from "../returns/returns-source.tsx"

/**
 * One return or claim (step 11.2, M9.1): the reference's record over `Returns.get`, with the policy for the
 * resolutions' amounts. Reached by its URL, the server reads it before it renders, and a return that is not there (or
 * outside the role's stores) is the router's not-found. Opened from a row, it opens at once over the list: the row
 * draws the header and the record's skeleton holds the body until the return is in.
 */
export const Route = createFileRoute("/_frame/returns/$returnId")({
  head: () => ({ meta: [{ title: "Retour · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = returnAtom(params.returnId)
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(atom)
    context.registry.mount(returnSettingsAtom)
    const [exit] = await Promise.all([
      Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom)),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, returnSettingsAtom)))
    ])
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: ReturnRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function ReturnRoute() {
  const { returnId } = Route.useParams()
  const result = useAtomValue(returnAtom(returnId))
  const settings = Option.getOrUndefined(AsyncResult.value(useAtomValue(returnSettingsAtom)))
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(returnsAtom)))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined) return <Loaded detail={detail} settings={settings} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze retour niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Returns.get"
        }}
      />
    )
  }
  const row = list?.rows.find((r) => r.id === returnId)
  if (row === undefined) return <Pending />
  return <Arriving row={row} settings={settings} />
}

function Arriving({ row, settings }: { row: ReturnRow; settings: ReturnSettingsDoc | undefined }) {
  return (
    <ReturnDetailSourceProvider value={useArrivingReturnSource(row, settings)}>
      <ReturnDetailPage />
    </ReturnDetailSourceProvider>
  )
}

function Loaded({ detail, settings }: { detail: ReturnDetail; settings: ReturnSettingsDoc | undefined }) {
  return (
    <ReturnDetailSourceProvider value={useConsoleReturnDetailSource(detail, settings)}>
      <ReturnDetailPage />
    </ReturnDetailSourceProvider>
  )
}
