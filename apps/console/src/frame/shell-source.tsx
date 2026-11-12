import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { AreaId, Level, RoleDef, SpecialId } from "@insyte/domain/Permissions"
import type { ChargebackList } from "@insyte/modules/chargebacks/domain/Chargebacks"
import type { ChatList } from "@insyte/modules/chats/domain/Chats"
import type { MailboxView } from "@insyte/modules/inbox/domain/Inbox"
import { GateRoleProvider } from "@insyte/ui/app/access/gate-role"
import { panelForPath } from "@insyte/ui/app/lib/app-shell-config"
import { navByPersona } from "@insyte/ui/app/lib/nav-config"
import { navActions, navPrefsOf } from "@insyte/ui/app/lib/nav-model"
import { DEFAULT_PREFS, type Note, type NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import { withServerCounts } from "@insyte/ui/app/lib/panel-counts"
import type { Conversation, Member } from "@insyte/ui/app/lib/types/domain"
import { type PanelMailbox, type ShellSource, ShellSourceProvider } from "@insyte/ui/app/shell/source"
import type { NavState } from "@insyte/ui/app/stores/nav-store"
import type { PanelState } from "@insyte/ui/app/stores/panel-store"
import type { PinsState, Shortcut } from "@insyte/ui/app/stores/pins-store"
import type { SavedView } from "@insyte/ui/app/stores/views-store"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { chargebackOf } from "../chargebacks/chargeback-of.ts"
import { conversationOf } from "../chats/chat-of.tsx"
import { chargebacksAtom } from "../data/chargebacks.ts"
import { chatsAtom } from "../data/chats.ts"
import { FRAME, frameWrites, inboxAtom, notePrefsAtom, NOTES, presenceAtom, VIEWS, viewsAtom } from "../data/frame.ts"
import { inboxCountsAtom, mailboxesAtom } from "../data/inbox.ts"
import { ticketCountsAtom } from "../data/tickets.ts"
import { notifyPrefsOf } from "../notifications/settings-source.ts"
import { ConsoleInvite } from "./invite.tsx"
import { toNote } from "./notes.ts"
import { usePrefSection } from "./prefs.ts"
import { useConsoleRecordSearch } from "./record-search.ts"

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

/** Why each area's "new" button is off in the console, in the words its page uses. */
const NOT_YET: Record<string, string> = {
  order: "Bestellingen maken kan hier nog niet",
  customer: "Klanten toevoegen kan hier nog niet",
  product: "Producten toevoegen kan hier nog niet"
}

const NO_COUNTS = Atom.make(AsyncResult.initial<Readonly<Record<string, number>>, never>())
const NO_CHATS = Atom.make(AsyncResult.initial<ChatList, never>())
const NO_CHARGEBACKS = Atom.make(AsyncResult.initial<ChargebackList, never>())
const NO_MAILBOXES = Atom.make(AsyncResult.initial<ReadonlyArray<MailboxView>, never>())

/** What the console makes from the panel's button and the top bar's + menu. */
const MADE_HERE = new Set(["return", "ticket", "channel", "thread", "evidence", "automation"])

export function ConsoleShellSource({ frame, children }: { frame: Frame; children: ReactNode }) {
  const navigate = useNavigate()
  const presence = useAtomValue(presenceAtom)
  const inbox = value(useAtomValue(inboxAtom))
  const notePrefs = value(useAtomValue(notePrefsAtom))
  const views = value(useAtomValue(viewsAtom))
  // The tickets panel counts each view from the server, on the tickets pages only.
  const onTickets = useRouterState({ select: (s) => s.location.pathname.startsWith("/tickets") })
  const ticketCounts = value(useAtomValue(onTickets ? ticketCountsAtom : NO_COUNTS))
  // The chats panel lists the conversations and their unread counts, on the chats page only (M11 step 4).
  const onChats = useRouterState({ select: (s) => s.location.pathname.startsWith("/chats") })
  const chats = value(useAtomValue(onChats ? chatsAtom : NO_CHATS))
  // The chargebacks panel counts its tabs from the cases the list shows, on the chargebacks pages only (M13).
  const onChargebacks = useRouterState({ select: (s) => s.location.pathname.startsWith("/chargebacks") })
  const chargebackList = value(useAtomValue(onChargebacks ? chargebacksAtom : NO_CHARGEBACKS))
  const chargebacks = useMemo(() => chargebackList?.rows.map(chargebackOf) ?? [], [chargebackList])
  const conversations = useMemo<Array<Conversation>>(() => chats?.conversations.map(conversationOf) ?? [], [chats])
  const chatPins = useMemo(() => chats?.conversations.filter((c) => c.pinned).map((c) => c.id) ?? [], [chats])
  // The inbox panel counts each folder and mailbox from the server, and lists the mailboxes, on the inbox page only
  // (M11 step 2).
  const onInbox = useRouterState({ select: (s) => s.location.pathname.startsWith("/inbox") })
  const inboxCounts = value(useAtomValue(onInbox ? inboxCountsAtom : NO_COUNTS))
  const mailboxes = value(useAtomValue(onInbox ? mailboxesAtom : NO_MAILBOXES))
  const panelMailboxes = useMemo<ReadonlyArray<PanelMailbox> | undefined>(
    () =>
      mailboxes?.map((m) => ({
        id: m.id,
        label: m.label,
        live: m.status === "connected",
        logo: m.provider === "forward" ? { brand: "email", name: "E-mail" } : {
          brand: m.provider,
          name: m.provider === "gmail" ? "Gmail" : "Outlook"
        },
        count: inboxCounts?.[`/inbox?mailbox=${m.id}`]
      })),
    [mailboxes, inboxCounts]
  )
  const areaCounts = ticketCounts ?? inboxCounts
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

  const gateRole = useMemo(() => roleOf(frame), [frame])
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
  // The member's settings as the bell and the inbox read them (M11 step 13.5); the design's defaults until they are in.
  const prefs: NotifyPrefs = useMemo(() => notePrefs === undefined ? DEFAULT_PREFS : notifyPrefsOf(notePrefs), [
    notePrefs
  ])
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
      chargebacks,
      queue: [],
      members,
      integrations: [],
      createdCustomers: []
    },
    returns: { records: [] },
    sheets: { sheets: [], folders: [] },
    courses: { courses: [], questions: [] },
    chat: { pinned: chatPins, created: [] },
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
    inbox: { threads: [], mailboxes: onInbox ? panelMailboxes ?? [] : undefined },
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
    useRecordSearch: useConsoleRecordSearch,
    // A return is started from its page (M9.1), a ticket written on the board (M11), a channel in Chats (M11 step 4), a
    // mail in the inbox (M11 step 2), a chargeback by hand on its list (M13); the rest is not made here yet.
    unavailable: (kind) => MADE_HERE.has(kind) ? null : NOT_YET[kind] ?? "Dit kan hier nog niet",
    panelFor: (pathname) => {
      const cfg = panelForPath(pathname)
      if (cfg === null) return null
      // Only a return, a ticket, a channel, a mail, a chargeback and an automation are made from the console yet: any
      // other button is off, and says so as its page does.
      const panel = cfg.cta === undefined
        ? cfg
        : MADE_HERE.has(cfg.cta.create ?? "")
        ? cfg
        : { ...cfg, cta: { ...cfg.cta, unavailable: NOT_YET[cfg.cta.create ?? ""] ?? "Dit kan hier nog niet" } }
      return withServerCounts(panel, areaCounts === undefined ? frame.counts : { ...frame.counts, ...areaCounts })
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
      conversations
    }
  }
  // The role the shared parts grey their controls out by (the selection bar, the record's actions); the server still
  // refuses what the role may not do.
  return (
    <ShellSourceProvider value={source}>
      <GateRoleProvider value={gateRole}>{children}</GateRoleProvider>
    </ShellSourceProvider>
  )
}
