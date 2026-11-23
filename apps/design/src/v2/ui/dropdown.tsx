import { useId, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode, RefObject } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { cx } from "./cx.ts"
import { FloatingLayer } from "./floating.tsx"
import type { Placement } from "./floating.tsx"
import { Check } from "./icons.tsx"
import { Kbd } from "./kbd.tsx"

/*
 * A dropdown menu: actions on a record, the column picker, the avatar menu. The panel and its rows
 * are drawn by `DropdownPanel` and `DropdownItem` (so the kit and a static mock can show them open);
 * `DropdownMenu` adds the behaviour: it opens from its trigger, moves focus into the first row,
 * walks the rows with the arrow keys, Home and End, and closes on Escape, Tab, a press outside or a
 * chosen row. Not to be confused with the shell's `MenuItem` (a page in the sub-panel).
 */

const ROWS =
  "[role=menuitem]:not([disabled]),[role=menuitemcheckbox]:not([disabled]),[role=menuitemradio]:not([disabled])"

export function DropdownPanel({ children, label, className, width = "w-56" }: {
  readonly children: ReactNode
  readonly label?: string
  readonly className?: string
  readonly width?: string
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={cx("animate-rise rounded-md bg-canvas p-1 shadow-pop ring-1 ring-line", width, className)}
    >
      {children}
    </div>
  )
}

export function DropdownItem({ glyph: G, children, hint, shortcut, tone = "default", checked, disabled, onSelect }: {
  readonly glyph?: Glyph
  readonly children: ReactNode
  /** A word after the label ("vraagt eerst", "3"). */
  readonly hint?: string
  readonly shortcut?: string
  /** `danger` for the one row that deletes or cancels. */
  readonly tone?: "default" | "danger"
  /** A row that ticks on and off (a column in the picker) and keeps the menu open. */
  readonly checked?: boolean
  readonly disabled?: boolean
  readonly onSelect?: () => void
}) {
  const checkable = checked !== undefined
  return (
    <button
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? checked : undefined}
      data-keep-open={checkable || undefined}
      disabled={disabled}
      tabIndex={-1}
      onClick={onSelect}
      className={cx(
        "flex h-(--menu-row) w-full items-center gap-2.5 rounded-sm px-2 text-left text-sm transition-colors outline-none",
        "hover:bg-hover focus-visible:bg-hover focus-visible:outline-none disabled:pointer-events-none disabled:text-ink-4",
        tone === "danger" ? "text-bad-ink" : "text-ink"
      )}
    >
      {checkable
        ? (
          <span className="inline-flex size-4 shrink-0 items-center justify-center">
            {checked && <Check size={15} className="text-accent-ink" />}
          </span>
        )
        : G !== undefined && <G size={16} className={tone === "danger" ? "shrink-0" : "shrink-0 text-ink-3"} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint !== undefined && <span className="shrink-0 text-2xs text-ink-3">{hint}</span>}
      {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}

export function DropdownLabel({ children }: { readonly children: ReactNode }) {
  return <p className="px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-3">{children}</p>
}

export function DropdownSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-line" />
}

export type TriggerProps = {
  readonly ref: RefObject<HTMLButtonElement | null>
  readonly onClick: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  readonly "aria-haspopup": "menu" | "dialog"
  readonly "aria-expanded": boolean
  readonly "aria-controls"?: string
}

export function DropdownMenu({ trigger, children, label, placement = "bottom-start", width }: {
  /** The button that opens it; spread the props onto it. */
  readonly trigger: (props: TriggerProps) => ReactNode
  /** The rows; a function gets `close` for rows that do more than one thing. */
  readonly children: ReactNode | ((close: () => void) => ReactNode)
  readonly label: string
  readonly placement?: Placement
  readonly width?: string
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const id = useId()

  const rows = () => Array.from(layer.current?.querySelectorAll<HTMLElement>(ROWS) ?? [])
  const focusRow = (at: "first" | "last") =>
    window.requestAnimationFrame(() => {
      const all = rows()
      ;(at === "first" ? all[0] : all.at(-1))?.focus()
    })

  const show = (at: "first" | "last" = "first") => {
    setOpen(true)
    focusRow(at)
  }
  const close = () => setOpen(false)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = rows()
    const at = all.indexOf(document.activeElement as HTMLElement)
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      all[(at + step + all.length) % all.length]?.focus()
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      ;(event.key === "Home" ? all[0] : all.at(-1))?.focus()
    } else if (event.key === "Tab") {
      close()
    }
  }

  return (
    <>
      {trigger({
        ref: anchor,
        onClick: () => (open ? close() : show()),
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            show(event.key === "ArrowDown" ? "first" : "last")
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined
      })}
      <FloatingLayer
        open={open}
        onClose={close}
        anchor={anchor}
        placement={placement}
        id={id}
        layerRef={layer}
        onKeyDown={onKeyDown}
      >
        <div
          onClick={(event) => {
            const row = (event.target as HTMLElement).closest<HTMLElement>("[role^=menuitem]")
            if (row !== null && row.dataset["keepOpen"] === undefined) {
              close()
              anchor.current?.focus()
            }
          }}
        >
          <DropdownPanel label={label} width={width}>
            {typeof children === "function" ? children(close) : children}
          </DropdownPanel>
        </div>
      </FloatingLayer>
    </>
  )
}
