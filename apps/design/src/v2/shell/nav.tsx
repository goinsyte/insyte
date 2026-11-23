import { useState } from "react"
import type { ReactNode } from "react"
import type { Glyph } from "../fixtures/agents.ts"
import { Link } from "../router.tsx"
import { Alert, Count } from "../ui/badge.tsx"
import { cx } from "../ui/cx.ts"
import { ChevronDown } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import type { Section } from "./sections.ts"

/**
 * The navigation's pieces, so a new area is built from them and not redrawn: a rail item (one area on
 * the dark rail), and the menu's list, item (with an optional count or hint), collapsible group, foot
 * and foot button. The rail and the menu (`rail.tsx`, `sub-panel.tsx`) only arrange these.
 */

/* ── rail ──────────────────────────────────────────────────────────────────────────────────────── */

/** One area on the rail: a glyph tile, white when current, its name beside it on hover and focus. */
export function RailItem({ section, active }: { readonly section: Section; readonly active: boolean }) {
  const G = section.glyph
  return (
    <Link
      to={section.href}
      aria-current={active ? "page" : undefined}
      aria-label={section.alert === undefined ? section.label : `${section.label}, ${section.alert} wachten`}
      className={cx(
        "group relative flex size-9 items-center justify-center rounded-md transition-colors pointer-coarse:size-11",
        active ? "bg-canvas text-ink shadow-xs" : "text-rail-ink hover:bg-rail-2 hover:text-rail-fg"
      )}
    >
      {G === null ? <MagnusMark size={20} /> : <G size={19} strokeWidth={active ? 2 : 1.75} />}
      {section.alert !== undefined && <Alert count={section.alert} />}
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute left-full z-50 ml-3 rounded-sm bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-on-ink shadow-pop",
          "invisible -translate-x-1 opacity-0 transition-[opacity,transform,visibility] duration-150",
          "group-hover:visible group-hover:translate-x-0 group-hover:opacity-100",
          "group-focus-visible:visible group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        )}
      >
        {section.label}
      </span>
    </Link>
  )
}

/* ── menu ─────────────────────────────────────────────────────────────────────────────────────── */

export function MenuList({ children }: { readonly children: ReactNode }) {
  return <ul className="flex flex-col gap-px">{children}</ul>
}

export function MenuGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-6 items-center gap-1 self-start rounded-xs px-2 text-xs text-ink-3 hover:text-ink pointer-coarse:h-11"
      >
        {title}
        <ChevronDown size={12} className={cx("transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <MenuList>{children}</MenuList>}
    </div>
  )
}

export function MenuFoot({ children }: { readonly children: ReactNode }) {
  return <div className="mt-auto pt-2">{children}</div>
}

export function MenuItem({ to, glyph: G, label, count, active, hint }: {
  readonly to: string
  readonly glyph: Glyph
  readonly label: string
  readonly count?: number
  readonly active: boolean
  readonly hint?: string
}) {
  return (
    <li>
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        title={hint === undefined ? undefined : `${label} · ${hint}`}
        className={cx(
          "flex h-(--menu-row) items-center gap-2.5 rounded-sm px-2 text-sm transition-colors pointer-coarse:h-11",
          active ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
        )}
      >
        <G size={16} strokeWidth={active ? 2 : 1.75} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint !== undefined && count === undefined && <span className="shrink-0 text-2xs text-ink-3">{hint}</span>}
        {count !== undefined && count > 0 && <Count>{count}</Count>}
      </Link>
    </li>
  )
}

export function MenuButton(
  { to, glyph: G, label }: { readonly to: string; readonly glyph: Glyph; readonly label: string }
) {
  return (
    <Link
      to={to}
      className="flex h-8 w-full items-center justify-center gap-2 rounded-sm pointer-coarse:h-11 bg-selected text-xs font-medium text-ink-2 hover:bg-line hover:text-ink"
    >
      <G size={14} />
      {label}
    </Link>
  )
}
