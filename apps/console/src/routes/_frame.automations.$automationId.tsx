import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { AutomationDetail as Detail } from "@insyte/modules/automations/domain/Automations"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { AutomationDetail } from "@insyte/ui/app/automations/automation-screen"
import { TABS } from "@insyte/ui/app/automations/automation-search"
import { AutomationsSourceProvider } from "@insyte/ui/app/automations/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleAutomationsSource } from "../automations/automations-source.tsx"
import { automationAtom, runsAtom } from "../data/automations.ts"

/**
 * One automation (step 14.1, M12 step 1): the reference's builder over `Automations.get`. The canvas edits a working
 * copy and keeps it as it goes; publishing, the status and the settings are the server's, each with Undo. Runs are the
 * flow's own (`Runs.list`, `?run=` the open one) and Test met voorbeeld walks the canvas on the server (M12 steps 4 and
 * 5). Reached by its URL, the server reads it and its runs before it renders; an unknown one is the router's not-found.
 */

type Tab = (typeof TABS)[number]

export const Route = createFileRoute("/_frame/automations/$automationId")({
  // `run` is the open run in the Runs tab.
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined; run?: string | undefined } => {
    const tab = TABS.find((t) => t === s["tab"])
    return {
      ...(tab === undefined ? {} : { tab }),
      ...(typeof s["run"] === "string" ? { run: s["run"] } : {})
    }
  },
  head: () => ({ meta: [{ title: "Automatisering · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = automationAtom(params.automationId)
    const runs = runsAtom(params.automationId)
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(atom)
    context.registry.mount(runs)
    const [exit] = await Promise.all([
      Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom)),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, runs)))
    ])
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: AutomationRoute
})

function Pending() {
  return <PageSkeleton kind="canvas" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function AutomationRoute() {
  const { automationId } = Route.useParams()
  const result = useAtomValue(automationAtom(automationId))
  // The runs come with it, so the Runs tab never says "Nog geen runs" before they are read; a failure is said there.
  const runs = useAtomValue(runsAtom(automationId))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined && !AsyncResult.isInitial(runs)) return <Loaded key={automationId} detail={detail} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze automatisering niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Automations.get"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ detail }: { detail: Detail }) {
  const { tab } = Route.useSearch()
  const source = useConsoleAutomationsSource({ detail })
  return (
    <AutomationsSourceProvider value={source}>
      <AutomationDetail automationId={detail.automation.id} tab={tab} />
    </AutomationsSourceProvider>
  )
}
