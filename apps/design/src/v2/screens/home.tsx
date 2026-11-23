import { useState } from "react"
import type { ReactNode } from "react"
import { FigureStrip } from "../charts/figure-strip.tsx"
import { myWork, openProposals, tasksForYou, useDemo } from "../demo.ts"
import { ACTIVITY, AGENTS } from "../fixtures/agents.ts"
import type { Activity, Autonomy } from "../fixtures/agents.ts"
import { ELSEWHERE, FIRST_WEEK, QUEUE, SETUP_TASKS } from "../fixtures/home.ts"
import type { QueueEntry, Waiting } from "../fixtures/home.ts"
import { DEMO_NOW, ME, PEOPLE, TODAY_FIGURES, WORKSPACE } from "../fixtures/workspace.ts"
import { Link, navigate, paths } from "../router.tsx"
import { AgentAvatar, Avatar } from "../ui/avatar.tsx"
import { Status } from "../ui/badge.tsx"
import { Button, buttonClass, ButtonLink } from "../ui/button.tsx"
import { Checkbox } from "../ui/checkbox.tsx"
import { cx } from "../ui/cx.ts"
import { Check, ChevronDown, ChevronRight, Sparkle } from "../ui/icons.tsx"
import { GlyphTile, List, ListRow } from "../ui/list.tsx"
import { ProgressBar } from "../ui/progress.tsx"
import { Skeleton, SkeletonRow } from "../ui/skeleton.tsx"
import { ErrorState } from "../ui/states.tsx"
import { dataState, level, setView, useView } from "../view.ts"
import type { PermArea } from "../view.ts"
import { WaitingProposal } from "./waiting-proposal.tsx"

const SETTING: Record<Autonomy, string> = { zelf: "Zelf doen", vragen: "Eerst vragen", nooit: "Nooit" }

const TEAM = [
  { person: PEOPLE.sofia, doing: "beantwoordt ticket #5142" },
  { person: PEOPLE.ethan, doing: "in de bestellingenwachtrij" },
  { person: PEOPLE.liam, doing: "18 min geleden actief" },
  { person: PEOPLE.maya, doing: "gisteren voor het laatst" }
] as const

/** How many rows of the queue show before "Nog …": PRODUCT.md's "three or four important things". */
const FIRST = 4
/** How many lines of what the agents did Start shows; the log has the rest. */
const DONE = 5

const hour = DEMO_NOW.hours
const greeting = hour < 6 ? "Goedenacht" : hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond"
const dateLine = DEMO_NOW.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })
const firstName = ME.name.split(" ")[0] ?? ME.name

/**
 * Start: one queue of what has to happen today, whoever does it, ranked by what is at stake before
 * the clock: a deadline someone else sets first, then what moves money or speaks for the business,
 * then by time, and each row says why it stands where it stands. A row is yours to do or an agent's
 * proposal waiting for your yes. Today's figures are a thin line in the head; beside the queue (under
 * it on a phone) is what the agents did overnight and today, as a record, then the agents and the team.
 * PRODUCT.md's success test is the operator opening this first thing and finding the three or four
 * things that matter: the first four rows, the rest one click further.
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

function Today() {
  const demo = useDemo()
  const view = useView()
  const figures = TODAY_FIGURES.filter((f) => {
    const area = FIGURE_AREA[f.label]
    return area === undefined || level(view, area) > 0
  })
  const analytics = level(view, "analytics") > 0
  const [more, setMore] = useState(false)
  const handled = AGENTS.reduce((sum, agent) => sum + agent.runsToday, 0)
  const firstOpen = QUEUE.find((e) => e.kind === "proposal" && demo.decisions[e.item.id] === undefined)?.item.id
  const shown = more ? QUEUE : QUEUE.slice(0, FIRST)
  const hidden = QUEUE.slice(FIRST)

  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:gap-10 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2.5 sm:gap-y-5">
          <p className="text-sm text-ink-2">
            {greeting}, {firstName} <span className="text-ink-3">· {dateLine}</span>
          </p>
          <div className="-mx-4 flex min-w-0 items-end gap-x-5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <FigureStrip
              figures={figures}
              label={`Vandaag tot ${DEMO_NOW.clock}`}
              compareLabel={`vorige maandag om ${DEMO_NOW.clock}`}
              compact
            />
            {analytics && (
              <Link
                to={paths.board("week")}
                className="flex shrink-0 items-center gap-0.5 rounded-sm pb-0.5 text-xs text-ink-3 hover:text-ink pointer-coarse:-my-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:pb-0"
              >
                Analyse
                <ChevronRight size={13} />
              </Link>
            )}
          </div>
        </header>

        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-labelledby="vandaag" className="flex min-w-0 flex-col gap-1 sm:gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <h1 id="vandaag" className="text-xl font-semibold text-ink">Te doen vandaag</h1>
              <p className="text-xs text-ink-3">
                <span className="figure">{myWork(demo)}</span> open: <span className="figure">{tasksForYou()}</span>
                {" "}
                voor jou, <span className="figure">{openProposals(demo)}</span> voorstellen · harde deadlines eerst
              </p>
            </div>

            <ol className="flex flex-col sm:gap-2">
              {shown.map((entry) => (
                <QueueRow
                  key={entry.item.id}
                  entry={entry}
                  primary={entry.item.id === firstOpen}
                />
              ))}
            </ol>
            {hidden.length > 0 && (
              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore(!more)}
                className="flex items-center gap-1.5 self-start rounded-sm py-1 text-sm text-ink-2 hover:text-ink"
              >
                <ChevronDown size={15} className={cx("transition-transform", more && "rotate-180")} />
                <span>
                  {more ? "Minder tonen" : (
                    <>
                      Nog <span className="figure">{hidden.length}</span>: {hidden.map((e) => e.item.due).join(", ")}
                    </>
                  )}
                </span>
              </button>
            )}
          </section>

          <aside className="flex min-w-0 flex-col gap-8 lg:pt-1.5">
            <Side id="gedaan" title="Vannacht en vandaag gedaan">
              <ol className="flex flex-col gap-3 pt-1">
                {ACTIVITY.slice(0, DONE).map((line) => <Done key={line.id} line={line} />)}
              </ol>
              <Link
                to={paths.log}
                className="flex min-h-8 items-center gap-0.5 self-start pl-[3.375rem] text-xs text-ink-3 hover:text-ink"
              >
                Alles bekijken in het logboek
                <ChevronRight size={13} />
              </Link>
            </Side>

            <Side id="elders" title="Elders in Northwind">
              <ul className="flex flex-col gap-px">
                {ELSEWHERE.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={row.href}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-hover pointer-coarse:py-2.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-ink">{row.label}</span>
                        <span className="truncate text-xs text-ink-3">{row.detail}</span>
                      </span>
                      <Status tone={row.tone}>
                        <span className="figure">{row.value}</span>
                      </Status>
                    </Link>
                  </li>
                ))}
              </ul>
            </Side>

            <Side
              id="agents"
              title="Je agents"
              after={`${handled} keer zelf gedaan vandaag`}
              more={{ to: paths.agents, label: "Alle agents" }}
            >
              <List label="Agents aan het werk">
                {AGENTS.filter((agent) => agent.active).slice(0, 4).map((agent) => (
                  <ListRow
                    key={agent.id}
                    href={paths.agent(agent.id)}
                    lead={<AgentAvatar glyph={agent.glyph} size={26} />}
                    title={agent.name}
                    meta={agent.lastWorked}
                    trail={<span className="figure">{agent.runsToday}×</span>}
                  />
                ))}
              </List>
            </Side>

            <Side id="team" title="Team">
              <List label="Team">
                {TEAM.map(({ person, doing }) => (
                  <ListRow
                    key={person.id}
                    lead={<Avatar name={person.name} size={26} presence={person.presence} />}
                    title={person.name}
                    meta={doing}
                  />
                ))}
              </List>
            </Side>
          </aside>
        </div>
      </div>
    </div>
  )
}

/**
 * One row of the queue: when it is due and who acts on the left, the thing itself on the right. A
 * task is yours and links to where you do it; a proposal is the agent's, waiting for Uitvoeren.
 */
