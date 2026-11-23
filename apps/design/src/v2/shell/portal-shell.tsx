import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { AreaDef } from "../areas.ts"
import { Link, useRoute } from "../router.tsx"
import type { AreaRoute } from "../router.tsx"
import { IconButton } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { Menu, X } from "../ui/icons.tsx"
import { Toaster } from "../ui/toast.tsx"
import { useView } from "../view.ts"
import { AvatarMenu } from "./bar-actions.tsx"
import { BarSlot } from "./bar-slot.tsx"
import { Werkdraad } from "./werkdraad.tsx"

/**
 * The portals' shell: the same tokens and main bar as the product, with the portal's own short nav.
 *
 *   ┌───────────────┬──────────────────────────────────────────┐
 *   │ Northwind     │        werkdraad                     ◯   │
 *   │ portal name   ├──────────────────────────────────────────┤
 *   │ Overzicht     │ the screen                               │
 *   │ Bestellingen  │                                          │
 *
 * A supplier or an affiliate works in a few places and comes by now and then, so the nav is a labelled
 * list, not an icon rail: nothing to learn. The dark column carries who they work for and who they
 * are; below 768px it moves into a drawer behind the menu button.
 */
export function PortalShell({ area, route, children }: {
  readonly area: AreaDef
  readonly route: AreaRoute
  readonly children: ReactNode
}) {
  const { pathname } = useRoute()
  const view = useView()
  const [drawer, setDrawer] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const portal = area.portal
  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [drawer])
  if (portal === undefined) return <>{children}</>
  const who = typeof portal.who === "string" ? portal.who : portal.who(view)
  const current = portal.current(route)
  const items = typeof portal.nav === "function" ? portal.nav(view) : portal.nav

  const nav = (
    <nav aria-label={portal.name} className="flex min-h-0 flex-1 flex-col gap-6 px-2 pt-2 pb-3">
      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const G = item.glyph
          const active = item.id === current
          return (
            <li key={item.id}>
              <Link
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-sm transition-colors pointer-coarse:h-11",
                  active ? "bg-rail-2 font-medium text-rail-fg" : "text-rail-ink hover:bg-rail-2 hover:text-rail-fg"
                )}
              >
                <G size={16} strokeWidth={active ? 2 : 1.75} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {/* The dark column's own ink: the menu's Count is set for the light panel. */}
                {item.alert !== undefined && item.alert > 0 && (
                  <span className="figure ml-auto text-2xs">{item.alert}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  const identity = (
    <div className="flex flex-col gap-0.5 px-4 pt-3 pb-2">
      <span className="text-xs text-rail-ink">Northwind · {portal.name}</span>
      <span className="truncate text-sm font-semibold text-rail-fg">{who}</span>
    </div>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-canvas focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Naar de inhoud
      </a>
      <aside className="hidden w-56 shrink-0 flex-col bg-rail md:flex">
        {identity}
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid h-(--bar-height) shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-bar px-2 md:px-3">
          <div className="flex items-center md:hidden">
            <IconButton label="Menu openen" onClick={() => setDrawer(true)}>
              <Menu />
            </IconButton>
          </div>
          <div className="col-start-2 flex min-w-0 justify-center">
            <Werkdraad thread={area.thread(route)} />
          </div>
          <div className="col-start-3 flex items-center justify-end gap-0.5">
            <div ref={setSlot} className="mr-2 hidden items-center gap-0.5 sm:flex empty:hidden" />
            {portal.bar}
            <span className="ml-2 flex">
              <AvatarMenu portal={{ name: portal.name, who }} />
            </span>
          </div>
        </header>
        <main id="main" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
          <BarSlot value={slot}>{children}</BarSlot>
        </main>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Menu sluiten"
            className="absolute inset-0 bg-scrim"
            onClick={() => setDrawer(false)}
          />
          <div className="relative flex h-full w-72 max-w-[88vw] animate-rise flex-col bg-rail shadow-pop">
            <div className="flex items-start justify-between pr-1">
              {identity}
              <IconButton label="Menu sluiten" tone="rail" onClick={() => setDrawer(false)} className="mt-2">
                <X />
              </IconButton>
            </div>
            {nav}
          </div>
        </div>
      )}
      <Toaster />
    </div>
  )
}
