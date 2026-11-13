import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { AutomationList } from "@insyte/modules/automations/domain/Automations"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { AutomationsPage } from "@insyte/ui/app/automations/automations-screen"
import { VIEWS } from "@insyte/ui/app/automations/automations-search"
import { AutomationsSourceProvider } from "@insyte/ui/app/automations/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleAutomationsSource } from "../automations/automations-source.tsx"
import { automationsAtom, recommendedAtom, runsAtom } from "../data/automations.ts"

/**
 * Automatiseringen (step 14.1, M12 step 1): the reference's list over `Automations.list`, with the library's templates
 * and the ones the workspace's records recommend (`?view=`). The loader reads both on the server; until they are in,
 * the reference's table skeleton stands in. Geschiedenis is the workspace's newest runs (`Runs.list`, M12 step 5), read
 * with them. A role that may not see automations is told which permission it misses.
 */

type View = (typeof VIEWS)[number]

export const Route = createFileRoute("/_frame/automations/")({
  validateSearch: (s: Record<string, unknown>): { view?: View | undefined } => {
    const view = VIEWS.find((v) => v === s["view"])
    return view === undefined ? {} : { view }
  },
  head: () => ({ meta: [{ title: "Automatiseringen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(automationsAtom)
    context.registry.mount(recommendedAtom)
    context.registry.mount(runsAtom(""))
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, automationsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, recommendedAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, runsAtom("")))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: AutomationsRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Automatiseringen" />
}

const isForbidden = Schema.is(Forbidden)

function AutomationsRoute() {
  const result = useAtomValue(automationsAtom)
  // A refresh keeps showing the list as it was until the new one is in.
  const list = Option.getOrUndefined(AsyncResult.value(result))
  if (list !== undefined) return <Loaded list={list} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de automatiseringen niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Automations.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: AutomationList }) {
  const { view } = Route.useSearch()
  const recommended = Option.getOrUndefined(AsyncResult.value(useAtomValue(recommendedAtom)))
  const source = useConsoleAutomationsSource({ list, recommended })
  return (
    <AutomationsSourceProvider value={source}>
      <AutomationsPage view={view} />
    </AutomationsSourceProvider>
  )
}
