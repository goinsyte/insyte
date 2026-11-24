import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { AREA_LABEL, level, LEVEL_LABEL, rolLabel, useView } from "../view.ts"
import type { Level, PermArea, Rol } from "../view.ts"
import { cx } from "./cx.ts"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "./dropdown.tsx"

/*
 * What a list can do to the rows it has ticked, said once. One list of actions feeds three ways in,
 * so they cannot disagree: the buttons on the selection bar (`bar`), the Acties menu (every action,
 * and ⌘K while rows are ticked) and a single key that runs one without opening anything.
 *
 * An action can apply to some rows only (wissen applies to the unread ones): it runs on those, and
 * the menu says how many ("3 van 5"). One that applies to none, or that the role may not do, stays
 * in the list, disabled, and says why, rather than vanishing.
 */

export type RowAction<T> = {
  readonly id: string
  readonly label: string
  readonly icon?: ReactNode
  /** The heading it sits under in the Acties menu. */
  readonly group?: string
  /** One key, pressed with rows ticked and no field focused. */
  readonly shortcut?: string
  /** Also a button on the bar. Keep it to two or three. */
  readonly bar?: boolean
  readonly tone?: "default" | "danger"
  /** The rows it can do something with; the rest are skipped. Without it, every row. */
  readonly applies?: (row: T) => boolean
  /** The permission it takes. Without it the action stays listed, disabled, and names what is missing. */
  readonly needs?: { readonly area: PermArea; readonly level: Level }
  /** Runs on the rows it applies to. */
  readonly run: (rows: ReadonlyArray<T>) => void
}

/** An action on the ink bar: light text, so it keeps its contrast in both modes. */
export const BAR_ACTION =
  "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-on-ink hover:bg-on-ink/10 " +
  "disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5"

/** Whether a key press belongs to a field, a dialog or a menu rather than to the list. */
export const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement
  && target.closest("input, textarea, select, [contenteditable=true], dialog, [role=dialog], [role=menu]") !== null

/** The bar's actions and the Acties menu for the ticked `rows`; the selection bar draws them. */
export function BulkActions<T>({ rows, actions, onClear, as }: {
  readonly rows: ReadonlyArray<T>
  readonly actions: ReadonlyArray<RowAction<T>>
  readonly onClear: () => void
  /** Judge permissions as this role instead of the view's (the kit, a role preview). */
  readonly as?: Rol
}) {
  const view = useView()
  const rol = as ?? view.rol
  const menu = useRef<HTMLSpanElement>(null)
  const count = rows.length

  const usable = actions.map((action) => {
    const blocked = action.needs !== undefined && level({ ...view, rol }, action.needs.area) < action.needs.level
    const targets = blocked ? [] : action.applies === undefined ? rows : rows.filter(action.applies)
    return { action, targets, blocked }
  })

  const run = (action: RowAction<T>, targets: ReadonlyArray<T>) => {
    if (targets.length === 0) return
    action.run(targets)
    onClear()
  }

  // ⌘K belongs to the selection while there is one: caught before the shell's palette hears it.
  const latest = useRef({ usable, run, onClear })
  latest.current = { usable, run, onClear }
  useEffect(() => {
    if (count === 0) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        event.stopImmediatePropagation()
        menu.current?.querySelector("button")?.click()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      if (event.key === "Escape") {
        latest.current.onClear()
        return
      }
      const hit = latest.current.usable.find((u) => u.action.shortcut?.toLowerCase() === event.key.toLowerCase())
      if (hit === undefined) return
      event.preventDefault()
      latest.current.run(hit.action, hit.targets)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [count])

  const groups = [...new Set(usable.map((u) => u.action.group ?? "Acties"))]
  const blocked = usable.filter((u) => u.blocked)
  const need = blocked[0]?.action.needs

  return (
    <>
      {usable.filter((u) => u.action.bar === true).map(({ action, targets, blocked: no }) => (
        <button
          key={action.id}
          type="button"
          disabled={targets.length === 0}
          title={no ? `Je rol ${rolLabel(rol)} mag dit niet` : undefined}
          onClick={() => run(action, targets)}
          className={cx(BAR_ACTION, action.tone === "danger" && "[&_svg]:text-bad")}
        >
          {action.icon}
          {action.label}
          {targets.length > 0 && targets.length < count && (
            <span className="figure font-normal text-on-ink/70">{targets.length} van {count}</span>
          )}
          {action.shortcut !== undefined && (
            <span className="hidden min-w-4 rounded-xs bg-on-ink/12 px-1 text-center text-2xs font-normal sm:inline">
              {action.shortcut.toUpperCase()}
            </span>
          )}
        </button>
      ))}
      <span ref={menu} className="contents">
        <DropdownMenu
          label={`Acties voor ${count} gekozen`}
          width="w-72"
          trigger={(props) => (
            <button type="button" className={cx(BAR_ACTION, "bg-on-ink/10 hover:bg-on-ink/15")} {...props}>
              Acties
              <span className="hidden text-2xs font-normal text-on-ink/70 sm:inline">⌘K</span>
            </button>
          )}
        >
          {groups.map((group, i) => (
            <div key={group}>
              {i > 0 && <DropdownSeparator />}
              <DropdownLabel>{group}</DropdownLabel>
              {usable.filter((u) => (u.action.group ?? "Acties") === group).map(({ action, targets, blocked: no }) => (
                <DropdownItem
                  key={action.id}
                  tone={action.tone}
                  disabled={targets.length === 0}
                  hint={no
                    ? "geen toegang"
                    : targets.length === 0
                    ? "past bij geen"
                    : targets.length < count
                    ? `${targets.length} van ${count}`
                    : undefined}
                  shortcut={action.shortcut?.toUpperCase()}
                  onSelect={() => run(action, targets)}
                >
                  {action.label}
                </DropdownItem>
              ))}
            </div>
          ))}
          {need !== undefined && (
            <p className="px-2 pt-2 pb-1.5 text-2xs text-pretty text-ink-3">
              Je rol {rolLabel(rol)} mist {AREA_LABEL[need.area]} · {LEVEL_LABEL[need.level]}
              {blocked.length === 1 ? ` voor ${blocked[0]?.action.label.toLowerCase()}` : ""}.
            </p>
          )}
        </DropdownMenu>
      </span>
    </>
  )
}
