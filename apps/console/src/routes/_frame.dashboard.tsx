import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import { ManualSetupTask, type StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { HeroView } from "@insyte/ui/app/dashboard/hero-view"
import { HomeBoard } from "@insyte/ui/app/dashboard/home-board"
import { PulseBand } from "@insyte/ui/app/dashboard/pulse-band"
import { QueueCard } from "@insyte/ui/app/dashboard/queue-card"
import { useQueuePanel } from "@insyte/ui/app/dashboard/queue-panel"
import { SetupChecklist, SetupPlate, type SetupTaskId, setupTasks } from "@insyte/ui/app/dashboard/setup-checklist"
import {
  AddCardMenu,
  CustomizeButton,
  EditTools,
  RefreshView,
  ViewTabs,
  WindowMenu
} from "@insyte/ui/app/dashboard/toolbar"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { KpiStrip } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { type ReactNode, useState } from "react"
import { frameAtom } from "../data/frame.ts"
import { briefAtom, widgetsAtom, widgetsKey } from "../data/home.ts"
import { completeTaskAtom, START, startAtom } from "../data/onboarding.ts"
import { queueAtom } from "../data/queue.ts"
import {
  boardOfFrame,
  OFFERED,
  pulseFigures,
  useConsoleBoard,
  useHomeSlots,
  useHomeWidgets
} from "../start/home-source.tsx"
import { useConsoleQueue } from "../start/queue-source.tsx"

/**
 * Where sign-in lands when there is no `redirect` (the screen's default), and the console's first client gate (M2.4):
 * `Session.me` decides, before any HTML. Signed in, it is the person's landing: `/onboarding` until their workspace has
 * finished onboarding, then this page, Start; signed out or expired, it is sign-in with the way back. The Worker's
 * cookie check catches a missing cookie first; this catches one the API no longer accepts.
 *
 * Start: the greeting with what waits on the person (`Home.brief`), the pulse band and the board (M10.3,
 * `Home.widgets`) with the queue (M10.1, `Queue.list`, live) as its first card and its plate panel. On the first day
 * (no orders, nothing open) it is the setup plate and checklist (M4.1) from `Onboarding.start` under the queue instead,
 * linking only into the screens the console has. Mijn werk, Agenda and Activiteit come with the rest of M10.
 */
export const Route = createFileRoute("/_frame/dashboard")({
  head: () => ({ meta: [{ title: "Start · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(startAtom)
    context.registry.mount(queueAtom)
    context.registry.mount(briefAtom)
    const widgets = Effect.gen(function*() {
      // The board's cards and window are the member's (`board`), so its read waits for the frame.
      const frame = yield* AtomRegistry.getResult(context.registry, frameAtom)
      const board = boardOfFrame(frame)
      const atom = widgetsAtom(widgetsKey(board.range, board.ids))
      context.registry.mount(atom)
      yield* AtomRegistry.getResult(context.registry, atom)
    })
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, startAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, queueAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, briefAtom)),
        Effect.ignore(widgets)
      ], { concurrency: "unbounded" })
    )
  },
  component: Start
})

/** Only the operator can say they did these; the rest tick themselves when the workspace has them. */
const isManual = Schema.is(ManualSetupTask)

/** The tasks whose screen the console has; the rest wait for theirs. */
const canOpen = (task: { readonly id: SetupTaskId }) => task.id === "team"

/** The cards whose "Openen" has its screen in the console. */
const OPENS = new Set(["orders", "tickets", "mytickets", "stock", "returns", "bestsellers", "suppliers", "team"])

