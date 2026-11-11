import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { SCENARIO } from "../../data-source"
import { dayKey } from "../lib/home/dates"
import { groupOf } from "../lib/home/day"
import { hasHistory } from "../lib/home/pulse"
import { undoable } from "../lib/undo"
import { KpiStrip } from "../loading/page-skeletons"
import { Stream } from "../loading/stream"
import { DashboardClosing } from "../marketing-sections/closings"
import { type HomeView, useHome } from "../stores/home-store"
import { useLiveFeed } from "../stores/live-store"
import { useWorkspace } from "../stores/workspace-store"
import { ActivityFeed } from "./activity"
import { Agenda } from "./agenda"
import { Areas } from "./areas"
import { FirstRun } from "./first-run"
import { Hero } from "./hero"
import { HomeBoard } from "./home-board"
import { MyWork } from "./my-work"
import { Pulse } from "./pulse"
import { type QueueEntry, type QueueSource, useQueuePanel } from "./queue-panel"
import { RefreshControl } from "./refresh-control"
import { AddCardMenu, CustomizeButton, EditTools, ViewTabs, WindowMenu } from "./toolbar"
import { useDay } from "./use-day"
import { WIDGETS } from "./widgets"

const Route = Object.assign(getRouteApi("/_admin/dashboard"), { fullPath: "/dashboard" } as const)

/**
 * The day, as one number and one queue.
 *
 * What was here: a drenched mesh hero, a four-tile KPI strip, and nine widgets in a two-column
 * masonry — the hero-metric-over-widget-wall dashboard that PRODUCT.md's own anti-reference list
 * already names. It answered "how is the business doing", which is a question an operator asks once
 * a month, and buried the one they ask every morning: what needs me before the day ends.
 *
 * So the screen is now that question. One figure, set in Archivo at 60px because it is the only
 * number on the page that matters. Beneath it the queue, dense and ranked by time left, 34px rows
 * banded `paper` / `mist` so the eye tracks across without a single rule being drawn. Selecting a row
 * floods it `abyss` and draws its plate on the right.
 *
 * And the queue WORKS. It used to be a picture of one: File it as drawn, Redraw and Discard had no
 * handlers, so the screen's whole premise — the operator decides and nothing changes until they do —
 * could not be acted on. Now filing stamps the plate, slackens its line, takes the row out of the
 * list and rolls the figure down, then draws the next row's plate, because triage is a run of
 * decisions and the board should already be on the next one. Every decision can be taken back for
 * six seconds. J and K move, E files, R redraws, D discards.
 *
 * The queue is the first widget on the home board (`home-board.tsx`), pinned top-left and two
 * columns wide, with the operator's own widgets packed around it. Selecting a row slides its plate in
 * over the right of the board; Escape puts it away.
 */
export function DashboardPage() {
  const queue = useWorkspace((s) => s.queue)
  const fileQueue = useWorkspace((s) => s.fileQueue)
  const discardQueue = useWorkspace((s) => s.discardQueue)
  const restoreQueue = useWorkspace((s) => s.restoreQueue)
  const redrawQueue = useWorkspace((s) => s.redrawQueue)
  const restoreChargeback = useWorkspace((s) => s.restoreChargeback)

  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const storedView = useHome((s) => s.view)
  const setStoredView = useHome((s) => s.setView)
  const boardOnFirstDay = useHome((s) => s.boardOnFirstDay)
  const view: HomeView = search.view ?? storedView
  const [editing, setEditing] = useState(false)
  const { now, moments, work } = useDay()
  useLiveFeed()

  // The demo's decisions: the workspace store's, with the chargeback evidence a filed Klarna plate sends.
  const decide = useCallback(
    (row: QueueEntry, phase: "filed" | "discarded") => {
      const cb = phase === "filed" && row.plate
        ? useWorkspace.getState().chargebacks.find((c) => c.case_number === row.plate?.number)
        : undefined
      const before = phase === "filed" ? fileQueue(row.id) : discardQueue(row.id)
      if (before === undefined) return
      undoable(
        phase === "filed"
          ? `${row.plate?.number ?? "Regel"} uitgevoerd`
          : `${row.plate?.number ?? "Regel"} genegeerd`,
        () => {
          restoreQueue(row.id, before)
          if (cb) restoreChargeback(cb)
          panel.select(row.id)
        },
        phase === "filed" ? row.plate?.after.value : "Er is niets aan het record veranderd."
      )
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: `panel` is this render's
    [fileQueue, discardQueue, restoreQueue, restoreChargeback]
  )
  const source: QueueSource = useMemo(() => ({ rows: queue, decide, redraw: redrawQueue }), [
    queue,
    decide,
    redrawQueue
  ])
  const panel = useQueuePanel(source, view === "overzicht")

  // Arriving with `?row=` (from the agenda or My work) opens that row's plate on the board.
  useEffect(() => {
    if (!search.row) return
    panel.select(search.row)
    navigate({ search: (s) => ({ ...s, row: undefined }), replace: true })
  }, [search.row, panel.select, navigate])

  const pickView = (v: HomeView) => {
    setStoredView(v)
    setEditing(false)
    navigate({ search: (s) => ({ ...s, view: v }) })
  }

  const today = dayKey(now)
  const dueToday = work.filter((w) => {
    const g = groupOf(w, now)
    return g === "late" || g === "today"
  }).length
  const ahead = moments.filter((m) => !m.allDay && dayKey(m.at) === today && m.at > now).length
  const firstDay = SCENARIO === "empty" && !boardOnFirstDay

  return (
    <>
      <section aria-label="Start" className="min-h-full shrink-0 bg-glacier px-4 pt-5 pb-12 sm:px-6">
        <header className="flex flex-col gap-3">
          <Hero needsYou={panel.needsYou} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ViewTabs view={view} onView={pickView} counts={{ werk: dueToday, agenda: ahead }} />
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {view === "overzicht" && !firstDay ?
                (
                  editing ?
                    (
                      <>
                        <EditTools />
                        <AddCardMenu />
                      </>
                    ) :
                    (
                      <>
                        <RefreshControl />
                        <WindowMenu />
                      </>
                    )
                ) :
                <RefreshControl />}
              {view === "overzicht" && !firstDay ?
                (
                  <>
                    <CustomizeButton editing={editing} onEditing={setEditing} />
                    {editing ? null : <AddCardMenu />}
                  </>
                ) :
                null}
            </div>
          </div>
        </header>

        <div role="tabpanel" id={`home-panel-${view}`} aria-labelledby={`home-tab-${view}`} className="mt-4">
          {view === "overzicht" ?
            (
              firstDay ? <FirstRun /> : (
                <div className="flex flex-col gap-4">
                  {hasHistory() ?
                    (
                      <Stream id="dash:pulse" after={560} fallback={<KpiStrip />} reserve>
                        <Pulse />
                      </Stream>
                    ) :
                    null}
                  <HomeBoard
                    editing={editing}
                    onEditing={setEditing}
                    slots={{ queue: panel.body }}
                    render={(id) => WIDGETS[id].render()}
                  />
                  <Areas />
                  <DashboardClosing />
                </div>
              )
            ) :
            view === "werk" ?
            (
              <div className="mx-auto max-w-[1080px]">
                <MyWork />
              </div>
            ) :
            view === "agenda" ?
            <Agenda /> :
            (
              <div className="mx-auto max-w-[1080px]">
                <ActivityFeed />
              </div>
            )}
        </div>
      </section>

      {panel.plate}
    </>
  )
}
