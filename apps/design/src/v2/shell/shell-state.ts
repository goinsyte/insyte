import { useSyncExternalStore } from "react"
import { paths } from "../router.tsx"
import type { ThreadKind } from "./threads.ts"

/**
 * The shell's own state: what is open over the work (the palette, the shortcuts, Magnus beside the
 * page, the rail's customisation), what the person pinned and opened lately, how they laid out the
 * rail, and which workspace they are in. One small store, so the palette, the rail, Start's menu and
 * the bar agree. The person's choices (pins, the rail, the workspace) are remembered per browser;
 * what is open is not.
 */

type Overlay = "palette" | "shortcuts" | "customise" | null

/** A record or page the person pinned or opened: where it is, what it is called and what kind. */
export type Shortcut = { readonly href: string; readonly label: string; readonly kind: ThreadKind }
type Recent = Shortcut & { readonly at: number }

export type RailPrefs = {
  /** Rail areas in the person's order, by id; an area not listed keeps its place after them. */
  readonly order: ReadonlyArray<string>
  readonly hidden: ReadonlyArray<string>
  /** Tools from Meer pinned to the rail, by id (`PINNABLE`). */
  readonly pinned: ReadonlyArray<string>
}

export type WorkspaceId = "northwind" | "lumen" | "fjord"

type ShellState = {
  readonly overlay: Overlay
  readonly drawer: boolean
  readonly pins: ReadonlyArray<Shortcut>
  readonly recent: ReadonlyArray<Recent>
  readonly rail: RailPrefs
  readonly workspace: WorkspaceId
  /** Workspaces the person joined this visit, from an invitation. */
  readonly joined: ReadonlyArray<WorkspaceId>
  /** Invitations the person declined, or workspaces they left. */
  readonly gone: ReadonlyArray<WorkspaceId>
  /** The workspace being handed over to, while the veil shows. */
  readonly switching: WorkspaceId | null
}

const KEY = "insyte:v2:shell"

const SEED_PINS: ReadonlyArray<Shortcut> = [
  { href: "/v2/producten/aurora-hooded-fleece", label: "Aurora Hooded Fleece", kind: "product" },
  { href: "/v2/leveranciers/kestrel-goods", label: "Kestrel Goods", kind: "supplier" },
  { href: paths.board("retouren"), label: "Bord Retouren", kind: "board" }
]

const SEED: ShellState = {
  overlay: null,
  drawer: false,
  pins: SEED_PINS,
  recent: [],
  rail: { order: [], hidden: [], pinned: [] },
  workspace: "northwind",
  joined: [],
  gone: [],
  switching: null
}

type Kept = Pick<ShellState, "pins" | "recent" | "rail" | "workspace" | "joined" | "gone">

function load(): ShellState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return SEED
    const kept = JSON.parse(raw) as Partial<Kept>
    return {
      ...SEED,
      pins: Array.isArray(kept.pins) ? kept.pins : SEED.pins,
      recent: Array.isArray(kept.recent) ? kept.recent : SEED.recent,
      rail: {
        order: Array.isArray(kept.rail?.order) ? kept.rail.order : [],
        hidden: Array.isArray(kept.rail?.hidden) ? kept.rail.hidden : [],
        pinned: Array.isArray(kept.rail?.pinned) ? kept.rail.pinned : []
      },
      workspace: kept.workspace === "lumen" || kept.workspace === "fjord" ? kept.workspace : "northwind",
      joined: Array.isArray(kept.joined) ? kept.joined : [],
      gone: Array.isArray(kept.gone) ? kept.gone : []
    }
  } catch {
    return SEED
  }
}

let state: ShellState = load()
const listeners = new Set<() => void>()

function set(next: (s: ShellState) => ShellState) {
  state = next(state)
  try {
    const kept: Kept = {
      pins: state.pins,
      recent: state.recent,
      rail: state.rail,
      workspace: state.workspace,
      joined: state.joined,
      gone: state.gone
    }
    window.localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Not remembered; it still applies for this visit.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => state

export function useShellState(): ShellState {
  return useSyncExternalStore(subscribe, snapshot)
}

/* ── what is open ──────────────────────────────────────────────────────────────────────────────── */

export const openOverlay = (overlay: Overlay) => set((s) => ({ ...s, overlay }))
export const closeOverlay = () => set((s) => ({ ...s, overlay: null }))
export const setDrawer = (drawer: boolean) => set((s) => ({ ...s, drawer }))

/**
 * ⌘J and "Vraag Magnus": Magnus beside the work, or, where the page is a conversation with him
 * already, straight into its composer. Pressed again, the drawer closes.
 */
export function askMagnus() {
  if (state.drawer) {
    setDrawer(false)
    return
  }
  const here = document.querySelector<HTMLTextAreaElement>("#main .ai-ring textarea")
  if (here !== null) here.focus()
  else setDrawer(true)
}

/* ── pins and recent ───────────────────────────────────────────────────────────────────────────── */

export const isPinned = (href: string, s: ShellState = state) => s.pins.some((p) => p.href === href)

export function pin(item: Shortcut) {
  set((s) => (isPinned(item.href, s) ? s : { ...s, pins: [...s.pins, item] }))
}

/** Unpin, and return where it stood so the undo can put it back in its place. */
export function unpin(href: string): number {
  const at = state.pins.findIndex((p) => p.href === href)
  set((s) => ({ ...s, pins: s.pins.filter((p) => p.href !== href) }))
  return at
}

export function repin(item: Shortcut, at: number) {
  set((s) => {
    if (isPinned(item.href, s)) return s
    const pins = [...s.pins]
    pins.splice(Math.max(0, Math.min(at, pins.length)), 0, item)
    return { ...s, pins }
  })
}

const RECENT_MAX = 8

/** A record was opened: it goes to the head of Recent, once. */
export function visit(item: Shortcut) {
  set((s) => {
    if (s.recent[0]?.href === item.href && s.recent[0].label === item.label) return s
    const rest = s.recent.filter((r) => r.href !== item.href)
    return { ...s, recent: [{ ...item, at: Date.now() }, ...rest].slice(0, RECENT_MAX) }
  })
}

/* ── the rail ──────────────────────────────────────────────────────────────────────────────────── */

export const setRail = (rail: RailPrefs) => set((s) => ({ ...s, rail }))

/* ── workspaces ────────────────────────────────────────────────────────────────────────────────── */

const HANDOVER_MS = 900

/** Switch with the hand-over veil, so it is clear the console is now someone else's. */
export function switchWorkspace(id: WorkspaceId, then?: () => void) {
  if (id === state.workspace) return
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  set((s) => ({ ...s, switching: id }))
  window.setTimeout(() => {
    set((s) => ({ ...s, workspace: id, switching: null }))
    then?.()
  }, still ? 200 : HANDOVER_MS)
}

export const joinWorkspace = (id: WorkspaceId) =>
  set((s) => ({ ...s, joined: [...s.joined.filter((w) => w !== id), id], gone: s.gone.filter((w) => w !== id) }))

export const dropWorkspace = (id: WorkspaceId) =>
  set((s) => ({
    ...s,
    gone: [...s.gone.filter((w) => w !== id), id],
    joined: s.joined.filter((w) => w !== id),
    workspace: s.workspace === id ? "northwind" : s.workspace
  }))

export const restoreWorkspace = (id: WorkspaceId, joined: boolean) =>
  set((s) => ({
    ...s,
    gone: s.gone.filter((w) => w !== id),
    joined: joined ? [...s.joined.filter((w) => w !== id), id] : s.joined
  }))
