import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { ChargebackDetail as Detail } from "@insyte/modules/chargebacks/domain/Chargebacks"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ChargebackDetail } from "@insyte/ui/app/chargebacks/chargeback-screen"
import { ChargebackDetailSourceProvider } from "@insyte/ui/app/chargebacks/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleChargebackDetailSource } from "../chargebacks/chargebacks-source.tsx"
import { chargebackAtom } from "../data/chargebacks.ts"

/**
 * One chargeback (M13): the reference's case over `Chargebacks.get`, with its pack and timeline. Reached by its URL,
 * the server reads it before it renders, and a case that is not there (or outside the role's stores) is the router's
 * not-found. Opened from a row, it opens over the list, with the record's skeleton until the case is in.
 */
export const Route = createFileRoute("/_frame/chargebacks/$chargebackId")({
  head: () => ({ meta: [{ title: "Chargeback · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = chargebackAtom(params.chargebackId)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: ChargebackRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function ChargebackRoute() {
  const { chargebackId } = Route.useParams()
  const result = useAtomValue(chargebackAtom(chargebackId))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined) return <Loaded detail={detail} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze chargeback niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Chargebacks.get"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ detail }: { detail: Detail }) {
  return (
    <ChargebackDetailSourceProvider value={useConsoleChargebackDetailSource(detail)}>
      <ChargebackDetail />
    </ChargebackDetailSourceProvider>
  )
}
