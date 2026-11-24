import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { cx } from "./cx.ts"
import { CornerDownLeft, Search } from "./icons.tsx"
import { Kbd } from "./kbd.tsx"
import { MagnusMark } from "./magnus-mark.tsx"

/*
 * The command palette (⌘K): one field that finds a page, a record or an action, and hands anything
 * it cannot find to Magnus. Results come in groups; the arrow keys walk them, Enter opens one,
 * Escape closes. `CommandPanel` is the surface (static in the kit), `CommandPalette` the modal.
 *
 * Records can be many: a command marked `searchOnly` shows only once something is typed, and with
 * `perGroup` a group shows its best few and says how many more there are. Every word typed has to
 * be found (‘aurora s’ finds the fleece in S); a label that starts with the query comes first. A
 * command that cannot run says why instead of hiding (`disabled`).
 */

export type Command = {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly glyph?: Glyph
  /** A clause after the label: "Bestelling · € 129,00". */
  readonly meta?: string
  /** One key ("T") or a chord drawn key by key (["⌘", "J"]). */
  readonly shortcut?: string | ReadonlyArray<string>
  /** Extra words it is found by. */
  readonly keywords?: string
  /** Shown only once something is typed: a record among hundreds. */
  readonly searchOnly?: boolean
  /** Why it cannot run now; it stays listed, greyed, with the reason. */
  readonly disabled?: string
  readonly run: () => void
}

const norm = (s: string) => s.toLocaleLowerCase("nl-NL").normalize("NFD").replace(/\p{Diacritic}/gu, "")

