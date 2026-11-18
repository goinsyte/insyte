import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { AffiliateList, ProgramView } from "@insyte/modules/affiliates/domain/Affiliates"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { AffiliatesPage } from "@insyte/ui/app/affiliates/affiliates-screen"
import { type View, VIEWS } from "@insyte/ui/app/affiliates/affiliates-search"
import { AffiliatesSourceProvider } from "@insyte/ui/app/affiliates/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, type Atom, AtomRegistry } from "effect/reactivity"
import { useConsoleAffiliatesSource } from "../affiliates/affiliates-source.tsx"
import {
  affiliatesListAtom,
  applicationsAtom,
  inviteLinkAtom,
  invitesAtom,
  payoutsAtom,
  programAtom,
  resourcesAtom
} from "../data/affiliates.ts"

/**
 * Affiliates (M16 steps 3–5): the design's programme page over `Affiliates.*`, in the frame: who is in and on what
 * tier, the applications, the month's payouts, the open invitations and the material. The loader reads them on the
 * server; until they are in, the table skeleton stands in. A role that may not see affiliates is told which
 * permission it misses.
 */
export const Route = createFileRoute("/_frame/affiliates")({
  head: () => ({ meta: [{ title: "Affiliates · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): { view?: View } => ({
    view: VIEWS.includes(s["view"] as View) ? (s["view"] as View) : undefined
  }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    const prime = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
      context.registry.mount(atom)
      return Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, atom)))
    }
    await Promise.all([
      prime(programAtom),
      prime(affiliatesListAtom),
      prime(applicationsAtom),
      prime(payoutsAtom),
      prime(invitesAtom),
      prime(inviteLinkAtom),
      prime(resourcesAtom)
    ])
  },
  pendingComponent: Pending,
  component: AffiliatesRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Affiliates" />
}

const isForbidden = Schema.is(Forbidden)

function AffiliatesRoute() {
  const result = useAtomValue(affiliatesListAtom)
  const program = Option.getOrUndefined(AsyncResult.value(useAtomValue(programAtom)))
  const list = Option.getOrUndefined(AsyncResult.value(result))
  if (list !== undefined && program !== undefined) return <Loaded program={program} list={list} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de affiliates niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Affiliates.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ program, list }: { program: ProgramView; list: AffiliateList }) {
  const source = useConsoleAffiliatesSource(program, list)
  return (
    <AffiliatesSourceProvider value={source}>
      <AffiliatesPage />
    </AffiliatesSourceProvider>
  )
}
