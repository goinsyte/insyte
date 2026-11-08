import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { AreaId, Level, RoleDef, SpecialId } from "@insyte/domain/Permissions"
import { panelForPath } from "@insyte/ui/app/lib/app-shell-config"
import { navByPersona } from "@insyte/ui/app/lib/nav-config"
import { navActions, navPrefsOf } from "@insyte/ui/app/lib/nav-model"
import { DEFAULT_PREFS, type Note, type NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import { withServerCounts } from "@insyte/ui/app/lib/panel-counts"
import type { Member } from "@insyte/ui/app/lib/types/domain"
import { type ShellSource, ShellSourceProvider } from "@insyte/ui/app/shell/source"
import type { NavState } from "@insyte/ui/app/stores/nav-store"
import type { PanelState } from "@insyte/ui/app/stores/panel-store"
import type { PinsState, Shortcut } from "@insyte/ui/app/stores/pins-store"
import type { SavedView } from "@insyte/ui/app/stores/views-store"
import { useNavigate } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { FRAME, frameWrites, inboxAtom, notePrefsAtom, NOTES, presenceAtom, VIEWS, viewsAtom } from "../data/frame.ts"
import { ConsoleInvite } from "./invite.tsx"
import { toNote } from "./notes.ts"
import { usePrefSection } from "./prefs.ts"

/*
 * The frame in the console (step 7.4c, M5): the design's parts over the server. What the member set is their
 * preferences (`Prefs.*`, a section each), the bell is their notifications, the faces are the team's with presence
 * from the realtime socket. Areas the console does not have yet hold no records, so the frame shows what it shows for
 * an empty workspace.
 */

const NAV_DEFAULTS: NavState = {
  hidden: [],
  order: [],
  pinnedAddons: [],
  pinnedFriends: [],
  shortcuts: {},
  themeMode: "light"
}

type PanelPrefs = Pick<PanelState, "sections" | "hidden" | "style" | "density">
const PANEL_DEFAULTS: PanelPrefs = {
  sections: ["navigation", "report", "shortcuts"],
  hidden: [],
  style: "ruler",
  density: "compact"
}

type PinsPrefs = Pick<PinsState, "pinned" | "favourites" | "reportDismissed">
const PINS_DEFAULTS: PinsPrefs = { pinned: [], favourites: [], reportDismissed: null }

const NO_ROWS = [] as const

const roleOf = (frame: Frame): RoleDef & { viewing: boolean } => ({
  id: frame.role.id,
  label: frame.role.label,
  system: frame.role.id !== "custom",
  custom: false,
  levels: frame.role.levels as Record<AreaId, Level>,
  specials: frame.role.specials as Record<SpecialId, boolean>,
  refundLimit: frame.role.refundLimit,
  stores: frame.role.stores === "all" ? "all" : [...frame.role.stores],
  viewing: false
})

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

export function ConsoleShellSource({ frame, children }: { frame: Frame; children: ReactNode }) {
  const navigate = useNavigate()
  const presence = useAtomValue(presenceAtom)
  const inbox = value(useAtomValue(inboxAtom))
  const notePrefs = value(useAtomValue(notePrefsAtom))
  const views = value(useAtomValue(viewsAtom))
  const write = {
    setRead: useAtomSet(frameWrites.setRead, { mode: "promiseExit" }),
    recordVisit: useAtomSet(frameWrites.recordVisit, { mode: "promiseExit" }),
    saveView: useAtomSet(frameWrites.saveView, { mode: "promiseExit" }),
    updateView: useAtomSet(frameWrites.updateView, { mode: "promiseExit" }),
    renameView: useAtomSet(frameWrites.renameView, { mode: "promiseExit" }),
    removeView: useAtomSet(frameWrites.removeView, { mode: "promiseExit" }),
    restoreView: useAtomSet(frameWrites.restoreView, { mode: "promiseExit" }),
    togglePinView: useAtomSet(frameWrites.togglePinView, { mode: "promiseExit" })
  }

  const [nav, setNav] = usePrefSection(frame, "rail", NAV_DEFAULTS)
  const [panel, setPanel] = usePrefSection(frame, "panel", PANEL_DEFAULTS)
  const [pins, setPins] = usePrefSection(frame, "pins", PINS_DEFAULTS)
  const [shortcuts] = usePrefSection(frame, "shortcuts", {
    keys: {} as Record<string, string>,
    gotoOn: true
  })
  const navRef = useRef(nav)
  navRef.current = nav
  const [active, setActive] = useState<Record<string, string | null>>({})
  const [draft, setDraft] = useState<Record<string, never>>({})

  const notes: ReadonlyArray<Note> = useMemo(() => (inbox?.items ?? []).map(toNote), [inbox])
  const prefs: NotifyPrefs = useMemo(() => ({
    ...DEFAULT_PREFS,
    events: Object.fromEntries(
      Object.entries(DEFAULT_PREFS.events).map(([kind, p]) => [kind, { ...p, app: notePrefs?.app[kind] ?? p.app }])
    )
  }), [notePrefs])
  const members: Array<Member> = frame.teammates.map((t) => ({
    id: t.id,
    user_id: t.id,
    name: t.name,
    email: "",
    ...(t.image === null ? {} : { avatar_url: t.image }),
    role: t.roleLabel,
    status: "active"
  }))
  const navState = { ...nav, ...navActions(() => navRef.current, (patch) => setNav({ ...navRef.current, ...patch })) }
  const recent: Array<Shortcut> = frame.prefs.recents.map((r) => ({
    to: r.path,
    label: r.label,
    kind: r.kind as Shortcut["kind"],
    at: r.at
  }))
  const savedViews: Record<string, Array<SavedView>> = {}
  for (const v of views ?? []) {
    ;(savedViews[v.listKey] ??= []).push({
      id: v.id,
      name: v.name,
      filter: v.filter as SavedView["filter"],
      pinned: v.pinned
    })
  }

  const source: ShellSource = {
    panel: {
      ...panel,
      setSections: (sections) => setPanel({ ...panel, sections }),
      toggleSection: (id) =>
        setPanel({
          ...panel,
          hidden: panel.hidden.includes(id) ? panel.hidden.filter((h) => h !== id) : [...panel.hidden, id]
        }),
      setStyle: (style) => setPanel({ ...panel, style }),
      setDensity: (density) => setPanel({ ...panel, density }),
      reset: () => setPanel(PANEL_DEFAULTS)
    },
    pins: {
      ...pins,
      recent,
      unpin: (to, label) =>
        setPins({ ...pins, pinned: pins.pinned.filter((p) => !(p.to === to && p.label === label)) }),
      repin: (s) => setPins({ ...pins, pinned: [...pins.pinned, s] }),
      favourite: (s) => setPins({ ...pins, favourites: [...pins.favourites, s] }),
      unfavourite: (to, label) =>
        setPins({ ...pins, favourites: pins.favourites.filter((f) => !(f.to === to && f.label === label)) }),
      visit: (s) =>
        void write.recordVisit({ payload: { path: s.to, kind: s.kind, label: s.label }, reactivityKeys: FRAME }),
      dismissReport: (week) => setPins({ ...pins, reportDismissed: week })
    },
    views: {
      views: savedViews,
      active,
      draft,
      save: (key, name, filter) => {
        void write.saveView({ payload: { listKey: key, name, filter: filter as never }, reactivityKeys: VIEWS })
        return ""
      },
      update: (_key, id, filter) =>
        void write.updateView({ payload: { id, filter: filter as never }, reactivityKeys: VIEWS }),
      rename: (_key, id, name) => void write.renameView({ payload: { id, name }, reactivityKeys: VIEWS }),
      remove: (key, id) => {
        const gone = savedViews[key]?.find((v) => v.id === id)
        void write.removeView({ payload: { id }, reactivityKeys: VIEWS })
        return gone
      },
      restore: (_key, view) => void write.restoreView({ payload: { id: view.id }, reactivityKeys: VIEWS }),
      togglePin: (_key, id) => void write.togglePinView({ payload: { id }, reactivityKeys: VIEWS }),
      setActive: (key, id) => setActive((a) => ({ ...a, [key]: id })),
      setDraft: (key, filter) => setDraft((d) => ({ ...d, [key]: filter as never }))
    },
    notifications: {
      notes: [...notes],
      prefs,
      setRead: (ids, read) => void write.setRead({ payload: { ids: [...ids], read }, reactivityKeys: NOTES }),
      wake: () => {}
    },
    home: { widgets: [], engine: "grid", add: () => {}, remove: () => {}, setEngine: () => {} },
    nav: navState,
    settingsDepth: shortcuts,
    access: { viewAs: null, setViewAs: () => {} },
    autonomy: { budget: { limit: null, used: 0 } },
    ask: { start: () => void navigate({ to: "/ask" as never }) },
    marketplaceModal: { openModal: () => void navigate({ to: "/settings/apps" as never }) },
    team: {
      workspaces: [{
        id: frame.workspace.id,
        name: frame.workspace.name,
        role: frame.role.label,
        members: frame.teammates.length,
        plan: "",
        own: frame.role.id === "owner",
        home: true
      }],
      activeWorkspaceId: frame.workspace.id,
      workspaceInvites: [],
      acceptWorkspaceInvite: () => undefined,
      declineWorkspaceInvite: () => undefined,
      restoreWorkspaceInvite: () => {},
      leaveWorkspace: () => {},
      switchWorkspace: () => {},
      setCreatingWorkspace: () => {}
    },
    workspace: {
      tickets: [],
      orders: [],
      chargebacks: [],
      queue: [],
      members,
      integrations: [],
      createdCustomers: []
    },
    returns: { records: [] },
    sheets: { sheets: [], folders: [] },
    courses: { courses: [], questions: [] },
    chat: { pinned: [], created: [] },
    settings: { roles: [roleOf(frame)] },
    loading: { pace: "live", setPace: () => {} },
    persona: { selection: "admin", persona: "admin", landing: "/dashboard" },
    activeStore: { active: undefined, stores: [], setActive: () => {} },
    seats: { total: 0, used: 0, active: frame.teammates.length, pending: 0, extra: 0, free: 0, full: false },
    currentRole: roleOf(frame),
    workflows: {},
    supplierOrders: NO_ROWS,
    // No marketplace yet (M17): nothing installed.
    marketplace: {
      records: {},
      installedIds: [],
      isInstalled: () => false,
      getRecord: () => undefined,
      install: () => {},
      uninstall: () => {},
      markOpened: () => {}
    } as unknown as ShellSource["marketplace"],
    navPrefs: navPrefsOf(navState),
    extensions: NO_ROWS,
    heardNotes: notes.filter((n) => prefs.events[n.event]?.app !== false),
    inbox: { threads: [] },
    agentEntries: NO_ROWS,
    queueRows: NO_ROWS,
    // Customize waits for Start's board, an app's detail for the marketplace (M17), connecting a store for Shopify (M6).
    slots: {
      Customize: null,
      AppDetail: null,
      WorkspaceSwitch: null,
      FirstRunHint: null,
      Invite: ConsoleInvite,
      ConnectStore: null
    },
    workspaceName: frame.workspace.name,
    // ADR-0028: the design's demo counts dropped, the server's in their place.
    panelFor: (pathname) => {
      const cfg = panelForPath(pathname)
      return cfg === null ? null : withServerCounts(cfg, frame.counts)
    },
    automationsPanel: { recommended: 0, ai: 0, Extras: null },
    operator: { products: NO_ROWS, customers: NO_ROWS },
    data: {
      currentUserByPersona: {
        admin: {
          id: frame.me.memberId,
          name: frame.me.name,
          email: frame.me.email,
          role: frame.role.label,
          ...(frame.me.image === null ? {} : { avatar_url: frame.me.image })
        }
      } as ShellSource["data"]["currentUserByPersona"],
      navByPersona,
      members,
      presenceById: Object.fromEntries(
        frame.teammates.map((t) => [t.id, presence.includes(t.id) ? "online" : "offline"])
      ),
      lastActionById: {},
      customers: [],
      products: [],
      automations: [],
      conversations: []
    }
  }
  return <ShellSourceProvider value={source}>{children}</ShellSourceProvider>
}
