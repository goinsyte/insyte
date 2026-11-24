import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useStartedChats } from "../ask/thread.ts"
import { useDemo } from "../demo.ts"
import { STORES } from "../fixtures/workspace.ts"
import { useRoute } from "../router.tsx"
import { IconButton } from "../ui/button.tsx"
import { Menu, Pin, X } from "../ui/icons.tsx"
import { toast, Toaster } from "../ui/toast.tsx"
import { ShellBanners } from "./banners.tsx"
import { AvatarMenu, NewMenu, NotificationsButton, SearchButton } from "./bar-actions.tsx"
import { BarSlot } from "./bar-slot.tsx"
import { ProposalsChip, SyncStatus } from "./bar-status.tsx"
import { CustomiseDialog } from "./customise.tsx"
import { useShellKeys } from "./keys.ts"
import { ProgressLine } from "./loading.tsx"
import { MagnusDrawer } from "./magnus-drawer.tsx"
import { PageGuide } from "./page-guide.tsx"
import { Palette, RECORD_KINDS } from "./palette.tsx"
import { Rail } from "./rail.tsx"
import { isPinned, pin, repin, unpin, useShellState, visit } from "./shell-state.ts"
import { ShortcutsDialog } from "./shortcuts-dialog.tsx"
import { StoreSwitcher, WorkspaceVeil } from "./store-switcher.tsx"
import { SubPanel } from "./sub-panel.tsx"
import { sectionOf, threadFor } from "./threads.ts"
import type { ThreadItem } from "./threads.ts"
import { Werkdraad } from "./werkdraad.tsx"

const PANEL_KEY = "insyte:v2:panel"

/** Whether the menu starts unfolded: remembered per browser, else unfolded on wide screens only. */
function initialPanel(): boolean {
  try {
    const saved = window.localStorage.getItem(PANEL_KEY)
    if (saved !== null) return saved === "open"
  } catch {
    // Storage blocked: fall through to the width.
  }
  return window.matchMedia("(min-width: 1180px)").matches
}

/**
 * The shell: icon bar + menu + main bar, the owner's one hard requirement.
 *
 *   ┌──────────┬──────────────────────────────────────────────┐
 *   │ store ▾  │        werkdraad (what you work on)   + ⌕ 🔔 │   the main bar
 *   ├────┬─────┴──────┬───────────────────────────────────────┤
 *   │rail│ menu       │ the screen                            │
 *   │    │            │                                       │
 *
 * The store switcher and the rail form one dark L, joined by a concave corner. Below 768px the rail
 * and the menu move into a drawer behind the menu button, and the main bar keeps the werkdraad's
 * first item.
 *
 * Around that: the lines that say the console is not quite yours now (another role, support looking
 * along), Magnus beside the work on the right (⌘J), the palette (⌘K), the shortcuts (?), G-keys,
 * the rail's customisation, the page's guide, and a thin line across the top of the work while a
 * page arrives. A record you open goes to Recent; the pin in the bar keeps it.
 */
