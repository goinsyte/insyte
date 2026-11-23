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
 */

export type Command = {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly glyph?: Glyph
  /** A clause after the label: "Bestelling · € 129,00". */
  readonly meta?: string
  readonly shortcut?: string
  /** Extra words it is found by. */
  readonly keywords?: string
  readonly run: () => void
}

const norm = (s: string) => s.toLocaleLowerCase("nl-NL").normalize("NFD").replace(/\p{Diacritic}/gu, "")

export function CommandPanel({ commands, onRun, onAsk, autoFocus = false, askLabel }: {
  readonly commands: ReadonlyArray<Command>
  readonly onRun: (command: Command) => void
  /** What happens to a query nothing matches: a new chat with it. */
  readonly onAsk?: (query: string) => void
  readonly autoFocus?: boolean
  readonly askLabel?: (query: string) => ReactNode
}) {
  const [query, setQuery] = useState("")
  const [at, setAt] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()

  const found = useMemo(() => {
    const q = norm(query.trim())
    return q === "" ? commands : commands.filter((c) => norm(`${c.label} ${c.group} ${c.keywords ?? ""}`).includes(q))
  }, [commands, query])
  const ask = onAsk !== undefined && query.trim() !== ""
  const total = found.length + (ask ? 1 : 0)

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
    const command = found[index]
    if (command !== undefined) onRun(command)
    else if (ask) onAsk?.(query.trim())
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

  const groups = [...new Set(found.map((c) => c.group))]
  let index = -1

  return (
    <div className="flex max-h-[min(30rem,calc(100dvh-6rem))] w-full flex-col overflow-hidden rounded-lg bg-canvas text-ink shadow-pop ring-1 ring-line">
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
          placeholder="Zoek een pagina, bestelling of klant, of typ een vraag"
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
        {groups.map((group) => (
          <li key={group} role="presentation" className="pb-1">
            <p className="px-2.5 pt-2 pb-1 text-2xs font-medium text-ink-3">{group}</p>
            <ul role="group" aria-label={group}>
              {found.filter((c) => c.group === group).map((command) => {
                index += 1
                const i = index
                const G = command.glyph
                return (
                  <li
                    key={command.id}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={i === at}
                    data-index={i}
                    onPointerMove={() => setAt(i)}
                    onClick={() =>
                      run(i)}
                    className={cx(
                      "flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm",
                      i === at ? "bg-selected text-ink" : "text-ink-2"
                    )}
                  >
                    {G !== undefined && <G size={16} className="shrink-0 text-ink-3" />}
                    <span className="min-w-0 truncate">{command.label}</span>
                    {command.meta !== undefined && (
                      <span className="min-w-0 truncate text-xs text-ink-3">{command.meta}</span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {command.shortcut !== undefined && <Kbd>{command.shortcut}</Kbd>}
                      {i === at && <CornerDownLeft size={14} className="text-ink-3" />}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {ask && (
          <li
            id={`${id}-${found.length}`}
            role="option"
            aria-selected={at === found.length}
            data-index={found.length}
            onPointerMove={() => setAt(found.length)}
            onClick={() => run(found.length)}
            className={cx(
              "mt-1 flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm",
              at === found.length ? "bg-selected" : ""
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
      </p>
    </div>
  )
}

export function CommandPalette({ open, onClose, commands, onAsk, askLabel }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly commands: ReadonlyArray<Command>
  readonly onAsk?: (query: string) => void
  readonly askLabel?: (query: string) => ReactNode
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
