import { useId, useState } from "react"
import type { ReactNode } from "react"
import { cx } from "./cx.ts"
import { ChevronDown } from "./icons.tsx"

export type AccordionItem = {
  readonly id: string
  readonly title: string
  /** A short clause after the title, visible while it is closed ("3 regels"). */
  readonly meta?: string
  readonly children: ReactNode
}

/**
 * Sections that fold: the questions in a knowledge base, the groups of a long settings page, the
 * steps Magnus took. Space between, no rules; the chevron turns, and more than one can be open unless
 * `single` says otherwise. For a single "show more" use a `Disclosure`.
 */
export function Accordion({ items, single = false, defaultOpen = [] }: {
  readonly items: ReadonlyArray<AccordionItem>
  readonly single?: boolean
  readonly defaultOpen?: ReadonlyArray<string>
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(defaultOpen))
  const base = useId()
  const toggle = (id: string) =>
    setOpen((set) => {
      const next = new Set(single ? [] : set)
      if (set.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const isOpen = open.has(item.id)
        const panel = `${base}-${item.id}`
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(item.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xs py-2 text-left text-sm font-medium text-ink hover:text-ink-2"
              >
                <span className="min-w-0 flex-1">{item.title}</span>
                {item.meta !== undefined && !isOpen && (
                  <span className="text-xs font-normal text-ink-3">{item.meta}</span>
                )}
                <ChevronDown
                  size={15}
                  className={cx("shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")}
                />
              </button>
            </h3>
            {isOpen && (
              <div id={panel} className="animate-rise pb-4 text-sm text-pretty text-ink-2">
                {item.children}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One fold: "Klaar in 4 stappen ›", "Toon alle 12". */
export function Disclosure({ label, children, defaultOpen = false }: {
  readonly label: string
  readonly children: ReactNode
  readonly defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 self-start rounded-xs text-xs text-ink-3 hover:text-ink"
      >
        {label}
        <ChevronDown size={13} className={cx("transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open && <div id={id} className="animate-rise">{children}</div>}
    </div>
  )
}
