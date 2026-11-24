import { paths, useRoute } from "../router.tsx"
import { ChevronsRight, MoreHorizontal, Settings } from "../ui/icons.tsx"
import { useView } from "../view.ts"
import { RailItem } from "./nav.tsx"
import { railGroups, TOOLS } from "./sections.ts"
import { useShellState } from "./shell-state.ts"
import { VariantMark } from "./variants.tsx"

/**
 * The icon rail: graphite, one tile per area, the current one a white tile (the owner's design). Groups
 * are separated by space, not rules. Names show beside the tile on hover and focus. When the menu is
 * folded away, the rail's first tile unfolds it again. The order, what is hidden and which tools are
 * pinned are the person's own (`customise.tsx`); a pinned tool is lit while you are in it.
 */
export function Rail({ current, panelOpen, onOpenPanel }: {
  readonly current: string
  readonly panelOpen: boolean
  readonly onOpenPanel?: () => void
}) {
  const view = useView()
  const { rail } = useShellState()
  const { pathname } = useRoute()
  const lit = (id: string, href: string) =>
    id === current || (TOOLS.some((tool) => tool.id === id) && pathname.startsWith(href))
  return (
    <nav
      aria-label="Gebieden"
      className="flex h-full w-(--rail-width) shrink-0 flex-col items-center bg-rail pt-2 pb-3"
    >
      {!panelOpen && onOpenPanel !== undefined && (
        <button
          type="button"
          onClick={onOpenPanel}
          aria-label="Menu uitklappen"
          title="Menu uitklappen"
          className="mb-2 flex size-9 items-center justify-center rounded-md text-rail-ink hover:bg-rail-2 hover:text-rail-fg"
        >
          <ChevronsRight size={18} />
        </button>
      )}
      <ul className="flex flex-col items-center gap-4">
        {railGroups(view, rail).map((group) => (
          <li key={group[0]?.id}>
            <ul className="flex flex-col items-center gap-1">
              {group.map((section) => (
                <li key={section.id}>
                  <RailItem section={section} active={lit(section.id, section.href)} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col items-center gap-1">
        <li>
          <RailItem
            section={{ id: "meer", label: "Meer", href: paths.more, glyph: MoreHorizontal }}
            active={current === "meer"}
          />
        </li>
        <li>
          <RailItem
            section={{
              id: "instellingen",
              label: "Instellingen",
              href: paths.settings(),
              glyph: Settings
            }}
            active={current === "instellingen"}
          />
        </li>
      </ul>
      {/* The mark chosen in the Varianten panel, at the rail's foot; nothing by default. */}
      <VariantMark size={24} className="mt-3" />
    </nav>
  )
}
