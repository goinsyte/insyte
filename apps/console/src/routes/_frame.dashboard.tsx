import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ManualSetupTask } from "@insyte/modules/onboarding/domain/Onboarding"
import { SetupChecklist, SetupPlate, type SetupTaskId, setupTasks } from "@insyte/ui/app/dashboard/setup-checklist"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { completeTaskAtom, START, startAtom } from "../data/onboarding.ts"

/**
 * Where sign-in lands when there is no `redirect` (the screen's default), and the console's first client gate (M2.4):
 * `Session.me` decides, before any HTML. Signed in, it is the person's landing: `/onboarding` until their workspace has
 * finished onboarding, then this page, Start; signed out or expired, it is sign-in with the way back. The Worker's
 * cookie check catches a missing cookie first; this catches one the API no longer accepts.
 *
 * Start, for now, is its first-run page's setup plate and checklist (M4.1) from `Onboarding.start`, without the shell
 * (M5), linking only into the screens the console has (Team, step 4.3).
 */
export const Route = createFileRoute("/_frame/dashboard")({
  head: () => ({ meta: [{ title: "Start · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(startAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, startAtom)))
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
        <SetupPlate tasks={tasks} workspace={checklist.workspaceName} canOpen={canOpen} />
        <SetupChecklist tasks={tasks} onToggle={toggle} canOpen={canOpen} />
      </div>
    </div>
  )
}