/** 0 when the label starts with the query, 1 when a word in it does, 2 for anything else found. */
function score(command: Command, q: string): number | null {
  const words = q.split(/\s+/).filter((w) => w !== "")
  const label = norm(command.label)
  const all = `${label} ${norm(command.meta ?? "")} ${norm(command.group)} ${norm(command.keywords ?? "")}`
  if (!words.every((w) => all.includes(w))) return null
  if (label.startsWith(q)) return 0
  return label.split(/[\s#·-]+/).some((part) => part.startsWith(words[0] ?? "")) ? 1 : 2
}

type Found = {
  readonly groups: ReadonlyArray<
    { readonly name: string; readonly items: ReadonlyArray<Command>; readonly total: number }
  >
}

function find(commands: ReadonlyArray<Command>, query: string, perGroup: number | undefined): Found {
  const q = norm(query.trim())
  const order: Array<string> = []
  const byGroup = new Map<string, Array<{ readonly command: Command; readonly score: number; readonly at: number }>>()
  commands.forEach((command, at) => {
    if (q === "" && command.searchOnly === true) return
    const s = q === "" ? 0 : score(command, q)
    if (s === null) return
    if (!byGroup.has(command.group)) {
      byGroup.set(command.group, [])
      order.push(command.group)
    }
    byGroup.get(command.group)?.push({ command, score: s, at })
  })
  return {
    groups: order.map((name) => {
      const all = (byGroup.get(name) ?? []).toSorted((a, b) => a.score - b.score || a.at - b.at)
      const limit = q === "" || perGroup === undefined ? all.length : perGroup
      return { name, items: all.slice(0, limit).map((x) => x.command), total: all.length }
    })
  }
}

export function CommandPanel(
  { commands, onRun, onAsk, autoFocus = false, askLabel, perGroup, placeholder, foot }: {
    readonly commands: ReadonlyArray<Command>
    readonly onRun: (command: Command) => void
    /** What happens to a query nothing matches: a new chat with it. */
    readonly onAsk?: (query: string) => void
    readonly autoFocus?: boolean
    readonly askLabel?: (query: string) => ReactNode
    /** While searching, the most a group shows; the rest is counted in its heading. */
    readonly perGroup?: number
    readonly placeholder?: string
    /** One more hint for the foot, right of the keys: "? sneltoetsen". */
    readonly foot?: ReactNode
  }
) {
  const [query, setQuery] = useState("")
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()

  const found = useMemo(() => find(commands, query, perGroup), [commands, query, perGroup])
  const flat = useMemo(() => found.groups.flatMap((g) => g.items), [found])
  const ask = onAsk !== undefined && query.trim() !== ""
  const total = flat.length + (ask ? 1 : 0)

  useEffect(() => setAt(0), [query])
  useEffect(() => {
    // Scroll only the list: `scrollIntoView` would also scroll every ancestor, the page included.
    const box = list.current
    const row = box?.querySelector<HTMLElement>(`[data-index="${at}"]`)
    if (box == null || row == null) return
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight
    }
  }, [at])

  const run = (index: number) => {
    const command = flat[index]
    if (command !== undefined) {
      if (command.disabled === undefined) onRun(command)
    } else if (ask) onAsk?.(query.trim())
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setAt((i) => (total === 0 ? 0 : (i + 1) % total))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setAt((i) => (total === 0 ? 0 : (i - 1 + total) % total))
    } else if (event.key === "Enter") {
      event.preventDefault()
      run(at)
    }
  }

  let index = -1

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-6rem))] w-full flex-col overflow-hidden rounded-lg bg-canvas text-ink shadow-pop ring-1 ring-line">
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search size={17} className="shrink-0 text-ink-3" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={id}
          aria-activedescendant={total > 0 ? `${id}-${at}` : undefined}
          aria-label="Zoeken of een opdracht"
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Zoek een pagina, bestelling of klant, of typ een vraag"}
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
        <Kbd>esc</Kbd>
      </div>
      <ul
        ref={list}
        id={id}
        role="listbox"
        aria-label="Resultaten"
        className="pane-scroll relative min-h-0 flex-1 p-1.5"
      >
        {found.groups.map((group) => (
          <li key={group.name} role="presentation" className="pb-1">
            <p className="flex items-baseline gap-2 px-2.5 pt-2 pb-1 text-2xs font-medium text-ink-3">
              {group.name}
              {group.total > group.items.length && (
                <span className="figure font-normal text-ink-4">{group.items.length} van {group.total}</span>
              )}
            </p>
            <ul role="group" aria-label={group.name}>
              {group.items.map((command) => {
                index += 1
                const i = index
                const G = command.glyph
                const off = command.disabled !== undefined
                const keys = command.shortcut === undefined
                  ? []
                  : typeof command.shortcut === "string"
                  ? [command.shortcut]
                  : command.shortcut
                return (
                  <li
                    key={command.id}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={i === at}
                    aria-disabled={off || undefined}
                    data-index={i}
                    onPointerMove={() => setAt(i)}
                    onClick={() => run(i)}
                    className={cx(
                      "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-sm",
                      off ? "cursor-default" : "cursor-pointer",
                      i === at ? "bg-selected" : "",
                      off ? "text-ink-4" : i === at ? "text-ink" : "text-ink-2"
                    )}
                  >
                    {G !== undefined && <G size={16} className={cx("shrink-0", off ? "text-ink-4" : "text-ink-3")} />}
                    <span className="max-w-[65%] min-w-0 shrink-0 truncate">{command.label}</span>
                    {(command.disabled ?? command.meta) !== undefined && (
                      <span className="min-w-0 truncate text-xs text-ink-3">{command.disabled ?? command.meta}</span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                      {i === at && !off && <CornerDownLeft size={14} className="text-ink-3" />}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {ask && (
          <li
            id={`${id}-${flat.length}`}
            role="option"
            aria-selected={at === flat.length}
            data-index={flat.length}
            onPointerMove={() => setAt(flat.length)}
            onClick={() => run(flat.length)}
            className={cx(
              "mt-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm",
              at === flat.length ? "bg-selected" : ""
            )}
          >
            <MagnusMark size={16} />
            <span className="min-w-0 truncate text-ai-ink">
              {askLabel?.(query.trim()) ?? <>Vraag: ‘{query.trim()}’</>}
            </span>
          </li>
        )}
        {total === 0 && <li className="px-3 py-8 text-center text-sm text-ink-3">Niets gevonden voor ‘{query}’.</li>}
      </ul>
      <p className="flex items-center gap-3 border-t border-line px-4 py-2 text-2xs text-ink-3">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> kiezen
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> openen
        </span>
        {foot !== undefined && <span className="ml-auto flex items-center gap-1">{foot}</span>}
      </p>
    </div>
  )
}

export function CommandPalette({ open, onClose, commands, onAsk, askLabel, perGroup, placeholder, foot }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly commands: ReadonlyArray<Command>
  readonly onAsk?: (query: string) => void
  readonly askLabel?: (query: string) => ReactNode
  readonly perGroup?: number
  readonly placeholder?: string
  readonly foot?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label="Zoeken"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl bg-transparent p-0 open:animate-rise backdrop:bg-scrim"
    >
      {open && (
        <CommandPanel
          autoFocus
          commands={commands}
          askLabel={askLabel}
          perGroup={perGroup}
          placeholder={placeholder}
          foot={foot}
          onRun={(command) => {
            onClose()
            command.run()
          }}
          onAsk={onAsk === undefined ? undefined : (query) => {
            onClose()
            onAsk(query)
          }}
        />
      )}
    </dialog>
  )
}
