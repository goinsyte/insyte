import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { DragEvent, KeyboardEvent } from "react"
import { Link } from "../../router.tsx"
import { undoable } from "../../ui/acts.ts"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GripVertical,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash
} from "../../ui/icons.tsx"
import { Popover } from "../../ui/popover.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { level, useView } from "../../view.ts"
import {
  addWidget,
  DEFAULT_BOARD,
  getBoard,
  moveWidget,
  removeWidget,
  resizeWidget,
  setBoard,
  useHome,
  WIDGET_IDS
} from "./store.ts"
import type { Placed, WidgetId, WidgetSize } from "./store.ts"
import { WIDGETS } from "./widgets.tsx"

/*
 * Start's board: every card on it is the operator's to place, the queue included. Cards pack in
 * their order into one, two or three columns by the board's own width, each to the top of the
 * shortest run of columns its width needs, so the columns stay level and nothing jumps out of turn.
 * "Aanpassen" turns the board into a layout: drag a card by its handle (or move it with the arrow
 * keys on the handle), pick its width, take it off; "Kaart toevoegen" puts one back; "Standaard"
 * restores the board a new workspace gets. Every change can be undone, and the board is kept in this
 * browser.
 */

const GAP_X = 40
const GAP_Y = 36
const columnsFor = (width: number) => (width >= 960 ? 3 : width >= 600 ? 2 : 1)

type Spot = { readonly x: number; readonly y: number; readonly w: number }

function pack(board: ReadonlyArray<Placed>, heights: Readonly<Record<string, number>>, width: number) {
  const cols = columnsFor(width)
  const col = (width - GAP_X * (cols - 1)) / cols
  const tops = Array.from({ length: cols }, () => 0)
  const spots: Record<string, Spot> = {}
  for (const card of board) {
    const span = card.size === 3 ? cols : Math.min(card.size, cols)
    let best = 0
    let bestTop = Number.POSITIVE_INFINITY
    for (let c = 0; c + span <= cols; c++) {
      const top = Math.max(...tops.slice(c, c + span))
      if (top < bestTop) {
        bestTop = top
        best = c
      }
    }
    spots[card.id] = { x: best * (col + GAP_X), y: bestTop, w: span * col + (span - 1) * GAP_X }
    const bottom = bestTop + (heights[card.id] ?? 240) + GAP_Y
    for (let c = best; c < best + span; c++) tops[c] = bottom
  }
  return { spots, height: Math.max(0, ...tops) - GAP_Y }
}

/** The cards this role may read: one without the permission is not drawn and not offered. */
function useAllowed() {
  const view = useView()
  return (id: WidgetId) => {
    const area = WIDGETS[id].area
    return area === undefined || level(view, area) > 0
  }
}

export function Board({ editing, active }: { readonly editing: boolean; readonly active: boolean }) {
  const { board } = useHome()
  const allowed = useAllowed()
  const cards = board.filter((card) => allowed(card.id))
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({})
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const [said, setSaid] = useState("")
  const lastSwap = useRef<{ readonly id: string; readonly at: number } | null>(null)

  useLayoutEffect(() => {
    const el = frame.current
    if (el === null) return
    const fit = () => setWidth(el.getBoundingClientRect().width)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onHeight = useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }))
  }, [])

  const { spots, height } = pack(cards, heights, width)

  /** Moves a card by one place in the order and says where it landed, for a screen reader. */
  const nudge = (id: WidgetId, step: -1 | 1) => {
    const from = board.findIndex((c) => c.id === id)
    const to = from + step
    if (from < 0 || to < 0 || to >= board.length) return
    moveWidget(from, to)
    setSaid(`${WIDGETS[id].title} staat nu op plek ${to + 1} van ${board.length}`)
  }

  const onDragOver = (event: DragEvent, over: WidgetId) => {
    if (dragging === null) return
    event.preventDefault()
    if (over === dragging) return
    const now = performance.now()
    if (lastSwap.current?.id === over && now - lastSwap.current.at < 300) return
    lastSwap.current = { id: over, at: now }
    const current = getBoard()
    moveWidget(current.findIndex((c) => c.id === dragging), current.findIndex((c) => c.id === over))
  }

  return (
    <>
      {cards.length === 0 && <EmptyBoard />}
      <div ref={frame} className="relative" style={{ height: width > 0 && cards.length > 0 ? height : 0 }}>
        {width > 0 && cards.map((card) => {
          const spot = spots[card.id]
          if (spot === undefined) return null
          const index = board.findIndex((c) => c.id === card.id)
          return (
            <Item
              key={card.id}
              card={card}
              spot={spot}
              measured={heights[card.id] !== undefined}
              onHeight={onHeight}
              editing={editing}
              active={active && !editing}
              lifted={dragging === card.id}
              first={index === 0}
              last={index === board.length - 1}
              onNudge={(step) => nudge(card.id, step)}
              drag={{
                onDragStart: (event) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", card.id)
                  setDragging(card.id)
                },
                onDragOver: (event) => onDragOver(event, card.id),
                onDrop: (event) => event.preventDefault(),
                onDragEnd: () => {
                  setDragging(null)
                  lastSwap.current = null
                }
              }}
            />
          )
        })}
      </div>
      <p role="status" className="sr-only">{said}</p>
    </>
  )
}