export function Shell({ children }: { readonly children: ReactNode }) {
  const { route, pathname } = useRoute()
  const [panelOpen, setPanelOpen] = useState(initialPanel)
  // What the person chose on this page only, over the stored preference; a navigation forgets it.
  const [here, setHere] = useState<boolean | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [storeId, setStoreId] = useState(STORES[0]?.id ?? "")
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const section = sectionOf(route)
  // Subscribed so a renamed chat renames its werkdraad too.
  useDemo()
  // A chat started beside this page lands in its werkdraad (`threads.ts`), so listen for new ones.
  useStartedChats()
  const thread = threadFor(route)
  const head = thread.items[0]
  useShellKeys()
  // An agent's page is two panes of its own (its chat, its job): the menu folds away there by itself,
  // as on the owner's screen, without touching what the person chose for every other page.
  const autoFold = route.name === "agent"
  const showPanel = here ?? (autoFold ? false : panelOpen)

  const setPanel = (open: boolean) => {
    if (autoFold) {
      setHere(open)
      return
    }
    setHere(null)
    setPanelOpen(open)
    try {
      window.localStorage.setItem(PANEL_KEY, open ? "open" : "closed")
    } catch {
      // Not remembered; it still folds.
    }
  }

  // A navigation closes the drawer and forgets a fold that was only for that page.
  useEffect(() => {
    setDrawerOpen(false)
    setHere(null)
  }, [pathname])

  // A record opened goes to the head of Recent, under the name the werkdraad gives it.
  const recordKind = head !== undefined && RECORD_KINDS.has(head.kind) ? head.kind : null
  const recordLabel = recordKind === null ? null : head?.label ?? null
  useEffect(() => {
    if (recordLabel === null || recordKind === null) return
    visit({ href: pathname, label: recordLabel, kind: recordKind })
  }, [pathname, recordLabel, recordKind])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [drawerOpen])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-canvas focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Naar de inhoud
      </a>

      {/* The main bar. */}
      <div className="flex h-(--bar-height) shrink-0 bg-bar">
        <div className="hidden w-40 shrink-0 rounded-br-lg bg-rail p-1 md:block">
          <StoreSwitcher storeId={storeId} onChange={setStoreId} />
        </div>
        <header className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-2 md:px-3">
          <div className="flex items-center gap-1 md:hidden">
            <IconButton label="Menu openen" onClick={() => setDrawerOpen(true)}>
              <Menu />
            </IconButton>
          </div>
          <div className="col-start-2 flex min-w-0 justify-center">
            <Werkdraad thread={thread} />
          </div>
          <div className="col-start-3 flex items-center justify-end gap-0.5">
            <span className="mr-1.5 flex min-w-0 items-center gap-1">
              <SyncStatus />
              <ProposalsChip />
            </span>
            <div ref={setSlot} className="mr-2 hidden items-center gap-0.5 sm:flex empty:hidden" />
            {recordLabel !== null && head !== undefined && <PinButton item={head} href={pathname} />}
            <span className="hidden sm:contents">
              <NewMenu />
            </span>
            <SearchButton />
            <NotificationsButton />
            <span className="ml-2 flex">
              <AvatarMenu />
            </span>
          </div>
        </header>
      </div>

      <ShellBanners />

      <div className="relative flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <Rail current={section} panelOpen={showPanel} onOpenPanel={() => setPanel(true)} />
          {showPanel && (
            <SubPanel
              section={section}
              route={route}
              pathname={pathname}
              onCollapse={() => setPanel(false)}
            />
          )}
        </div>
        {/* The dark L's inner corner: the switcher meets the rail on a curve, not a notch. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-(--rail-width) hidden size-3 md:block"
          style={{ background: "radial-gradient(circle at 100% 100%, transparent 11.5px, var(--color-rail) 12px)" }}
        />
        <main id="main" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
          <ProgressLine />
          <BarSlot value={slot}>{children}</BarSlot>
        </main>
        <MagnusDrawer />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Menu sluiten"
            className="absolute inset-0 bg-scrim"
            onClick={() =>
              setDrawerOpen(false)}
          />
          <div className="relative flex h-full max-w-[88vw] animate-rise flex-col bg-rail shadow-pop">
            <div className="flex h-(--bar-height) shrink-0 items-center gap-1 p-1">
              <div className="h-full w-44">
                <StoreSwitcher storeId={storeId} onChange={setStoreId} />
              </div>
              <IconButton
                label="Menu sluiten"
                tone="rail"
                onClick={() =>
                  setDrawerOpen(false)}
                className="ml-auto"
              >
                <X />
              </IconButton>
            </div>
            <div className="flex min-h-0 flex-1">
              <Rail current={section} panelOpen />
              <SubPanel section={section} route={route} pathname={pathname} />
            </div>
          </div>
        </div>
      )}
      <Palette />
      <ShortcutsDialog />
      <CustomiseDialog />
      <WorkspaceVeil />
      <PageGuide />
      <Toaster />
    </div>
  )
}

/** The pin in the main bar: keep this record on Start and in the palette, or let it go again. */
function PinButton({ item, href }: { readonly item: ThreadItem; readonly href: string }) {
  const s = useShellState()
  const on = isPinned(href, s)
  return (
    <IconButton
      label={on ? `${item.label} losmaken` : `${item.label} vastzetten`}
      pressed={on}
      className="hidden sm:inline-flex"
      onClick={() => {
        if (on) {
          const at = unpin(href)
          const was = { href, label: item.label, kind: item.kind }
          toast({
            title: `${item.label} losgemaakt`,
            action: { label: "Ongedaan maken", onClick: () => repin(was, at) }
          })
        } else {
          pin({ href, label: item.label, kind: item.kind })
          toast({
            title: `${item.label} vastgezet`,
            body: "Je vindt het op Start en in het zoekvenster.",
            tone: "good"
          })
        }
      }}
    >
      <Pin />
    </IconButton>
  )
}
