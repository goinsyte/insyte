import { useState } from "react"
import type { ReactNode } from "react"
import { ARRIVALS, FIRST_WEEK, SETUP_TASKS } from "../fixtures/home.ts"
import { DEMO_NOW, ME, TODAY_FIGURES, WORKSPACE } from "../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../router.tsx"
import { Button, ButtonLink } from "../ui/button.tsx"
import { Checkbox } from "../ui/checkbox.tsx"
import { cx } from "../ui/cx.ts"
import { Check, ChevronRight, LayoutGrid, Sparkle } from "../ui/icons.tsx"
import { GlyphTile } from "../ui/list.tsx"
import { ProgressBar } from "../ui/progress.tsx"
import { Skeleton, SkeletonRow } from "../ui/skeleton.tsx"
import { ErrorState } from "../ui/states.tsx"
import { Tabs } from "../ui/tabs.tsx"
import { dataState, level, setView, useView } from "../view.ts"
import type { PermArea } from "../view.ts"
import { Agenda, aheadToday } from "./home/agenda.tsx"
import { AddCard, Board, ResetButton } from "./home/board.tsx"
import { BreakdownDialog, BreakdownProvider, KpiStrip } from "./home/breakdown.tsx"
import type { Kpi } from "./home/breakdown.tsx"
import { MyWork, useDueToday } from "./home/my-work.tsx"
import { RefreshClock } from "./home/refresh.tsx"
import { useHome } from "./home/store.ts"

const hour = DEMO_NOW.hours
const greeting = hour < 6 ? "Goedenacht" : hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond"
const dateLine = DEMO_NOW.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })
const firstName = ME.name.split(" ")[0] ?? ME.name

/**
 * Start: the day, as a board the operator arranges. Today's figures sit in the head, each one a
 * button that takes it apart. Under them three views: Overzicht, the board, led by the queue of
 * what has to happen today (worked with J, K, E, D and R) with the operator's own cards packed
 * around it; Mijn werk, everything that is yours from across Insyte by when; and Agenda, every
 * deadline on one clock. PRODUCT.md's success test is the operator opening this first thing and
 * finding the three or four things that matter: the queue's first four rows, the rest one click on.
 */
export function HomeScreen() {
  const state = dataState(useView())
  if (state === "empty") return <FirstDay />
  if (state === "loading") return <HomeLoading />
  if (state === "error") return <HomeError />
  return <Today />
}

/** Which permission each of today's figures reads: revenue is Analyse, the rest belongs to its area. */
const FIGURE_AREA: Readonly<Record<string, PermArea>> = {
  Omzet: "analytics",
  Bestellingen: "orders",
  "Open tickets": "support",
  "Eerste reactie": "support"
}

type Tab = "overzicht" | "werk" | "agenda"