type Drag = {
  readonly onDragStart: (event: DragEvent) => void
  readonly onDragOver: (event: DragEvent) => void
  readonly onDrop: (event: DragEvent) => void
  readonly onDragEnd: () => void
}

function Item({ card, spot, measured, onHeight, editing, active, lifted, first, last, onNudge, drag }: {
  readonly card: Placed
  readonly spot: Spot
  readonly measured: boolean
  readonly onHeight: (id: string, h: number) => void
  readonly editing: boolean
  readonly active: boolean
  readonly lifted: boolean
  readonly first: boolean
  readonly last: boolean
  readonly onNudge: (step: -1 | 1) => void
  readonly drag: Drag
}) {
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = body.current
    if (el === null) return
    const fit = () => onHeight(card.id, Math.ceil(el.getBoundingClientRect().height))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [card.id, onHeight])

  return (
    <div
      className="absolute transition-[left,top,width] duration-300 ease-out motion-reduce:transition-none"
      style={{ left: spot.x, top: spot.y, width: spot.w, visibility: measured ? "visible" : "hidden" }}
      draggable={editing}
      onDragStart={editing ? drag.onDragStart : undefined}
      onDragOver={editing ? drag.onDragOver : undefined}
      onDrop={editing ? drag.onDrop : undefined}
      onDragEnd={editing ? drag.onDragEnd : undefined}
    >
      <div ref={body}>
        <Frame
          card={card}
          editing={editing}
          active={active}
          lifted={lifted}
          first={first}
          last={last}
          onNudge={onNudge}
        />
      </div>
    </div>
  )
}

function Frame({ card, editing, active, lifted, first, last, onNudge }: {
  readonly card: Placed
  readonly editing: boolean
  readonly active: boolean
  readonly lifted: boolean
  readonly first: boolean
  readonly last: boolean
  readonly onNudge: (step: -1 | 1) => void
}) {
  const def = WIDGETS[card.id]
  const id = `kaart-${card.id}`
  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault()
      onNudge(-1)
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault()
      onNudge(1)
    }
  }
  return (
    <section
      aria-labelledby={id}
      className={cx(
        "flex flex-col gap-3 rounded-lg transition-[outline-color,opacity] duration-150",
        editing && "bg-canvas outline-1 outline-offset-[10px] outline-line-strong outline-dashed",
        lifted && "opacity-40"
      )}
    >
      <header className="flex min-h-7 items-center gap-2">
        {editing && (
          <button
            type="button"
            aria-label={`${def.title} verplaatsen; pijltjes verschuiven de kaart`}
            title="Slepen of met de pijltjes verschuiven"
            onKeyDown={onGripKey}
            className="-ml-1.5 inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </button>
        )}
        <h2 id={id} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{def.title}</h2>
        {editing
          ? <CardMenu card={card} first={first} last={last} onNudge={onNudge} />
          : def.href !== undefined && (
            <Link to={def.href} className="flex shrink-0 items-center gap-0.5 text-xs text-ink-3 hover:text-ink">
              Openen
              <ChevronRight size={13} />
            </Link>
          )}
      </header>
      {/* While arranging, a card is something to move, not to use: clicks inside it would navigate. */}
      <div inert={editing || undefined} className={cx(editing && "pointer-events-none select-none")}>
        {def.render({ active })}
      </div>
    </section>
  )
}