function QueueRow({ entry, primary }: { readonly entry: QueueEntry; readonly primary: boolean }) {
  return (
    <li className="grid gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2 sm:py-3">
      <When entry={entry} />
      {entry.kind === "task"
        ? <Task item={entry.item} />
        : <WaitingProposal item={entry.item} primary={primary} fold />}
    </li>
  )
}

/** When it is due, why it ranks where it does, and who acts: one line on a phone, a column beside it. */
function When({ entry }: { readonly entry: QueueEntry }) {
  const { due, because, stakes } = entry.item
  const hard = stakes === "hard"
  const [day, time] = due.startsWith("morgen") ? ["morgen", due.replace("morgen ", "")] : [null, due]
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5 sm:flex-col sm:items-start sm:gap-1">
      <p
        className={cx(
          "flex items-baseline gap-1 text-sm leading-tight sm:flex-col sm:items-start sm:gap-0",
          hard ? "font-semibold text-bad-ink" : "text-ink"
        )}
      >
        {day !== null && <span className="text-xs">{day}</span>}
        <span className="figure">{time === "nu" ? "Nu" : time}</span>
      </p>
      <p className={cx("text-xs", hard ? "font-medium text-bad-ink" : "text-ink-2")}>{because}</p>
      <p className="text-2xs text-ink-3">
        <span aria-hidden="true" className="sm:hidden">·{" "}</span>
        {entry.kind === "task" ? "Jij" : "Agent, na je ja"}
      </p>
    </div>
  )
}

/** One thing an agent did: when, who, what, and the rule it ran under. No frame; the time column holds the rhythm. */
function Done({ line }: { readonly line: Activity }) {
  const agent = AGENTS.find((a) => a.id === line.agentId)
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2.5">
      <span className="figure pt-px text-xs text-ink-3">
        {line.at.startsWith("vannacht") ? line.at.replace("vannacht ", "") : line.at}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-pretty text-ink">{line.text}</p>
        <p className="text-xs text-pretty text-ink-3">
          {agent !== undefined && (
            <Link to={paths.agent(agent.id)} className="text-ink-2 hover:text-ink hover:underline">
              {agent.name}
            </Link>
          )}
          {line.at.startsWith("vannacht") && " · vannacht"} · {SETTING[line.setting]}: {line.rule}
        </p>
      </div>
    </li>
  )
}

function Task({ item }: { readonly item: Waiting }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        <span className="hidden sm:flex">
          <GlyphTile size={28}>
            <item.glyph size={15} />
          </GlyphTile>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-pretty text-ink">{item.title}</p>
          <p className="text-sm text-pretty text-ink-2">{item.context}</p>
        </div>
      </div>
      <Link to={item.href} className={buttonClass("secondary", "sm")}>
        {item.action}
      </Link>
    </div>
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
