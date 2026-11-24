import { useEffect, useRef, useState } from "react"
import { decide, editDraft, tasksForYou, useDemo } from "../../demo.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { QUEUE, REDRAFTS } from "../../fixtures/home.ts"
import type { Approval, QueueEntry, Waiting } from "../../fixtures/home.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { undoable } from "../../ui/acts.ts"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Button, buttonClass } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Check, ChevronDown, RotateCcw } from "../../ui/icons.tsx"
import { Kbd } from "../../ui/kbd.tsx"
import { GlyphTile } from "../../ui/list.tsx"
import { Proposal } from "../../ui/proposal.tsx"
import type { ProposalState } from "../../ui/proposal.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { redraw, settle, useHome } from "./store.ts"
import type { Settled } from "./store.ts"

/*
 * "Te doen vandaag", worked like a queue. One list of what has to happen today, whoever does it,
 * ranked by what is at stake before the clock. J and K (or the arrows) walk the open rows, E does
 * the selected one (a proposal runs, a task is marked done), D sets it aside (a proposal is
 * ignored, a task moves to tomorrow), R has the agent draw its proposal again, Enter opens a task
 * where it is done. A decision is seen to land on its row, then the row leaves for "Afgehandeld" and
 * the next open row is selected, because triage is a run of decisions. Each one can be taken back
 * from its toast or from the done list.
 */

const firstName = ME.name.split(" ")[0] ?? ME.name

/** How many rows show before "Nog …": the three or four things that matter. */
const FIRST = 4
/** How long a decision stays on its row, seen to have happened, before the row leaves. */
const SETTLE_MS = 900

type Filter = "alles" | "jij" | "voorstellen"

/** Where a row stands: still open, or decided (by you or by the demo store's proposal state). */
function stateOf(
  entry: QueueEntry,
  decisions: ReturnType<typeof useDemo>["decisions"],
  settled: Readonly<Record<string, Settled>>
): "open" | "decided" {
  return entry.kind === "task"
    ? settled[entry.item.id] === undefined ? "open" : "decided"
    : decisions[entry.item.id] === undefined
    ? "open"
    : "decided"
}

/** The proposal's text as drawn now: the fixture's draft, or the agent's later version after R. */
function draftOf(item: Approval, version: number): string {
  if (version === 0) return item.draft
  const alternatives = REDRAFTS[item.id] ?? []
  return alternatives[(version - 1) % Math.max(1, alternatives.length)] ?? item.draft
}