const SIZES: ReadonlyArray<{ readonly size: WidgetSize; readonly label: string }> = [
  { size: 1, label: "Eén kolom" },
  { size: 2, label: "Twee kolommen" },
  { size: 3, label: "Volle breedte" }
]

function CardMenu({ card, first, last, onNudge }: {
  readonly card: Placed
  readonly first: boolean
  readonly last: boolean
  readonly onNudge: (step: -1 | 1) => void
}) {
  const def = WIDGETS[card.id]
  return (
    <DropdownMenu
      label={`Opties voor ${def.title}`}
      placement="bottom-end"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Opties voor ${def.title}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      <DropdownLabel>Breedte</DropdownLabel>
      {SIZES.map((s) => (
        <DropdownItem
          key={s.size}
          checked={card.size === s.size}
          onSelect={() => resizeWidget(card.id, s.size)}
        >
          {s.label}
        </DropdownItem>
      ))}
      <DropdownSeparator />
      <DropdownItem glyph={ArrowUp} disabled={first} onSelect={() => onNudge(-1)}>Eerder zetten</DropdownItem>
      <DropdownItem glyph={ArrowDown} disabled={last} onSelect={() => onNudge(1)}>Later zetten</DropdownItem>
      <DropdownSeparator />
      <DropdownItem
        glyph={Trash}
        tone="danger"
        onSelect={() => {
          const before = getBoard()
          removeWidget(card.id)
          undoable(`${def.title} van je bord gehaald`, () => setBoard(before))
        }}
      >
        Van het bord halen
      </DropdownItem>
    </DropdownMenu>
  )
}

/** Every card that is not on the board, each one click from being on it, with what it is for. */
export function AddCard({ variant = "secondary" }: { readonly variant?: "primary" | "secondary" | "ghost" }) {
  const { board } = useHome()
  const allowed = useAllowed()
  const offered = WIDGET_IDS.filter((id) => allowed(id) && !board.some((c) => c.id === id))
  return (
    <Popover
      label="Kaart toevoegen"
      placement="bottom-end"
      width="w-80"
      trigger={(props) => (
        <Button {...props} size="sm" variant={variant} icon={<Plus />}>
          Kaart toevoegen
        </Button>
      )}
    >
      {(close) =>
        offered.length === 0
          ? <p className="p-4 text-sm text-ink-2">Alle kaarten staan al op je bord.</p>
          : (
            <ul className="flex max-h-[min(28rem,70vh)] flex-col overflow-y-auto overscroll-contain p-1">
              {offered.map((id) => {
                const def = WIDGETS[id]
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        addWidget(id, def.size)
                        close()
                        undoable(`${def.title} op je bord gezet`, () => removeWidget(id))
                      }}
                      className="flex w-full items-start gap-3 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                    >
                      <def.glyph size={16} className="mt-0.5 shrink-0 text-ink-3" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm text-ink">{def.title}</span>
                        <span className="text-xs text-pretty text-ink-3">{def.blurb}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
    </Popover>
  )
}

/** Back to the board a new workspace gets, with the arrangement before it one undo away. */
function resetBoard() {
  const before = getBoard()
  setBoard(DEFAULT_BOARD)
  undoable("Bord teruggezet naar de standaardindeling", () => setBoard(before))
}

export function ResetButton() {
  return (
    <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={resetBoard}>
      Standaardindeling
    </Button>
  )
}

function EmptyBoard() {
  return (
    <EmptyState
      glyph={LayoutTemplate}
      title="Je bord is leeg"
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={resetBoard}>Standaardindeling terugzetten</Button>
          <AddCard />
        </div>
      }
    >
      Zet de kaarten terug die een nieuwe werkruimte krijgt, of kies zelf wat je bij het openen wilt zien.
    </EmptyState>
  )
}
