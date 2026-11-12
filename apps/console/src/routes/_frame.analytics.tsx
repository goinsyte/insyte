import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import { Forbidden } from "@insyte/domain/Errors"
import type { AnalyticsOverview, AnalyticsPeriods } from "@insyte/modules/analytics/domain/Analytics"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { AnalyticsPage } from "@insyte/ui/app/analytics/analytics-screen"
import { AnalyticsSourceProvider } from "@insyte/ui/app/analytics/analytics-source"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { type Cause, Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useRef } from "react"
import { pairFor, useAnalyticsPair, useConsoleAnalyticsSource } from "../analytics/analytics-source.ts"
import { overviewAtom, pairKey, periodsAtom } from "../data/analytics.ts"
import { frameAtom } from "../data/frame.ts"

/**
 * Analyse (step 16.2, M14 step 2): the reference's page over `Analytics.*`, in the frame. The loader reads the months
 * and the six figures for the member's two months on the server; the charts and the findings follow in the browser,
 * their gridlines standing in. A role without Analyse · Bekijken is told so; a read that failed says so and offers to
 * try again. Changing a month keeps the figures it had until the new ones are in.
 */
export const Route = createFileRoute("/_frame/analytics")({
  head: () => ({ meta: [{ title: "Analyse · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(periodsAtom)
    const overview = Effect.gen(function*() {
      const periods = yield* AtomRegistry.getResult(context.registry, periodsAtom)
      // The months are the member's (`analytics`), so the figures wait for the frame.
      const frame = yield* AtomRegistry.getResult(context.registry, frameAtom)
      const atom = overviewAtom(pairKey(pairFor(frame, periods)))
      context.registry.mount(atom)
      yield* AtomRegistry.getResult(context.registry, atom)
    })
    await Effect.runPromise(Effect.ignore(overview))
  },
  pendingComponent: Pending,
  component: AnalyticsRoute
})

function Pending() {
  return <PageSkeleton kind="analytics" title="Analyse" />
}

const isForbidden = Schema.is(Forbidden)

/** The refusal in a failed read, if that is what it was. */
const refusalOf = (cause: Cause.Cause<unknown>) => {
  const reason = cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
  return reason !== undefined && reason._tag === "Fail" && isForbidden(reason.error) ? reason.error : undefined
}

function Denied({ refused, action }: { refused: Forbidden; action: string }) {
  return (
    <DeniedPanel
      title="Je rol kan Analyse niet zien"
      denial={{
        perm: refused.permission as Permission,
        arg: refused.level as Level,
        roleLabel: refused.roleLabel,
        grantingRoles: [],
        granters: [],
        request: { state: "none" },
        action
      }}
    />
  )
}

function Failed({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader title="Analyse" />
      <div role="alert" className="flex flex-col items-start gap-3 px-5">
        <p className="text-base text-ink-2">Analyse kon niet worden geladen.</p>
        <button
          type="button"
          onClick={retry}
          className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  )
}

const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  AsyncResult.isSuccess(result) ? result.value : Option.getOrUndefined(AsyncResult.value(result))

function AnalyticsRoute() {
  const frame = valueOf(useAtomValue(frameAtom))
  const result = useAtomValue(periodsAtom)
  const refresh = useAtomRefresh(periodsAtom)
  const periods = valueOf(result)
  if (periods !== undefined && frame !== undefined) return <Paired frame={frame} periods={periods} />
  if (AsyncResult.isFailure(result) && !result.waiting) {
    const refused = refusalOf(result.cause)
    return refused === undefined ? <Failed retry={refresh} /> : <Denied refused={refused} action="Analytics.periods" />
  }
  return <Pending />
}

function Paired({ frame, periods }: { frame: Frame; periods: AnalyticsPeriods }) {
  const [pair, setPair] = useAnalyticsPair(frame, periods)
  const atom = overviewAtom(pairKey(pair))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  // The last pair's figures stay up while a new month is read.
  const last = useRef<AnalyticsOverview | undefined>(undefined)
  const overview = valueOf(result) ?? last.current
  if (overview !== undefined) {
    last.current = overview
    return <Loaded periods={periods} pair={pair} setPair={setPair} overview={overview} />
  }
  if (AsyncResult.isFailure(result) && !result.waiting) {
    const refused = refusalOf(result.cause)
    return refused === undefined ? <Failed retry={refresh} /> : <Denied refused={refused} action="Analytics.overview" />
  }
  return <Pending />
}

function Loaded(props: Parameters<typeof useConsoleAnalyticsSource>[0]) {
  const source = useConsoleAnalyticsSource(props)
  return (
    <AnalyticsSourceProvider value={source}>
      <AnalyticsPage />
    </AnalyticsSourceProvider>
  )
}