function Today() {
  const view = useView()
  const home = useHome()
  const asked = useQuery("weergave")
  const tab: Tab = asked === "werk" ? "werk" : asked === "agenda" ? "agenda" : "overzicht"
  const [editing, setEditing] = useState(false)
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const dueToday = useDueToday()

  // The orders a refresh brought in since the page opened count in today's figures.
  const late = ARRIVALS.slice(0, home.arrived)
  const figures = TODAY_FIGURES.map((f) =>
    f.label === "Omzet"
      ? { ...f, value: f.value + late.reduce((sum, a) => sum + a.amount, 0) }
      : f.label === "Bestellingen"
      ? { ...f, value: f.value + late.length }
      : f
  ).filter((f) => {
    const area = FIGURE_AREA[f.label]
    return area === undefined || level(view, area) > 0
  })
  const analytics = level(view, "analytics") > 0

  const pick = (next: Tab) => {
    setEditing(false)
    setQuery({ weergave: next === "overzicht" ? null : next })
  }

  return (
    <BreakdownProvider value={setKpi}>
      <div className="pane-scroll flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:gap-8 sm:px-8 sm:py-8">
          <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2.5 sm:gap-y-5">
            <h1 className="text-sm text-ink-2">
              {greeting}, {firstName} <span className="text-ink-3">· {dateLine}</span>
            </h1>
            <div className="-mx-4 flex min-w-0 items-end gap-x-3 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <KpiStrip figures={figures} onOpen={setKpi} compareLabel={`vorige maandag om ${DEMO_NOW.clock}`} />
              {analytics && (
                <Link
                  to={paths.board("week")}
                  className="flex shrink-0 items-center gap-0.5 rounded-sm pb-1.5 text-xs text-ink-3 hover:text-ink pointer-coarse:-my-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:pb-0"
                >
                  Analyse
                  <ChevronRight size={13} />
                </Link>
              )}
            </div>
          </header>

          <div className="flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Tabs
                label="Weergave van Start"
                value={tab}
                onChange={pick}
                rule={false}
                className="-ml-2"
                tabs={[
                  { value: "overzicht", label: "Overzicht", controls: "start-paneel" },
                  { value: "werk", label: "Mijn werk", count: dueToday, controls: "start-paneel" },
                  { value: "agenda", label: "Agenda", count: aheadToday(), controls: "start-paneel" }
                ]}
              />
              <div className="flex flex-wrap items-center gap-1">
                {!editing && <RefreshClock />}
                {tab === "overzicht" && (editing
                  ? (
                    <>
                      <ResetButton />
                      <AddCard />
                      <Button size="sm" variant="primary" aria-pressed="true" onClick={() => setEditing(false)}>
                        Klaar
                      </Button>
                    </>
                  )
                  : (
                    <Button size="sm" variant="ghost" icon={<LayoutGrid />} onClick={() => setEditing(true)}>
                      Aanpassen
                    </Button>
                  ))}
              </div>
            </div>

            <div
              role="tabpanel"
              id="start-paneel"
              aria-labelledby={`start-paneel-tab`}
              className={cx(tab !== "overzicht" && "max-w-4xl")}
            >
              {tab === "overzicht" && <Board editing={editing} active={kpi === null} />}
              {tab === "werk" && <MyWork />}
              {tab === "agenda" && <Agenda />}
            </div>
          </div>
        </div>
      </div>
      <BreakdownDialog kpi={kpi} figures={figures} arrived={home.arrived} onClose={() => setKpi(null)} />
    </BreakdownProvider>
  )
}

function Side({ id, title, after, more, children }: {
  readonly id: string
  readonly title: string
  readonly after?: string
  readonly more?: { readonly to: string; readonly label: string }
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold text-ink">{title}</h2>
        {more !== undefined && (
          <Link to={more.to} className="flex items-center gap-0.5 text-xs text-ink-3 hover:text-ink">
            {more.label}
            <ChevronRight size={13} />
          </Link>
        )}
      </header>
      {after !== undefined && <p className="-mt-1 text-xs text-ink-3">{after}</p>}
      {children}
    </section>
  )
}

/* ── the states ─────────────────────────────────────────────────────────────────────────────────── */

function Frame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:gap-10 sm:px-8 sm:py-8">{children}</div>
    </div>
  )
}

