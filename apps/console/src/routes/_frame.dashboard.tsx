import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import { ManualSetupTask, type StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { HeroView } from "@insyte/ui/app/dashboard/hero-view"
import { HomeBoard } from "@insyte/ui/app/dashboard/home-board"
import { PulseBand } from "@insyte/ui/app/dashboard/pulse-band"
import { QueueCard } from "@insyte/ui/app/dashboard/queue-card"
import { useQueuePanel } from "@insyte/ui/app/dashboard/queue-panel"
import { SetupChecklist, SetupPlate, type SetupTaskId } from "@insyte/ui/app/dashboard/setup-checklist"
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
import type { HomeView } from "@insyte/ui/app/stores/home-store"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { type ReactNode, useEffect, useState } from "react"
import { chatsAtom } from "../data/chats.ts"
import { frameAtom } from "../data/frame.ts"
import { briefAtom, widgetsAtom, widgetsKey } from "../data/home.ts"
import { completeTaskAtom, START, startAtom } from "../data/onboarding.ts"
import { queueAtom } from "../data/queue.ts"
import { useHasPage } from "../frame/pages.ts"
import {
  boardOfFrame,
  OFFERED,
  pulseFigures,
  useConsoleBoard,
  useHomeSlots,
  useHomeWidgets
} from "../start/home-source.tsx"
import {
  ConsoleActivity,
  ConsoleAgenda,
  ConsoleWork,
  dueToday,
  useAgendaAhead,
  useConsoleWork
} from "../start/home-views.tsx"
import { useConsoleQueue } from "../start/queue-source.tsx"
import { consoleSetupTasks, useCanOpenTask } from "../start/setup-tasks.tsx"

/**
 * Where sign-in lands when there is no `redirect` (the screen's default), and the console's first client gate (M2.4):
 * `Session.me` decides, before any HTML. Signed in, it is the person's landing: `/onboarding` until their workspace has
 * finished onboarding, then this page, Start; signed out or expired, it is sign-in with the way back. The Worker's
 * cookie check catches a missing cookie first; this catches one the API no longer accepts.
 *
 * Start: the greeting with what waits on the person (`Home.brief`), the pulse band and the board (M10.3,
 * `Home.widgets`) with the queue (M10.1, `Queue.list`, live) as its first card and its plate panel. On the first day
 * (no orders, nothing open) it is the setup plate and checklist (M4.1) from `Onboarding.start` under the queue instead,
 * linking only into the screens the console has. Mijn werk, Agenda and Activiteit (M10.3b) are the other tabs, read
 * when they open; `?view=` keeps the tab and `?row=` (from the agenda or Mijn werk) opens that queue row's plate.
 */
export const Route = createFileRoute("/_frame/dashboard")({
  head: () => ({ meta: [{ title: "Start · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): StartSearch => ({
    ...(typeof s["view"] === "string" && (VIEWS as ReadonlyArray<string>).includes(s["view"])
      ? { view: s["view"] as HomeView }
      : {}),
    ...(typeof s["row"] === "string" ? { row: s["row"] } : {})
  }),
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
      // "Ongelezen chats" reads the conversations the chats page does.
      if (board.chats) context.registry.mount(chatsAtom)
      yield* Effect.all([
        AtomRegistry.getResult(context.registry, atom),
        board.chats ? Effect.ignore(AtomRegistry.getResult(context.registry, chatsAtom)) : Effect.void
      ], { concurrency: "unbounded" })
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

interface StartSearch {
  readonly view?: HomeView
  readonly row?: string
}

const VIEWS: ReadonlyArray<HomeView> = ["overzicht", "werk", "agenda", "activiteit"]

/** Only the operator can say they did these; the rest tick themselves when the workspace has them. */
const isManual = Schema.is(ManualSetupTask)

/** The cards whose "Openen" has its screen in the console; Vermeldingen's opens once the notifications page is in. */
const OPENS = new Set([
  "orders",
  "revenue",
  "countries",
  "chargebacks",
  "tickets",
  "mytickets",
  "chats",
  "stock",
  "returns",
  "bestsellers",
  "suppliers",
  "team"
])

function Start() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const view = search.view ?? "overzicht"
  const result = useAtomValue(startAtom)
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const brief = Option.getOrUndefined(AsyncResult.value(useAtomValue(briefAtom)))
  const now = useNow(60_000)
  const queue = useConsoleQueue(now)
  const panel = useQueuePanel(queue.source, view === "overzicht")

  // Arriving with `?row=` (from the agenda or Mijn werk) opens that row's plate over the board.
  useEffect(() => {
    if (search.row === undefined) return
    panel.select(search.row)
    void navigate({ search: (s) => ({ ...s, row: undefined }), replace: true })
  }, [search.row, panel.select, navigate])

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
      evidence={brief?.evidence ?? 0}
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
      <Board
        frame={frame}
        checklist={checklist}
        hero={hero}
        signOut={signOut}
        queue={panel.body}
        view={view}
        now={now}
      />
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
  const tasks = consoleSetupTasks((id) => checklist.done.includes(id))
  const canOpen = useCanOpenTask()
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

/**
 * Every other day: the pulse and the board the person arranges, kept in their preferences, and the three other views
 * beside it.
 */
function Board(
  { frame, checklist, hero, signOut, queue, view, now }: {
    frame: Frame
    checklist: StartChecklist
    hero: ReactNode
    signOut: ReactNode
    queue: ReactNode
    view: HomeView
    now: number
  }
) {
  const navigate = useNavigate({ from: "/dashboard" })
  const hasPage = useHasPage()
  const [editing, setEditing] = useState(false)
  const work = useConsoleWork(frame, now)
  const due = dueToday(work.items, now)
  const ahead = useAgendaAhead(now)
  const pickView = (v: HomeView) => {
    setEditing(false)
    void navigate({ search: (s) => ({ ...s, view: v === "overzicht" ? undefined : v }) })
  }
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
          <ViewTabs
            view={view}
            onView={pickView}
            counts={{ ...(due === undefined ? {} : { werk: due }), ...(ahead === undefined ? {} : { agenda: ahead }) }}
            views={VIEWS}
          />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {view !== "overzicht" ? null : editing ?
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
            {view === "overzicht" ?
              (
                <>
                  <CustomizeButton editing={editing} onEditing={setEditing} />
                  {editing ? null : <AddCardMenu offered={OFFERED} />}
                </>
              ) :
              null}
          </div>
        </div>
      </header>
      <div
        role="tabpanel"
        id={`home-panel-${view}`}
        aria-labelledby={`home-tab-${view}`}
        className="mt-4 flex flex-col gap-4"
      >
        {view === "overzicht" ?
          (
            <>
              {figures === undefined ?
                <KpiStrip n={4} /> :
                figures.length > 0 ?
                <PulseBand figures={figures} /> :
                null}
              <HomeBoard
                editing={editing}
                onEditing={setEditing}
                slots={slots}
                opens={(id) => OPENS.has(id) || (id === "mentions" && hasPage("/notifications"))}
                defaults={board.defaults}
                live
              />
            </>
          ) :
          view === "werk" ?
          (
            <div className="mx-auto w-full max-w-[1080px]">
              <ConsoleWork now={now} items={work.items} pref={work.pref} save={work.save} />
            </div>
          ) :
          view === "agenda" ?
          <ConsoleAgenda now={now} /> :
          (
            <div className="mx-auto w-full max-w-[1080px]">
              <ConsoleActivity now={now} />
            </div>
          )}
      </div>
    </section>
  )
}
