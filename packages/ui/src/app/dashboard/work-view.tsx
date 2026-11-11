import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { createContext, useContext, useMemo, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { ArrowUpRight, Calendar, ChevronDown, Clock, CornerDownLeft, Plus, Sparkle } from "../../icons"
import { EmptyPage } from "../common/empty-page"
import { Glyph } from "../common/glyph"
import { addDays, clock, dayLabel, parseDue } from "../lib/home/dates"
import { groupOf, KIND, WORK_GROUPS, type WorkGroup, type WorkItem } from "../lib/home/kinds"
import { cn } from "../lib/utils"
import { Struck, TickBox } from "./setup-checklist"

/** What a row's controls do: the demo's stores, or the console's commands and the member's `my_work` preference. */
export interface WorkActions {
  /** The items moved to another day, by item id. */
  readonly snoozed: Readonly<Record<string, string>>
  readonly add: (text: string, due: string | undefined) => void
  readonly tick: (w: WorkItem) => void
  readonly snooze: (w: WorkItem, day: string, label: string) => void
  readonly unsnooze: (w: WorkItem) => void
}

const Actions = createContext<WorkActions | null>(null)

const useActions = () => {
  const actions = useContext(Actions)
  if (actions === null) throw new Error("A work row outside MyWorkView")
  return actions
}

/**
 * My work, as ClickUp keeps it: everything that is yours to do from across the console, by when.
 * Your own to-dos sit beside the tickets assigned to you, the queue rows waiting on you, the
 * suppliers to chase, the chargeback deadlines and the invitations to follow up, each with its kind's
 * glyph and where it lives. A tick does the real thing where there is one (a ticket closes), a
 * proposal opens its plate because filing it is a decision, and anything can be moved to another
 * day. The quick add reads the date off the end of the line: "Linyi bellen morgen".
 *
 * The list over plain items: grouped by when, each with its tick, its record and its snooze. A snoozed item
 * arrives with its new day as `due`; `actions.snoozed` only marks it.
 */
export function MyWorkView(
  { now, work, actions }: { now: number; work: ReadonlyArray<WorkItem>; actions: WorkActions }
) {
  const [collapsed, setCollapsed] = useState<Partial<Record<WorkGroup, boolean>>>({ later: true })
  const groups = useMemo(() => {
    const by: Record<WorkGroup, WorkItem[]> = { late: [], today: [], next: [], later: [], none: [], done: [] }
    for (const w of work) {
      const g = groupOf(w, now)
      if (g) by[g].push(w)
    }
    const t = (w: WorkItem) => w.time ?? (w.due ? Date.parse(`${w.due}T12:00:00`) : 0)
    for (const g of Object.values(by)) g.sort((a, b) => t(a) - t(b))
    by.done.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    return by
  }, [work, now])
  const open = work.filter((w) => !w.done).length

  return (
    <Actions.Provider value={actions}>
      <div className="flex flex-col gap-4">
        <QuickAdd />
        {open === 0 && groups.done.length === 0 ?
          (
            <div className="rounded-xl bg-paper px-6">
              <EmptyPage
                kind="tasks"
                count="0 taken"
                title="Niets op je lijst"
                body="Typ hierboven een taak, bijvoorbeeld “Leverancier bellen morgen”."
                starts={[
                  {
                    id: "tickets",
                    label: "Tickets aan jou toewijzen",
                    body: "Elk ticket dat je oppakt, met deadline.",
                    to: "/tickets"
                  },
                  { id: "team", label: "Je team uitnodigen", body: "Werk geven aan een collega.", to: "/settings/team" }
                ]}
              />
            </div>
          ) :
          (
            <div className="flex flex-col gap-3">
              {WORK_GROUPS.map((g) => {
                const rows = groups[g.id]
                if (rows.length === 0 && g.id !== "today") return null
                const shut = collapsed[g.id] === true
                return (
                  <section key={g.id} aria-label={g.label} className="rounded-xl bg-paper px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !shut }))}
                      aria-expanded={!shut}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-ink/4"
                    >
                      <ChevronDown
                        className={cn("size-3.5 text-ink-3 transition-transform", shut && "-rotate-90")}
                        strokeWidth={2}
                      />
                      <span className={cn("font-medium text-md", g.id === "late" ? "text-signal-red" : "text-ink")}>
                        {g.label}
                      </span>
                      <span className="text-sm text-ink-3 tabular-nums">{rows.length}</span>
                    </button>
                    {shut ?
                      null :
                      rows.length === 0 ?
                      <p className="px-9 pt-1 pb-2 text-sm text-ink-3">Niets meer voor vandaag.</p> :
                      (
                        <ul className="flex flex-col pt-0.5">
                          <AnimatePresence initial={false}>
                            {rows.map((w, i) => <Row key={w.id} w={w} now={now} banded={i % 2 === 1} />)}
                          </AnimatePresence>
                        </ul>
                      )}
                  </section>
                )
              })}
            </div>
          )}
      </div>
    </Actions.Provider>
  )
}

function QuickAdd() {
  const { add: addTodo } = useActions()
  const [draft, setDraft] = useState("")
  const parsed = parseDue(draft)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!parsed.text) return
        addTodo(parsed.text, parsed.due)
        setDraft("")
      }}
      className="field flex h-11 items-center gap-2.5 rounded-xl bg-paper pr-1.5 pl-3.5 focus-within:bg-paper"
    >
      <Plus className="size-4 shrink-0 text-ink-3" strokeWidth={2} />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Taak toevoegen, met een dag erachter: “Linyi bellen vrijdag”"
        aria-label="Taak toevoegen"
        className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
      />
      {parsed.due ?
        (
          <span
            className="flex h-6 shrink-0 items-center gap-1 rounded-sm bg-arc-tint px-1.5 text-xs text-arc-ink"
            aria-live="polite"
          >
            <Calendar className="size-3" strokeWidth={1.75} />
            {dayLabel(parsed.due)}
          </span>
        ) :
        null}
      {draft.trim() ?
        (
          <button
            type="submit"
            className="h-8 shrink-0 cursor-pointer rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
          >
            Toevoegen
          </button>
        ) :
        null}
    </form>
  )
}