export function Queue({ active }: { readonly active: boolean }) {
  const demo = useDemo()
  const home = useHome()
  const [filter, setFilter] = useState<Filter>("alles")
  const [selected, setSelected] = useState<string | null>(null)
  const [settling, setSettling] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const rows = useRef(new Map<string, HTMLLIElement>())

  const inFilter = (e: QueueEntry) =>
    filter === "alles" || (filter === "jij" ? e.kind === "task" : e.kind === "proposal")
  const isOpen = (e: QueueEntry) => stateOf(e, demo.decisions, home.settled) === "open"
  const open = QUEUE.filter((e) => inFilter(e) && (isOpen(e) || e.item.id === settling))
  const decided = QUEUE.filter((e) => !isOpen(e) && e.item.id !== settling)
  const shown = more ? open : open.slice(0, FIRST)
  const hidden = open.slice(FIRST)
  const firstOpenProposal = open.find((e) => e.kind === "proposal" && isOpen(e))?.item.id
  const current = open.find((e) => e.item.id === selected)
  const count = (f: Filter) =>
    QUEUE.filter((e) => isOpen(e) && (f === "alles" || (f === "jij" ? e.kind === "task" : e.kind === "proposal")))
      .length

  const select = (id: string | null) => {
    setSelected(id)
    if (id === null) return
    const at = open.findIndex((e) => e.item.id === id)
    if (at >= FIRST) setMore(true)
    window.requestAnimationFrame(() => rows.current.get(id)?.scrollIntoView({ block: "nearest" }))
  }

  /** The next open row after `id`, else the first one left. */
  const nextAfter = (id: string) => {
    const left = open.filter((e) => e.item.id !== id && isOpen(e))
    const at = open.findIndex((e) => e.item.id === id)
    return left.find((e) => open.indexOf(e) > at) ?? left[0] ?? null
  }

  /** A decision lands on its row, then the row leaves and the next one is selected. */
  const land = (id: string) => {
    setSettling(id)
    const next = nextAfter(id)
    window.setTimeout(() => {
      setSettling(null)
      setSelected((now) => (now === id ? next?.item.id ?? null : now))
    }, SETTLE_MS)
  }

  const decideProposal = (item: Approval, next: ProposalState) => {
    decide(item.id, next)
    if (next === "open") return
    land(item.id)
    undoable(
      next === "done" ? `Uitgevoerd: ${item.title}` : `Genegeerd: ${item.title}`,
      () => decide(item.id, "open"),
      next === "done" ? undefined : "Er is niets verstuurd of veranderd."
    )
  }

  const settleTask = (item: Waiting, how: Settled) => {
    settle(item.id, how)
    land(item.id)
    undoable(
      how === "afgehandeld" ? `Afgehandeld: ${item.title}` : `Naar morgen: ${item.title}`,
      () => settle(item.id, null)
    )
  }

  const redrawProposal = (item: Approval) => {
    const version = (home.versions[item.id] ?? 0) + 1
    const before = home.versions[item.id] ?? 0
    const edit = demo.drafts[item.id]
    redraw(item.id, version)
    editDraft(item.id, undefined)
    undoable(`${item.agent} schreef een nieuwe versie`, () => {
      redraw(item.id, before)
      editDraft(item.id, edit)
    })
  }

  // Arriving with `?rij=` (from the agenda or Mijn werk) selects that row.
  const asked = useQuery("rij")
  useEffect(() => {
    if (asked === null) return
    const entry = QUEUE.find((e) => e.item.id === asked)
    if (entry !== undefined) {
      setFilter("alles")
      setSelected(entry.item.id)
      setMore(QUEUE.indexOf(entry) >= FIRST)
      window.requestAnimationFrame(() =>
        rows.current.get(entry.item.id)?.scrollIntoView({ block: "center", behavior: "smooth" })
      )
    }
    setQuery({ rij: null })
  }, [asked])

  // The keyboard is how a queue is worked: inert while typing, in a dialog or a menu.
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], dialog, [role=menu], [role=dialog]")) return
      const live = open.filter(isOpen)
      const at = live.findIndex((e) => e.item.id === selected)
      const key = event.key.toLowerCase()
      if (key === "j" || event.key === "ArrowDown") {
        if (event.key === "ArrowDown" && target?.closest("[role=radiogroup], [role=tablist]")) return
        event.preventDefault()
        select((live[at + 1] ?? live[0])?.item.id ?? null)
      } else if (key === "k" || event.key === "ArrowUp") {
        if (event.key === "ArrowUp" && target?.closest("[role=radiogroup], [role=tablist]")) return
        event.preventDefault()
        select((live[at - 1] ?? live.at(-1))?.item.id ?? null)
      } else if (event.key === "Escape" && selected !== null) {
        setSelected(null)
      } else if (current !== undefined && settling === null && isOpen(current)) {
        if (key === "e") {
          event.preventDefault()
          if (current.kind === "proposal") decideProposal(current.item, "done")
          else settleTask(current.item, "afgehandeld")
        } else if (key === "d") {
          event.preventDefault()
          if (current.kind === "proposal") decideProposal(current.item, "discarded")
          else settleTask(current.item, "morgen")
        } else if (key === "r" && current.kind === "proposal") {
          event.preventDefault()
          redrawProposal(current.item)
        } else if (event.key === "Enter" && current.kind === "task" && target === document.body) {
          event.preventDefault()
          navigate(current.item.href)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Segmented
          size="sm"
          label="Wat de wachtrij toont"
          value={filter}
          options={[
            { value: "alles", label: `Alles ${count("alles")}` },
            { value: "jij", label: `Voor jou ${count("jij")}` },
            { value: "voorstellen", label: `Voorstellen ${count("voorstellen")}` }
          ]}
          onChange={(next) => {
            setFilter(next)
            setSelected(null)
          }}
        />
        <p className="hidden items-center gap-1.5 text-2xs text-ink-3 pointer-fine:flex" aria-hidden="true">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> kiezen · <Kbd>E</Kbd> doen · <Kbd>D</Kbd> wegleggen · <Kbd>R</Kbd> opnieuw opstellen
        </p>
      </div>

      {open.length === 0
        ? (
          <p className="py-4 text-sm text-pretty text-ink-2">
            {filter === "alles"
              ? "Alles van vandaag is gedaan. Nieuwe dingen verschijnen bovenaan, op volgorde van wat er op het spel staat."
              : filter === "jij"
              ? `Je ${tasksForYou()} taken van vandaag zijn afgehandeld of naar morgen gezet.`
              : "Hier staat nu niets meer open."}
          </p>
        )
        : (
          <ol className="flex flex-col" aria-label="Te doen vandaag, op volgorde">
            {shown.map((entry) => {
              const id = entry.item.id
              const here = id === selected
              const landing = id === settling
              return (
                <li
                  key={id}
                  ref={(el) => {
                    if (el === null) rows.current.delete(id)
                    else rows.current.set(id, el)
                  }}
                  aria-current={here ? "true" : undefined}
                  onClick={() => setSelected(id)}
                  className={cx(
                    "-mx-3 grid gap-x-4 gap-y-1.5 rounded-md px-3 py-2.5 transition-[background-color,opacity] duration-200 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2 sm:py-3",
                    here && !landing && "bg-selected",
                    landing && "opacity-60"
                  )}
                >
                  <When
                    entry={entry}
                    onRedraw={entry.kind === "proposal"
                      ? () => redrawProposal(entry.item)
                      : undefined}
                  />
                  {entry.kind === "task"
                    ? (
                      <Task
                        item={entry.item}
                        settled={home.settled[id]}
                        onSettle={(how) => settleTask(entry.item, how)}
                      />
                    )
                    : (
                      <QueueProposal
                        item={entry.item}
                        version={home.versions[id] ?? 0}
                        primary={id === firstOpenProposal}
                        onChange={(next) => decideProposal(entry.item, next)}
                      />
                    )}
                </li>
              )
            })}
          </ol>
        )}

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

      {decided.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen(!doneOpen)}
            className="flex items-center gap-1.5 self-start rounded-sm py-1 text-sm text-ink-3 hover:text-ink"
          >
            <ChevronDown size={15} className={cx("transition-transform", !doneOpen && "-rotate-90")} />
            Afgehandeld vandaag <span className="figure">{decided.length}</span>
          </button>
          {doneOpen && (
            <ol className="flex flex-col" aria-label="Afgehandeld vandaag">
              {decided.map((entry) => (
                <li
                  key={entry.item.id}
                  className="grid gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
                >
                  <p className="figure pt-0.5 text-sm text-ink-3">{entry.item.due === "nu" ? "Nu" : entry.item.due}</p>
                  {entry.kind === "task"
                    ? <SettledTask item={entry.item} how={home.settled[entry.item.id]} />
                    : (
                      <QueueProposal
                        item={entry.item}
                        version={home.versions[entry.item.id] ?? 0}
                        primary={false}
                        onChange={(next) => decideProposal(entry.item, next)}
                      />
                    )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

/** When it is due, why it ranks where it does, and who acts: one line on a phone, a column beside it. */
function When({ entry, onRedraw }: { readonly entry: QueueEntry; readonly onRedraw: (() => void) | undefined }) {
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
      {onRedraw !== undefined && (
        <button
          type="button"
          onClick={onRedraw}
          className="hidden min-h-7 items-center gap-1 text-2xs text-ink-3 hover:text-ink sm:inline-flex"
        >
          <RotateCcw size={12} />
          Opnieuw opstellen
        </button>
      )}
    </div>
  )
}

/** An agent's proposal on the queue, at the version it is drawn at; the decision is the demo store's. */
function QueueProposal({ item, version, primary, onChange }: {
  readonly item: Approval
  readonly version: number
  readonly primary: boolean
  readonly onChange: (next: ProposalState) => void
}) {
  const demo = useDemo()
  const decision = demo.decisions[item.id]
  const agent = AGENTS.find((a) => a.id === item.agentId)
  return (
    <div className="grid gap-x-3 sm:grid-cols-[28px_minmax(0,1fr)]">
      {agent !== undefined && (
        <span className="hidden sm:flex">
          <AgentAvatar glyph={agent.glyph} size={28} />
        </span>
      )}
      <Proposal
        from={
          <>
            <Link to={paths.agent(item.agentId)} className="truncate font-medium text-ink-2 hover:underline">
              {item.agent}
            </Link>
            <span className="figure shrink-0">{item.at}</span>
            {version > 0 && (
              <span className="shrink-0">
                · versie <span className="figure">{version + 1}</span>
              </span>
            )}
          </>
        }
        title={item.title}
        body={item.why}
        read={item.read}
        draft={draftOf(item, version)}
        state={decision?.state ?? "open"}
        decidedAt={decision?.at}
        onChange={onChange}
        primary={primary}
        sends={item.sends === true}
        doneBy={firstName}
        fold
        edit={demo.drafts[item.id]}
        onEdit={(text) => editDraft(item.id, text)}
      />
    </div>
  )
}

/** A task of yours: the thing, where it is done, and two ways to settle it here. */
function Task({ item, settled, onSettle }: {
  readonly item: Waiting
  readonly settled: Settled | undefined
  readonly onSettle: (how: Settled) => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        <span className="hidden sm:flex">
          <GlyphTile size={28}>
            <item.glyph size={15} />
          </GlyphTile>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={cx("text-sm font-semibold text-pretty", settled === undefined ? "text-ink" : "text-ink-3")}>
            {item.title}
          </p>
          <p className="text-sm text-pretty text-ink-2">{item.context}</p>
        </div>
      </div>
      {settled === undefined
        ? (
          <div className="flex flex-wrap items-center gap-1">
            <Link to={item.href} className={buttonClass("secondary", "sm")}>
              {item.action}
            </Link>
            <Button variant="ghost" size="sm" onClick={() => onSettle("afgehandeld")}>Afgehandeld</Button>
            <Button variant="ghost" size="sm" onClick={() => onSettle("morgen")}>Morgen</Button>
          </div>
        )
        : (
          <p role="status" className="flex items-center gap-1.5 text-xs text-good-ink">
            <Check size={14} />
            {settled === "afgehandeld" ? "Afgehandeld" : "Naar morgen"}
          </p>
        )}
    </div>
  )
}

function SettledTask({ item, how }: { readonly item: Waiting; readonly how: Settled | undefined }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="min-w-0 flex-1 basis-64 text-sm text-pretty text-ink-3 line-through decoration-ink-4">
        {item.title}
      </p>
      <p className="flex items-center gap-2 text-xs text-ink-3">
        {how === "morgen" ? "Naar morgen" : `Afgehandeld door ${firstName}`}
        <button
          type="button"
          onClick={() => settle(item.id, null)}
          className="inline-flex min-h-8 items-center font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          Terugzetten
        </button>
      </p>
    </div>
  )
}
