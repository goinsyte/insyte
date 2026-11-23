import { useEffect, useId, useRef, useState } from "react"
import { STORES } from "../fixtures/workspace.ts"
import { Link, paths } from "../router.tsx"
import { cx } from "../ui/cx.ts"
import { Check, ChevronDown, Plus } from "../ui/icons.tsx"
import { VariantMark } from "./variants.tsx"

/** The store's monogram: its initial on a light tile, as a Shopify store has no logo in the demo. */
function StoreTile({ name, size = 26 }: { readonly name: string; readonly size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm bg-rail-fg text-xs font-bold text-rail"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  )
}

/**
 * The store switcher: the head of the dark L, top left. Shows the store you are in and its platform;
 * opens a list of the workspace's stores (a disconnected one says so) and a way to connect another.
 */
export function StoreSwitcher({ storeId, onChange }: {
  readonly storeId: string
  readonly onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const store = STORES.find((s) => s.id === storeId) ?? STORES[0]

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (store === undefined) return null

  return (
    <div ref={root} className="relative h-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex h-full w-full items-center gap-2 rounded-md px-2 text-left text-rail-fg hover:bg-rail-2"
      >
        {/* The Varianten panel's logo, if one is chosen; else the store's letter. */}
        <VariantMark fallback={<StoreTile name={store.name} />} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold">{store.name}</span>
          <span className="truncate text-2xs text-rail-ink">{store.detail}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-rail-ink" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-1.5 w-64 animate-rise rounded-md bg-canvas p-1 shadow-pop ring-1 ring-line">
          <p className="px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-3">Winkels in Northwind</p>
          <ul id={listId} role="listbox" aria-label="Winkel kiezen">
            {STORES.map((s) => {
              const selected = s.id === store.id
              return (
                <li key={s.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(s.id)
                      setOpen(false)
                    }}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-hover",
                      selected && "bg-selected"
                    )}
                  >
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-ink text-2xs font-bold text-on-ink">
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-ink">{s.name}</span>
                      <span className={cx("truncate text-2xs", s.connected ? "text-ink-3" : "text-warn-ink")}>
                        {s.detail}
                      </span>
                    </span>
                    {selected && <Check size={16} className="shrink-0 text-ink" />}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link
              to={paths.settings("winkels")}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Plus size={16} className="text-ink-3" />
              Winkel koppelen
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
