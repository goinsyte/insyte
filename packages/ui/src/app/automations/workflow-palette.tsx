import { useDraggable } from "@dnd-kit/core"
import { useMemo, useState } from "react"
import { ChevronDown, ChevronsLeft, Search } from "../../icons"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { type NodeVariant, PALETTE_GROUPS, VARIANTS_BY_ID } from "./node-types"
import { StepTile } from "./step-tile"

function useGroups(query: string) {
  const q = query.trim().toLowerCase()
  return useMemo(
    () =>
      PALETTE_GROUPS.map((g) => ({
        ...g,
        variants: g.variants.filter(
          (v) =>
            !q || v.label.toLowerCase().includes(q) || v.description.toLowerCase().includes(q) ||
            g.name.toLowerCase().includes(q)
        )
      })).filter((g) => g.variants.length > 0),
    [q]
  )
}

/**
 * The steps, as one compact list: 240px, a search, and groups that fold — the triggers, Insyte's own
 * actions, logic, AI, then every connected service under its own logo. A row is a 20px mark and a
 * label: drag it onto a + on the canvas, or click it to add it at the end.
 */
export function WorkflowPalette(
  { collapsed, onToggleCollapsed, onAdd }: {
    collapsed: boolean
    onToggleCollapsed: () => void
    onAdd: (variantId: string) => void
  }
) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.map((g) => [g.name, g.defaultOpen]))
  )
  const groups = useGroups(query)
  const searching = query.trim().length > 0

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-2 bg-paper py-2.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Stappen uitklappen"
          className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
        >
          <ChevronsLeft className="size-3.5 rotate-180" />
        </button>
        <span className="font-medium text-ink-3 text-xs [writing-mode:vertical-rl]">Stappen</span>
      </aside>
    )
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-paper">
      <div className="flex h-10 shrink-0 items-center justify-between pr-1.5 pl-3">
        <span className="font-medium text-ink text-sm">Stappen</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Stappen inklappen"
          className="flex size-6 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
        >
          <ChevronsLeft className="size-3.5" />
        </button>
      </div>
      <div className="shrink-0 px-2.5 pb-2">
        <label className="field flex h-7 items-center gap-2 rounded-md px-2 hover:field-hover focus-within:bg-paper">
          <Search className="size-3.5 shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een stap"
            aria-label="Zoek een stap"
            className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.length === 0
          ? <p className="px-2 py-3 text-ink-3 text-sm">Geen stap heet zo. Probeer “mail” of “ticket”.</p>
          : null}
        {groups.map((g) => {
          const isOpen = searching || (open[g.name] ?? false)
          return (
            <section key={g.name} className="flex flex-col">
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [g.name]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-ink-3 text-xs transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <ChevronDown
                  className={cn("size-3 shrink-0 transition-transform duration-150", !isOpen && "-rotate-90")}
                />
                {g.brand ? <BrandLogo brand={g.brand} name={g.name} size={14} /> : null}
                <span className="min-w-0 flex-1 truncate text-left font-medium">{g.name}</span>
                <span className="tabular-nums">{g.variants.length}</span>
              </button>
              {isOpen ?
                (
                  <ul className="flex flex-col pb-1.5">
                    {g.variants.map((v) => <PaletteItem key={v.id} variant={v} onAdd={onAdd} />)}
                  </ul>
                ) :
                null}
            </section>
          )
        })}
      </div>
      <p className="shrink-0 bg-mist px-3 py-2.5 text-ink-3 text-xs leading-[1.45]">
        Sleep een stap op een + in het canvas, of klik erop om hem achteraan toe te voegen.
      </p>
    </aside>
  )
}

function PaletteItem({ variant, onAdd }: { variant: NodeVariant; onAdd: (variantId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${variant.id}`,
    data: { kind: "palette", variantId: variant.id }
  })
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        onClick={() => onAdd(variant.id)}
        title={variant.description}
        className={cn(
          "flex h-7 w-full cursor-grab items-center gap-2 rounded-md px-1.5 text-left text-ink-2 text-sm transition-colors hover:bg-ink/5 hover:text-ink active:cursor-grabbing",
          isDragging && "opacity-40"
        )}
      >
        <StepTile variant={variant} size={20} />
        <span className="min-w-0 flex-1 truncate">{variant.label}</span>
      </button>
    </li>
  )
}

export function PalettePreview({ variantId }: { variantId: string }) {
  const v = VARIANTS_BY_ID[variantId]
  if (!v) return null
  return (
    <div className="panel-raised pointer-events-none flex h-8 items-center gap-2 rounded-md bg-paper px-2">
      <StepTile variant={v} size={20} />
      <span className="font-medium text-ink text-sm">{v.label}</span>
    </div>
  )
}

/** The same steps in a popover, for the + on a connector. */
export function StepPicker({ onPick, inLane }: { onPick: (variantId: string) => void; inLane?: boolean }) {
  const [query, setQuery] = useState("")
  const groups = useGroups(query)
    .map((g) => ({
      ...g,
      variants: g.variants.filter((v) => v.kind !== "trigger" && !(inLane && v.kind === "branch"))
    }))
    .filter((g) => g.variants.length > 0)
  return (
    <div className="flex w-64 flex-col">
      <label className="field m-1 flex h-7 items-center gap-2 rounded-md px-2 focus-within:bg-paper">
        <Search className="size-3.5 shrink-0 text-ink-3" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker opens to be typed into
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een stap"
          aria-label="Zoek een stap"
          className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
        />
      </label>
      <div className="max-h-72 overflow-y-auto p-1">
        {groups.length === 0 ? <p className="px-2 py-2 text-ink-3 text-sm">Geen stap heet zo.</p> : null}
        {groups.map((g) => (
          <div key={g.name} className="flex flex-col">
            <span className="px-1.5 pt-1.5 pb-0.5 font-medium text-ink-3 text-xs">{g.name}</span>
            {g.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v.id)}
                className="flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-ink-2 text-sm hover:bg-ink/5 hover:text-ink"
              >
                <StepTile variant={v} size={18} />
                <span className="min-w-0 flex-1 truncate">{v.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