function Start() {
  const navigate = Route.useNavigate()
  const result = useAtomValue(startAtom)
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const brief = Option.getOrUndefined(AsyncResult.value(useAtomValue(briefAtom)))
  const now = useNow(60_000)
  const queue = useConsoleQueue(now)
  const panel = useQueuePanel(queue.source, true)
  if (!AsyncResult.isSuccess(result) || frame === undefined) return null
  const checklist = result.value
  const signOut = (
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
  )
  const hero = (
    <HeroView
      name={frame.me.name}
      needsYou={panel.needsYou}
      delayed={brief?.delayed ?? queue.delayed}
      urgent={brief?.urgent ?? 0}
      firstDay={brief?.firstDay ?? false}
    />
  )

  if (brief?.firstDay === true) {
    return (
      <FirstDay
        checklist={checklist}
        hero={hero}
        signOut={signOut}
        queue={<QueueCard>{panel.body}</QueueCard>}
        plate={panel.plate}
      />
    )
  }
  return (
    <>
      <Board frame={frame} checklist={checklist} hero={hero} signOut={signOut} queue={panel.body} />
      {panel.plate}
    </>
  )
}

/** The first day: the queue, and what setup leaves to do, from `Onboarding.start`. */
function FirstDay(
  { checklist, hero, signOut, queue, plate }: {
    checklist: StartChecklist
    hero: ReactNode
    signOut: ReactNode
    queue: ReactNode
    plate: ReactNode
  }
) {
  const complete = useAtomSet(completeTaskAtom, { mode: "promiseExit" })
  const tasks = setupTasks((id) => checklist.done.includes(id))
  const toggle = (id: SetupTaskId) => {
    if (!isManual(id)) return
    void complete({ payload: { task: id, done: !checklist.done.includes(id) }, reactivityKeys: START })
  }
  return (
    <div className="flex min-h-full flex-col bg-background text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex justify-end">{signOut}</div>
        {hero}
        {queue}
        {plate}
        <SetupPlate tasks={tasks} workspace={checklist.workspaceName} canOpen={canOpen} />
        <SetupChecklist tasks={tasks} onToggle={toggle} canOpen={canOpen} />
      </div>
    </div>
  )
}

/** Every other day: the pulse, and the board the person arranges, kept in their preferences. */
function Board(
  { frame, checklist, hero, signOut, queue }: {
    frame: Frame
    checklist: StartChecklist
    hero: ReactNode
    signOut: ReactNode
    queue: ReactNode
  }
) {
  const [editing, setEditing] = useState(false)
  const board = useConsoleBoard(frame)
  const { data, refresh } = useHomeWidgets(board.range, board.ids)
  const refreshBrief = useAtomRefresh(briefAtom)
  const slots = useHomeSlots({ frame, data, range: board.range, queue, checklist })
  const currency = (data?.currency ?? "EUR") as Currency
  const figures = data === undefined ? undefined : pulseFigures(data.pulse, board.range, currency)
  const source = {
    ...refresh,
    refresh: () => {
      refresh.refresh()
      refreshBrief()
    }
  }
  return (
    <section aria-label="Start" className="min-h-full shrink-0 bg-glacier px-4 pt-5 pb-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{hero}</div>
          {signOut}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ViewTabs view="overzicht" onView={() => {}} counts={{}} views={["overzicht"]} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {editing ?
              (
                <>
                  <EditTools defaults={board.defaults} />
                  <AddCardMenu offered={OFFERED} />
                </>
              ) :
              (
                <>
                  <RefreshView source={source} />
                  <WindowMenu currency={currency} range={board.range} onRange={board.setRange} />
                </>
              )}
            <CustomizeButton editing={editing} onEditing={setEditing} />
            {editing ? null : <AddCardMenu offered={OFFERED} />}
          </div>
        </div>
      </header>
      <div
        role="tabpanel"
        id="home-panel-overzicht"
        aria-labelledby="home-tab-overzicht"
        className="mt-4 flex flex-col gap-4"
      >
        {figures === undefined ? <KpiStrip n={4} /> : figures.length > 0 ? <PulseBand figures={figures} /> : null}
        <HomeBoard
          editing={editing}
          onEditing={setEditing}
          slots={slots}
          opens={(id) => OPENS.has(id)}
          defaults={board.defaults}
          live
        />
      </div>
    </section>
  )
}
