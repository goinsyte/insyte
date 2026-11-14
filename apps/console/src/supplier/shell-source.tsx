import type { AreaId, Level, RoleDef, SpecialId } from "@insyte/domain/Permissions"
import type { SupplierMe } from "@insyte/modules/supplier-portal/domain/Portal"
import { GateRoleProvider } from "@insyte/ui/app/access/gate-role"
import { panelForPath } from "@insyte/ui/app/lib/app-shell-config"
import { navByPersona } from "@insyte/ui/app/lib/nav-config"
import { navActions, navPrefsOf } from "@insyte/ui/app/lib/nav-model"
import { DEFAULT_PREFS } from "@insyte/ui/app/lib/notifications"
import type { ShellSource } from "@insyte/ui/app/shell/source"
import { ShellSourceProvider } from "@insyte/ui/app/shell/source"
import type { NavState } from "@insyte/ui/app/stores/nav-store"
import type { PanelState } from "@insyte/ui/app/stores/panel-store"
import type { PinsState } from "@insyte/ui/app/stores/pins-store"
import type { SupplierOrderRow } from "@insyte/ui/app/supplier/source"
import { type ReactNode, useRef, useState } from "react"

/*
 * The frame for a supplier's contact (M16 step 2): the design's parts, persona "supplier", over what the portal knows.
 * The brand is the workspace the contact works for; the rail keeps the parts the portal has (Dashboard, Producten,
 * Bestellingen) and leaves out the ones it does not yet (Chats, Afrekeningen, Training, Instellingen). Nothing of the
 * brand's own workspace is here: no team, no stores, no marketplace. What the contact arranges in the frame (the
 * panel, the rail) lasts the visit.
 */

/** The rail's parts the console's portal does not have yet. */
const NOT_YET = ["/supplier/chats", "/supplier/statements", "/supplier/training", "/supplier/settings"]

const NAV_DEFAULTS: NavState = {
  hidden: NOT_YET,
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

const NO_ROWS = [] as const

/** The brand's apps are the brand's: a supplier has none and installs none. */
const NO_MARKETPLACE: ShellSource["marketplace"] = {
  apps: [],
  status: "ready",
  records: {},
  installedIds: [],
  isInstalled: () => false,
  getRecord: () => undefined,
  recommended: [],
  soon: () => true,
  install: () => {},
  uninstall: () => {},
  markOpened: () => {},
  revokedScopes: () => [],
  canRescope: () => false,
  setRevokedScopes: () => {},
  sendFeedback: () => Promise.resolve(false)
}

/** A contact holds no role in the brand's workspace: every area closed, so the shared parts grey nothing in. */
const ROLE: RoleDef & { viewing: boolean } = {
  id: "supplier_contact",
  label: "Leverancier",
  system: true,
  custom: false,
  levels: {} as Record<AreaId, Level>,
  specials: {} as Record<SpecialId, boolean>,
  refundLimit: null,
  stores: [],
  viewing: false
}

export function SupplierShellSource(
  { me, orders, children }: { me: SupplierMe; orders: ReadonlyArray<SupplierOrderRow>; children: ReactNode }
) {
  const [nav, setNav] = useState<NavState>(NAV_DEFAULTS)
  const navRef = useRef(nav)
  navRef.current = nav
  const [panel, setPanel] = useState<PanelPrefs>(PANEL_DEFAULTS)
  const [pins, setPins] = useState<PinsPrefs>({ pinned: [], favourites: [], reportDismissed: null })
  const navState = { ...nav, ...navActions(() => navRef.current, (patch) => setNav({ ...navRef.current, ...patch })) }
  const person = {
    id: me.contact.id,
    user_id: me.contact.id,
    name: me.contact.name,
    email: "",
    role: "Leverancier",
    status: "active" as const
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
      recent: [],
      unpin: (to, label) =>
        setPins({ ...pins, pinned: pins.pinned.filter((p) => !(p.to === to && p.label === label)) }),
      repin: (s) => setPins({ ...pins, pinned: [...pins.pinned, s] }),
      favourite: (s) => setPins({ ...pins, favourites: [...pins.favourites, s] }),
      unfavourite: (to, label) =>
        setPins({ ...pins, favourites: pins.favourites.filter((f) => !(f.to === to && f.label === label)) }),
      visit: () => {},
      dismissReport: (week) => setPins({ ...pins, reportDismissed: week })
    },
    views: {
      views: {},
      active: {},
      draft: {},
      save: () => "",
      update: () => {},
      rename: () => {},
      remove: () => undefined,
      restore: () => {},
      togglePin: () => {},
      setActive: () => {},
      setDraft: () => {}
    },
    notifications: { notes: [], prefs: DEFAULT_PREFS, setRead: () => {}, wake: () => {} },
    home: { widgets: [], engine: "grid", add: () => {}, remove: () => {}, setEngine: () => {} },
    nav: navState,
    settingsDepth: { keys: {}, gotoOn: false, setKey: () => () => {}, resetKeys: () => () => {}, setGotoOn: () => {} },
    access: { viewAs: null, setViewAs: () => {} },
    autonomy: { budget: { limit: null, used: 0 } },
    ask: { start: () => {} },
    marketplaceModal: { openModal: () => {} },
    team: {
      workspaces: [],
      activeWorkspaceId: me.workspace.id,
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
      members: [],
      integrations: [],
      createdCustomers: []
    },
    returns: { records: [] },
    sheets: { sheets: [], folders: [] },
    courses: { courses: [], questions: [] },
    chat: { pinned: [], created: [] },
    settings: { roles: [ROLE] },
    loading: { pace: "live", setPace: () => {} },
    persona: { selection: "supplier", persona: "supplier", landing: "/supplier/dashboard" },
    activeStore: { active: undefined, stores: [], setActive: () => {} },
    seats: { total: 0, used: 0, active: 0, pending: 0, extra: 0, free: 0, full: false },
    currentRole: ROLE,
    workflows: {},
    supplierOrders: orders,
    marketplace: NO_MARKETPLACE,
    navPrefs: navPrefsOf(navState),
    extensions: NO_ROWS,
    heardNotes: NO_ROWS,
    inbox: { threads: [] },
    agentEntries: NO_ROWS,
    queueRows: NO_ROWS,
    // A supplier's portal has no stores of its own to sync: the top bar draws no line.
    syncLine: null,
    slots: {
      Customize: null,
      AppDetail: null,
      WorkspaceSwitch: null,
      FirstRunHint: null,
      Invite: null,
      ConnectStore: null
    },
    workspaceName: me.workspace.name,
    partner: { name: me.workspace.name, menu: [] },
    useRecordSearch: () => null,
    unavailable: () => "Dit kan hier nog niet",
    panelFor: panelForPath,
    automationsPanel: { recommended: 0, ai: 0, Extras: null },
    operator: { products: NO_ROWS, customers: NO_ROWS },
    data: {
      currentUserByPersona: { supplier: person } as unknown as ShellSource["data"]["currentUserByPersona"],
      navByPersona,
      members: [],
      presenceById: {},
      lastActionById: {},
      customers: [],
      products: [],
      automations: [],
      conversations: []
    }
  }
  return (
    <ShellSourceProvider value={source}>
      <GateRoleProvider value={ROLE}>{children}</GateRoleProvider>
    </ShellSourceProvider>
  )
}