const TONE_DOT: Record<WorkItem["tone"], string> = {
  red: "text-signal-red",
  amber: "text-signal-amber",
  arc: "text-arc-ink",
  green: "text-signal-green",
  ink: "text-ink-3"
}

function Row({ w, now, banded }: { w: WorkItem; now: number; banded: boolean }) {
  const still = useReducedMotion()
  const actions = useActions()
  const snoozed = actions.snoozed[w.id]
  const k = KIND[w.kind]
  const late = !w.done && w.due !== undefined && groupOf(w, now) === "late"
  const tick = () => actions.tick(w)

  return (
    <motion.li
      layout={still ? false : "position"}
      initial={still ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          "group/w glyph-host flex min-h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/4",
          banded && "bg-mist"
        )}
      >
        {w.check === "plate" && !w.done ?
          (
            <Link
              to={w.to}
              search={w.search as never}
              aria-label={`Voorstel voor ${w.title} bekijken`}
              title="Een voorstel uitvoeren is een beslissing: het opent op de start"
              className="flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-arc-tint text-arc-ink"
            >
              <Sparkle className="size-2.5" strokeWidth={2} />
            </Link>
          ) :
          <TickBox done={w.done} round={w.check === "todo"} onToggle={tick} label={w.title} />}
        <Glyph
          icon={k.icon}
          size={14}
          draw={false}
          className={cn("shrink-0", w.done ? "text-ink-4" : TONE_DOT[w.tone])}
        />
        <Link
          to={w.to}
          search={w.search as never}
          className="flex min-w-0 flex-1 flex-col py-1.5 leading-tight sm:flex-row sm:items-baseline sm:gap-2"
        >
          <span className={cn("min-w-0 truncate text-base", w.done ? "text-ink-3" : "text-ink")}>
            <Struck on={w.done}>
              {w.title}
              {w.record ? <span className="font-medium tabular-nums">· {w.record}</span> : null}
            </Struck>
          </span>
          <span className="shrink-0 truncate text-xs text-ink-3">in {w.where}</span>
        </Link>
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 text-sm tabular-nums sm:flex",
            late ? "text-signal-red" : "text-ink-2"
          )}
        >
          {snoozed && !w.done
            ? <Clock className="size-3 text-ink-3" strokeWidth={1.75} aria-label="Uitgesteld" />
            : null}
          {w.done
            ? (w.doneAt ? `klaar ${clock(w.doneAt)}` : "klaar")
            : w.due
            ? `${dayLabel(w.due, now)}${w.time && groupOf(w, now) === "today" ? ` ${clock(w.time)}` : ""}`
            : ""}
        </span>
        {w.done ? null : <Snooze w={w} now={now} />}
        <Link
          to={w.to}
          search={w.search as never}
          aria-label={`${w.title} openen`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/w:opacity-100"
        >
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </motion.li>
  )
}

function Snooze({ w, now }: { w: WorkItem; now: number }) {
  const actions = useActions()
  const snoozed = actions.snoozed[w.id]
  const monday = addDays(now, ((8 - new Date(now).getDay()) % 7) || 7)
  const choices = [
    { id: "tomorrow", label: "Morgen", day: addDays(now, 1) },
    { id: "after", label: "Overmorgen", day: addDays(now, 2) },
    { id: "monday", label: "Volgende week", day: monday }
  ]
  const move = (day: string, label: string) => actions.snooze(w, day, label)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${w.title} uitstellen`}
          title="Uitstellen"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/w:opacity-100 data-[popup-open]:opacity-100"
        >
          <Clock className="size-3.5" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Uitstellen tot</DropdownMenuLabel>
        {choices.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => move(c.day, c.label)}>
            <span className="flex-1">{c.label}</span>
            <span className="text-xs text-ink-3">{dayLabel(c.day, now)}</span>
          </DropdownMenuItem>
        ))}
        {snoozed ?
          (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => actions.unsnooze(w)}>
                <CornerDownLeft className="size-3.5" strokeWidth={1.75} />
                Terug naar de eigen datum
              </DropdownMenuItem>
            </>
          ) :
          null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
