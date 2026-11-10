import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ManualSetupTask } from "@insyte/modules/onboarding/domain/Onboarding"
import { HeroView } from "@insyte/ui/app/dashboard/hero-view"
import { QueueCard } from "@insyte/ui/app/dashboard/queue-card"
import { useQueuePanel } from "@insyte/ui/app/dashboard/queue-panel"
import { SetupChecklist, SetupPlate, type SetupTaskId, setupTasks } from "@insyte/ui/app/dashboard/setup-checklist"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { frameAtom } from "../data/frame.ts"
import { completeTaskAtom, START, startAtom } from "../data/onboarding.ts"
import { queueAtom } from "../data/queue.ts"
import { useConsoleQueue } from "../start/queue-source.tsx"

/**
 * Where sign-in lands when there is no `redirect` (the screen's default), and the console's first client gate (M2.4):
 * `Session.me` decides, before any HTML. Signed in, it is the person's landing: `/onboarding` until their workspace has
 * finished onboarding, then this page, Start; signed out or expired, it is sign-in with the way back. The Worker's
 * cookie check catches a missing cookie first; this catches one the API no longer accepts.
 *
 * Start: the greeting with what waits on the person, the queue (M10.1, `Queue.list`, live) with its plate panel, and
 * the setup plate and checklist (M4.1) from `Onboarding.start`, linking only into the screens the console has. The
 * board's other cards, Mijn werk, Agenda and Activiteit come with the rest of M10.
 */
export const Route = createFileRoute("/_frame/dashboard")({
  head: () => ({ meta: [{ title: "Start · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(startAtom)
    context.registry.mount(queueAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, startAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, queueAtom))
      ], { concurrency: "unbounded" })
    )
  },
  component: Start
})

/** Only the operator can say they did these; the rest tick themselves when the workspace has them. */
const isManual = Schema.is(ManualSetupTask)

/** The tasks whose screen the console has; the rest wait for theirs. */
const canOpen = (task: { readonly id: SetupTaskId }) => task.id === "team"

function Start() {
  const navigate = Route.useNavigate()
  const result = useAtomValue(startAtom)
  const complete = useAtomSet(completeTaskAtom, { mode: "promiseExit" })
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const now = useNow(60_000)
  const queue = useConsoleQueue(now)
  const panel = useQueuePanel(queue.source, true)
  if (!AsyncResult.isSuccess(result)) return null
  const checklist = result.value
  const tasks = setupTasks((id) => checklist.done.includes(id))
  const toggle = (id: SetupTaskId) => {
    if (!isManual(id)) return
    void complete({ payload: { task: id, done: !checklist.done.includes(id) }, reactivityKeys: START })
  }
  return (
    <div className="flex min-h-full flex-col bg-background text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut()
              await navigate({ to: "/login", search: {} })
            }}
            className="flex h-8 cursor-pointer items-center rounded-md px-2.5 text-sm text-ink-2 hover:bg-ink/6 hover:text-ink"
          >
            Uitloggen
          </button>
        </div>
        <HeroView name={frame?.me.name ?? ""} needsYou={panel.needsYou} delayed={queue.delayed} />
        <QueueCard>{panel.body}</QueueCard>
        {panel.plate}
        <SetupPlate tasks={tasks} workspace={checklist.workspaceName} canOpen={canOpen} />
        <SetupChecklist tasks={tasks} onToggle={toggle} canOpen={canOpen} />
      </div>
    </div>
  )
}
