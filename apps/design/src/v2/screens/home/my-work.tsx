import { useState } from "react"
import { useDemo } from "../../demo.ts"
import { APPROVALS, KIND_LABEL, WAITING, WORK_SEEDS } from "../../fixtures/home.ts"
import type { MomentKind } from "../../fixtures/home.ts"
import { assignedTo } from "../../fixtures/inbox.ts"
import { Link, paths } from "../../router.tsx"
import { undoable } from "../../ui/acts.ts"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { ArrowUpRight, Calendar, ChevronDown, Clock, CornerDownLeft, Plus, Sparkle } from "../../ui/icons.tsx"
import { EmptyState } from "../../ui/states.tsx"
import {
  addDays,
  clockNow,
  dayAfter,
  dayLabel,
  daysFromToday,
  minutesOf,
  parseDue,
  TODAY_KEY,
  weekStart
} from "./dates.ts"
import { KIND_GLYPH } from "./kinds.ts"
import { addTodo, setDone, settle, snooze, toggleTodo, useHome } from "./store.ts"

/*
 * Mijn werk: everything that is yours to do, from across Insyte, by when. Your own list sits beside
 * the tasks on Start's queue, the tickets assigned to you, the supplier to call, the chargeback to
 * check, the invitation to chase, each with its kind and where it lives. A tick does the real thing
 * where there is one (a queue task is settled on the queue too); a proposal is not ticked here,
 * because deciding it is a decision: its row opens it on Overzicht. Anything can move to another
 * day. The quick add reads the day off the end of the line: "Kestrel bellen morgen".
 */

type Source = "todo" | "taak" | "voorstel" | "ticket" | "los"

type Work = {
  readonly id: string
  readonly source: Source
  readonly kind: MomentKind
  readonly title: string
  readonly record?: string
  readonly where: string
  readonly href: string
  readonly due?: string
  readonly time?: string
  readonly done: boolean
  readonly doneAt?: string
}

type Group = "late" | "today" | "next" | "later" | "none" | "done"

const GROUPS: ReadonlyArray<{ readonly id: Group; readonly label: string }> = [
  { id: "late", label: "Te laat" },
  { id: "today", label: "Vandaag" },
  { id: "next", label: "Deze week" },
  { id: "later", label: "Later" },
  { id: "none", label: "Zonder datum" },
  { id: "done", label: "Klaar vandaag" }
]

function groupOf(w: Work): Group {
  if (w.done) return "done"
  if (w.due === undefined) return "none"
  const n = daysFromToday(w.due)
  return n < 0 ? "late" : n === 0 ? "today" : n < 7 ? "next" : "later"
}

const pad = (n: number) => String(n).padStart(2, "0")
const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`

/** Every item, from the fixtures and this visit's state: one list, so the queue and this agree. */
function useWork(): ReadonlyArray<Work> {
  const demo = useDemo()
  const home = useHome()
  const moved = (w: Work): Work => {
    const day = home.snoozed[w.id]
    return day === undefined ? w : { ...w, due: day }
  }
  const tasks = WAITING.map((t): Work => {
    const settled = home.settled[t.id]
    const tomorrow = settled === "morgen" || t.deadline >= 24 * 60
    return {
      id: t.id,
      source: "taak",
      kind: t.id.startsWith("cb-") ? "chargeback" : t.href.includes("/inbox") ? "ticket" : "wachtrij",
      title: t.title,
      where: "Te doen vandaag",
      href: t.href,
      due: tomorrow ? dayAfter(1) : TODAY_KEY,
      time: clockOf(t.deadline % (24 * 60)),
      done: settled === "afgehandeld",
      ...(settled === "afgehandeld" ? { doneAt: home.done[t.id] ?? clockNow() } : {})
    }
  })
  const proposals = APPROVALS.map((a): Work => ({
    id: a.id,
    source: "voorstel",
    kind: "wachtrij",
    title: a.title,
    where: `Voorstel van ${a.agent}`,
    href: `${paths.home}?rij=${a.id}`,
    due: TODAY_KEY,
    time: a.due,
    done: demo.decisions[a.id] !== undefined
  }))
  const onQueue = new Set(WAITING.map((t) => t.href))
  const tickets = assignedTo("elena").filter((t) => !onQueue.has(paths.ticket(t.number))).map((t): Work => ({
    id: `ticket-${t.number}`,
    source: "ticket",
    kind: "ticket",
    title: t.subject,
    record: `#${t.number}`,
    where: "Inbox",
    href: paths.ticket(t.number),
    due: TODAY_KEY,
    ...(t.deadline === undefined ? {} : { time: t.deadline.at }),
    done: home.done[`ticket-${t.number}`] !== undefined,
    ...(home.done[`ticket-${t.number}`] === undefined ? {} : { doneAt: home.done[`ticket-${t.number}`] })
  }))
  const loose = WORK_SEEDS.map((s): Work => {
    const at = s.doneAt ?? home.done[s.id]
    return {
      id: s.id,
      source: "los",
      kind: s.kind,
      title: s.title,
      ...(s.record === undefined ? {} : { record: s.record }),
      where: s.where,
      href: s.href,
      ...(s.day === undefined ? {} : { due: dayAfter(s.day) }),
      ...(s.time === undefined ? {} : { time: s.time }),
      done: at !== undefined,
      ...(at === undefined ? {} : { doneAt: at })
    }
  })
  const todos = home.todos.map((t): Work => ({
    id: t.id,
    source: "todo",
    kind: "taak",
    title: t.text,
    where: "Je lijst",
    href: `${paths.home}?weergave=werk`,
    ...(t.due === undefined ? {} : { due: t.due }),
    done: t.done,
    ...(t.done ? { doneAt: home.done[t.id] ?? clockNow() } : {})
  }))
  return [...tasks, ...proposals, ...tickets, ...loose, ...todos].map(moved)
}

