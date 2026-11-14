import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { AgentLogEntry, AgentLogPage } from "@insyte/modules/agent/domain/AgentLog"
import { ActivityPage, type ActivitySearch } from "@insyte/ui/app/ask/activity-screen"
import { AgentLogSourceProvider } from "@insyte/ui/app/ask/agent-log-source"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleAgentLogSource } from "../agent/log-source.tsx"
import { agentEntryAtom, agentLogAtom } from "../data/agent.ts"

/**
 * Wat Insyte deed (`/ask/activity`, M15 step 6): the reference's log page over `AgentLog.list`, in the frame. Read by the
 * whole team, each row only for whoever may see its area and its store; taking one back needs that area's Bewerken.
 * `?view=` is a cut of the list (Kan nog terug, Zelf gedaan…), `?row=` opens a row's drawer, read by `AgentLog.get`
 * where it is older than the list. The loader reads the log on the server; a read that failed says so and offers to try
 * again.
 */
export const Route = createFileRoute("/_frame/ask/activity")({
  validateSearch: (s: Record<string, unknown>): ActivitySearch => ({
    ...(typeof s["view"] === "string" ? { view: s["view"] } : {}),
    ...(typeof s["row"] === "string" ? { row: s["row"] } : {})
  }),
  head: () => ({ meta: [{ title: "Wat Insyte deed · Insyte" }] }),
  loaderDeps: ({ search }) => ({ row: search.row }),
  loader: async ({ context, deps }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(agentLogAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, agentLogAtom)))
    const page = Option.getOrUndefined(AsyncResult.value(context.registry.get(agentLogAtom)))
    if (deps.row === undefined || page === undefined || page.rows.some((r) => r.id === deps.row)) return
    const one = agentEntryAtom(deps.row)
    context.registry.mount(one)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, one)))
  },
  pendingComponent: Pending,
  component: ActivityRoute
})

function Pending() {
  return <PageSkeleton kind="list" title="Wat Insyte deed" />
}

function ActivityRoute() {
  const result = useAtomValue(agentLogAtom)
  const refresh = useAtomRefresh(agentLogAtom)
  const page = Option.getOrUndefined(AsyncResult.value(result))
  if (page !== undefined) return <Loaded page={page} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Wat Insyte deed" />
        <div role="alert" className="flex flex-col items-start gap-3 px-5">
          <p className="text-base text-ink-2">Wat Insyte deed kon niet worden geladen.</p>
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

function Loaded({ page }: { page: AgentLogPage }) {
  const { row } = useSearch({ from: "/_frame/ask/activity" })
  const listed = row === undefined || page.rows.some((r) => r.id === row)
  return listed ? <WithRows page={page} extra={undefined} /> : <WithRow page={page} id={row} />
}

/** The address's row, older than the list: read on its own, the page drawn meanwhile. */
function WithRow({ page, id }: { page: AgentLogPage; id: string }) {
  const one = Option.getOrUndefined(AsyncResult.value(useAtomValue(agentEntryAtom(id))))
  return <WithRows page={page} extra={one} />
}

function WithRows({ page, extra }: { page: AgentLogPage; extra: AgentLogEntry | undefined }) {
  return (
    <AgentLogSourceProvider value={useConsoleAgentLogSource(page, extra)}>
      <ActivityPage />
    </AgentLogSourceProvider>
  )
}