/** Start while the day loads: the head's strip, the queue's rows and the side column, in their own shapes. */
function HomeLoading() {
  return (
    <Frame>
      <h1 className="sr-only">Start</h1>
      <div aria-busy="true" aria-label="Start laden" className="flex flex-col gap-5 sm:gap-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <Skeleton className="h-4 w-56" />
          <div className="flex gap-6">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-5 w-16" />
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-44" />
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="grid gap-4 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                <span className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-12" />
                  <Skeleton className="h-2.5 w-20" />
                </span>
                <span className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-4/5" />
                </span>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-40" />
            {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    </Frame>
  )
}

function HomeError() {
  return (
    <Frame>
      <p className="text-sm text-ink-2">
        {greeting}, {firstName} <span className="text-ink-3">· {dateLine}</span>
      </p>
      <h1 className="sr-only">Start</h1>
      <ErrorState
        title="Je dag laden lukte niet"
        detail="GET /home/day · 503 · req_4be812"
        action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
      >
        De wachtrij en de cijfers van vandaag kwamen niet binnen. Er is niets veranderd; je agents werken gewoon door.
      </ErrorState>
    </Frame>
  )
}

/**
 * The first day, when every list is empty. A board of zeros would be the product saying nothing in
 * six places, so the first day is setup: how far it is, the one next step, the checklist to tick, an
 * honest empty queue, and where to go in the first week.
 */
function FirstDay() {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const tasks = SETUP_TASKS.map((t) => ({ ...t, done: t.done || ticked.has(t.id) }))
  const done = tasks.filter((t) => t.done).length
  const left = tasks.length - done
  const next = tasks.find((t) => !t.done)
  const tick = (id: string, on: boolean) =>
    setTicked((set) => {
      const copy = new Set(set)
      if (on) copy.add(id)
      else copy.delete(id)
      return copy
    })

  return (
    <Frame>
      <p className="text-sm text-ink-2">
        Welkom, {firstName} <span className="text-ink-3">· {dateLine}</span>
      </p>
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="inrichten" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 id="inrichten" className="text-xl font-semibold text-balance text-ink">
              {left === 0
                ? `Insyte draait voor ${WORKSPACE}`
                : `Nog ${left} ${left === 1 ? "stap" : "stappen"}, dan draait Insyte voor ${WORKSPACE}`}
            </h1>
            <ProgressBar
              label="Inrichten"
              value={done}
              max={tasks.length}
              detail={`${done} van ${tasks.length}`}
              className="max-w-md"
            />
          </div>
          {next !== undefined && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-ink-2">
                Hierna: <span className="text-ink">{next.label.toLowerCase()}</span>
              </p>
              <ButtonLink to={next.href} variant="primary" size="sm">
                {next.auto ? "Nu doen" : "Openen"}
              </ButtonLink>
            </div>
          )}
          <ul aria-label="Stappen" className="flex flex-col">
            {tasks.map((task) => (
              <li key={task.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                {task.auto
                  ? (
                    <span className="flex flex-1 basis-60 items-center gap-2.5 text-sm">
                      <span
                        className={cx(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
                          task.done ? "bg-good text-canvas" : "ring-1 ring-line-strong ring-inset"
                        )}
                        aria-hidden="true"
                      >
                        {task.done && <Check size={11} strokeWidth={2.5} />}
                      </span>
                      <span className={task.done ? "text-ink-3 line-through decoration-ink-4" : "text-ink"}>
                        {task.label}
                      </span>
                      <span className="sr-only">{task.done ? "gedaan" : "nog te doen"}</span>
                      <span className="text-2xs text-ink-3">
                        {task.done ? "Insyte zag het" : "Insyte ziet het zelf"}
                      </span>
                    </span>
                  )
                  : (
                    <span className="flex flex-1 basis-60">
                      <Checkbox
                        checked={task.done}
                        onChange={(on) => tick(task.id, on)}
                        label={task.label}
                      />
                    </span>
                  )}
                {!task.done && (
                  <Link to={task.href} className="flex items-center gap-0.5 text-xs text-ink-3 hover:text-ink">
                    Openen
                    <ChevronRight size={13} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex min-w-0 flex-col gap-8 lg:pt-1.5">
          <Side id="wachtrij-leeg" title="Te doen vandaag">
            <p className="text-sm text-pretty text-ink-2">
              Nog leeg. Loopt een bestelling vast, schrijft een klant of wordt een betaling betwist, dan staat het hier,
              op volgorde van wat er op het spel staat.
            </p>
            <Button size="sm" icon={<Sparkle />} className="self-start" onClick={() => navigate(paths.newChat())}>
              Vraag Magnus iets
            </Button>
          </Side>
          <Side id="eerste-week" title="Je eerste week">
            <ul className="flex flex-col gap-px">
              {FIRST_WEEK.map((step) => (
                <li key={step.title}>
                  <Link
                    to={step.href}
                    className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-hover"
                  >
                    <GlyphTile size={28}>
                      <step.glyph size={15} />
                    </GlyphTile>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm text-ink">{step.title}</span>
                      <span className="text-xs text-pretty text-ink-3">{step.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Side>
        </aside>
      </div>
    </Frame>
  )
}