/** What "Vandaag" counts on the tab: open items due today or late. */
export function useDueToday() {
  return useWork().filter((w) => {
    const g = groupOf(w)
    return g === "late" || g === "today"
  }).length
}

export function MyWork() {
  const work = useWork()
  const [shut, setShut] = useState<Partial<Record<Group, boolean>>>({ later: true })
  const by = (g: Group) =>
    work.filter((w) => groupOf(w) === g).toSorted((a, b) =>
      g === "done"
        ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "")
        : (a.due ?? "").localeCompare(b.due ?? "") || minutesOf(a.time ?? "23:59") - minutesOf(b.time ?? "23:59")
    )
  const open = work.filter((w) => !w.done).length

  return (
    <div className="flex flex-col gap-6">
      <QuickAdd />
      {open === 0 && by("done").length === 0
        ? (
          <EmptyState glyph={Calendar} title="Niets op je lijst">
            Typ hierboven een taak, bijvoorbeeld ‘Leverancier bellen morgen’.
          </EmptyState>
        )
        : (
          <div className="flex flex-col gap-5">
            {GROUPS.map((g) => {
              const rows = by(g.id)
              if (rows.length === 0 && g.id !== "today") return null
              const closed = shut[g.id] === true
              return (
                <section key={g.id} aria-label={g.label} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-expanded={!closed}
                    onClick={() => setShut((s) => ({ ...s, [g.id]: !closed }))}
                    className="-mx-2 flex h-8 items-center gap-2 self-start rounded-sm px-2 hover:bg-hover"
                  >
                    <ChevronDown
                      size={14}
                      className={cx("text-ink-3 transition-transform", closed && "-rotate-90")}
                    />
                    <span className={cx("text-sm font-semibold", g.id === "late" ? "text-bad-ink" : "text-ink")}>
                      {g.label}
                    </span>
                    <span className="figure text-xs text-ink-3">{rows.length}</span>
                  </button>
                  {!closed && (
                    rows.length === 0
                      ? <p className="pl-6 text-sm text-ink-3">Niets meer voor vandaag.</p>
                      : (
                        <ul className="flex flex-col">
                          {rows.map((w) => <Row key={w.id} w={w} />)}
                        </ul>
                      )
                  )}
                </section>
              )
            })}
          </div>
        )}
    </div>
  )
}

function QuickAdd() {
  const [draft, setDraft] = useState("")
  const parsed = parseDue(draft)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (parsed.text === "") return
        addTodo(parsed.text, parsed.due)
        setDraft("")
      }}
      className="flex h-11 items-center gap-2.5 rounded-md bg-canvas pr-1.5 pl-3 ring-1 ring-line-strong ring-inset focus-within:ring-2 focus-within:ring-accent"
    >
      <Plus size={16} className="shrink-0 text-ink-3" />
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Taak toevoegen"
        placeholder="Taak toevoegen, met een dag erachter: ‘Kestrel bellen vrijdag’"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
      />
      {parsed.due !== undefined && (
        <span
          aria-live="polite"
          className="flex h-6 shrink-0 items-center gap-1 rounded-xs bg-accent-tint px-1.5 text-xs text-accent-ink"
        >
          <Calendar size={12} />
          {dayLabel(parsed.due)}
        </span>
      )}
      {draft.trim() !== "" && <Button type="submit" size="sm" variant="primary">Toevoegen</Button>}
    </form>
  )
}

function tick(w: Work) {
  const at = clockNow()
  if (w.source === "todo") {
    toggleTodo(w.id)
    setDone(w.id, w.done ? null : at)
    if (!w.done) {
      undoable("Taak afgevinkt", () => {
        toggleTodo(w.id)
        setDone(w.id, null)
      })
    }
  } else if (w.source === "taak") {
    settle(w.id, w.done ? null : "afgehandeld")
    setDone(w.id, w.done ? null : at)
    if (!w.done) undoable(`Afgehandeld: ${w.title}`, () => settle(w.id, null), "Ook van je wachtrij gehaald.")
  } else {
    setDone(w.id, w.done ? null : at)
    if (!w.done) undoable("Afgevinkt", () => setDone(w.id, null))
  }
}

function Row({ w }: { readonly w: Work }) {
  const home = useHome()
  const Glyph = KIND_GLYPH[w.kind]
  const late = groupOf(w) === "late"
  const seed = WORK_SEEDS.find((s) => s.id === w.id)
  const fixed = seed?.doneAt !== undefined
  return (
    <li className="group -mx-2 flex min-h-10 items-center gap-3 rounded-md px-2 transition-colors hover:bg-hover">
      {w.source === "voorstel" && !w.done
        ? (
          <Link
            to={w.href}
            aria-label={`Voorstel bekijken: ${w.title}`}
            title="Een voorstel uitvoeren is een beslissing: het opent op Overzicht"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs bg-accent-tint text-accent-ink"
          >
            <Sparkle size={11} />
          </Link>
        )
        : (
          <RowCheckbox
            checked={w.done}
            disabled={fixed || w.source === "voorstel"}
            onChange={() => tick(w)}
            label={w.title}
          />
        )}
      <Glyph
        size={15}
        className={cx("shrink-0", w.done ? "text-ink-4" : late ? "text-bad-ink" : "text-ink-3")}
        aria-label={KIND_LABEL[w.kind]}
      />
      <Link to={w.href} className="flex min-w-0 flex-1 flex-col py-1.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span
          className={cx(
            "min-w-0 truncate text-sm",
            w.done ? "text-ink-3 line-through decoration-ink-4" : "text-ink"
          )}
        >
          {w.title}
          {w.record !== undefined && <span className="figure font-medium">{" "}· {w.record}</span>}
        </span>
        <span className="shrink-0 truncate text-xs text-ink-3">
          {w.source === "voorstel" ? w.where : `in ${w.where}`}
        </span>
      </Link>
      <span className={cx("hidden shrink-0 items-center gap-1 text-xs sm:flex", late ? "text-bad-ink" : "text-ink-2")}>
        {home.snoozed[w.id] !== undefined && !w.done && (
          <Clock size={12} className="text-ink-3" aria-label="Verplaatst" />
        )}
        <span className="figure">
          {w.done
            ? `klaar ${w.doneAt ?? ""}`.trim()
            : w.due === undefined
            ? ""
            : `${dayLabel(w.due)}${w.time !== undefined && groupOf(w) === "today" ? ` ${w.time}` : ""}`}
        </span>
      </span>
      {!w.done && w.source !== "voorstel" && <Snooze w={w} />}
      <Link
        to={w.href}
        aria-label={`${w.title} openen`}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-selected hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <ArrowUpRight size={15} />
      </Link>
    </li>
  )
}

function Snooze({ w }: { readonly w: Work }) {
  const home = useHome()
  const moved = home.snoozed[w.id] !== undefined
  const choices = [
    { label: "Morgen", day: dayAfter(1) },
    { label: "Overmorgen", day: dayAfter(2) },
    { label: "Volgende week", day: addDays(weekStart(TODAY_KEY), 7) }
  ]
  return (
    <DropdownMenu
      label={`${w.title} verplaatsen`}
      placement="bottom-end"
      width="w-56"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`${w.title} naar een andere dag`}
          title="Naar een andere dag"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-selected hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
        >
          <Clock size={15} />
        </button>
      )}
    >
      <DropdownLabel>Verplaatsen naar</DropdownLabel>
      {choices.map((c) => (
        <DropdownItem
          key={c.label}
          hint={dayLabel(c.day)}
          onSelect={() => {
            const before = home.snoozed[w.id] ?? null
            snooze(w.id, c.day)
            undoable(`Verplaatst naar ${c.label.toLowerCase()}`, () => snooze(w.id, before))
          }}
        >
          {c.label}
        </DropdownItem>
      ))}
      {moved && (
        <>
          <DropdownSeparator />
          <DropdownItem glyph={CornerDownLeft} onSelect={() => snooze(w.id, null)}>
            Terug naar de eigen datum
          </DropdownItem>
        </>
      )}
    </DropdownMenu>
  )
}
