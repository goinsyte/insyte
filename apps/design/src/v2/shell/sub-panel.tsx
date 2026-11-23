import { AREAS } from "../areas.ts"
import { ASSISTANT } from "../assistant.ts"
import { myWork, openProposals, openStoreChats, scheduledRuns, unreadNotes, useDemo } from "../demo.ts"
import { AGENTS } from "../fixtures/agents.ts"
import { BOARDS } from "../fixtures/analytics.ts"
import { CHATS } from "../fixtures/assistant.ts"
import { RECORDS, TODAY } from "../fixtures/workspace.ts"
import { AREA_PREFIXES, paths } from "../router.tsx"
import type { AreaRoute, Route } from "../router.tsx"
import {
  BadgePercent,
  BarChart3,
  Check,
  ChevronsLeft,
  Clock,
  Database,
  Factory,
  GraduationCap,
  History,
  Home,
  LayoutGrid,
  MessageSquare,
  Package,
  PiggyBank,
  Plus,
  Radio,
  Settings,
  Sheet,
  Sparkle,
  Store,
  Users,
  Workflow
} from "../ui/icons.tsx"
import { MenuButton, MenuFoot, MenuGroup, MenuItem, MenuList } from "./nav.tsx"
import { sectionLabel } from "./sections.ts"

/**
 * The menu (sub-panel): what lives inside the current area. Its title is the area, its rows the
 * area's pages, then a group of recent or saved things, then the area's settings at the foot. It folds
 * away with the double chevron; the rail unfolds it again.
 */
export function SubPanel({ section, route, pathname, onCollapse }: {
  readonly section: string
  readonly route: Route
  readonly pathname: string
  readonly onCollapse?: () => void
}) {
  const title = section === "magnus" ? ASSISTANT : sectionLabel(section)
  return (
    <aside
      aria-label={`Menu ${title}`}
      className="flex h-full w-(--panel-width) shrink-0 flex-col bg-panel"
    >
      <header className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {onCollapse !== undefined && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Menu inklappen"
            title="Menu inklappen"
            className="flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
          >
            <ChevronsLeft size={16} />
          </button>
        )}
      </header>
      <div className="pane-scroll flex min-h-0 flex-1 flex-col gap-5 px-2 pb-3">
        <PanelBody section={section} route={route} pathname={pathname} />
      </div>
    </aside>
  )
}

function PanelBody(
  { section, route, pathname }: { readonly section: string; readonly route: Route; readonly pathname: string }
) {
  switch (section) {
    case "magnus":
      return <MagnusPanel route={route} pathname={pathname} />
    case "analyse":
      return <AnalysePanel route={route} />
    case "start":
      return <StartPanel pathname={pathname} />
    case "live":
      return <LivePanel route={route} />
    case "meer":
      return <MorePanel route={route} />
    default: {
      const owner = AREA_PREFIXES.find((entry) => entry.prefix === section)
      const Menu = owner === undefined ? undefined : AREAS[owner.area].Menu
      if (owner === undefined || Menu === undefined) return <GenericPanel section={section} pathname={pathname} />
      // The menu of the area that owns this section, with the route it is on (or its first page).
      const here: AreaRoute = route.name === "area" && route.area === owner.area ? route : {
        name: "area",
        area: owner.area,
        base: owner.prefix,
        path: [],
        search: "",
        section: owner.section,
        layout: owner.layout
      }
      return <Menu route={here} pathname={pathname} />
    }
  }
}

function MagnusPanel({ route, pathname }: { readonly route: Route; readonly pathname: string }) {
  const demo = useDemo()
  const active = AGENTS.filter((agent) => agent.active).length
  return (
    <>
      <MenuList>
        <MenuItem to={paths.newChat()} glyph={Plus} label="Nieuwe chat" active={route.name === "new-chat"} />
        <MenuItem
          to={paths.agents}
          glyph={Users}
          label="Mijn agents"
          count={AGENTS.length}
          active={route.name === "agents" || route.name === "agent"}
          hint={`${active} aan het werk`}
        />
        <MenuItem
          to={paths.approvals}
          glyph={Check}
          label="Goedkeuringen"
          count={openProposals(demo)}
          active={pathname.endsWith("/goedkeuringen")}
        />
        <MenuItem
          to={paths.scheduled}
          glyph={Clock}
          label="Gepland"
          count={scheduledRuns()}
          active={pathname.endsWith("/gepland")}
        />
        <MenuItem
          to={paths.gallery}
          glyph={LayoutGrid}
          label="Agentgalerij"
          active={pathname.endsWith("/galerij")}
        />
        <MenuItem to={paths.log} glyph={History} label="Logboek" active={route.name === "log"} />
      </MenuList>
      <MenuGroup title="Recente chats">
        {CHATS.filter((chat) => !demo.deletedChats.includes(chat.id)).map((chat) => (
          <MenuItem
            key={chat.id}
            to={paths.chat(chat.id)}
            glyph={MessageSquare}
            label={demo.chatTitles[chat.id] ?? chat.title}
            active={route.name === "chat" && route.chatId === chat.id}
          />
        ))}
      </MenuGroup>
      <MenuFoot>
        <MenuButton
          to={paths.settings("ai/zelfstandigheid")}
          glyph={Settings}
          label={`${ASSISTANT}-instellingen`}
        />
      </MenuFoot>
    </>
  )
}

function AnalysePanel({ route }: { readonly route: Route }) {
  const current = route.name === "board" ? route.boardId ?? "week" : null
  return (
    <>
      <MenuList>
        <MenuItem to={paths.section("analyse", "nieuw")} glyph={Plus} label="Nieuw bord" active={false} />
      </MenuList>
      <MenuGroup title="Borden">
        {BOARDS.map((board) => (
          <MenuItem
            key={board.id}
            to={paths.board(board.id)}
            glyph={BarChart3}
            label={board.name}
            active={current === board.id}
            hint={board.owner === "Elena Hart" ? undefined : `van ${board.owner.split(" ")[0]}`}
          />
        ))}
      </MenuGroup>
      <MenuFoot>
        <MenuButton to={paths.section("analyse", "sjablonen")} glyph={LayoutGrid} label="Sjablonen voor borden" />
      </MenuFoot>
    </>
  )
}

function StartPanel({ pathname }: { readonly pathname: string }) {
  const demo = useDemo()
  return (
    <>
      <MenuList>
        <MenuItem to={paths.home} glyph={Home} label="Vandaag" count={myWork(demo)} active={pathname === paths.home} />
        <MenuItem
          to={paths.notifications}
          glyph={MessageSquare}
          label="Meldingen"
          count={unreadNotes(demo)}
          active={pathname.startsWith(paths.notifications)}
        />
      </MenuList>
      <MenuGroup title="Bladwijzers">
        <MenuItem to={RECORDS.aurora.href} glyph={Package} label={RECORDS.aurora.label} active={false} />
        <MenuItem to={RECORDS.kestrel.href} glyph={Factory} label={RECORDS.kestrel.label} active={false} />
        <MenuItem to={paths.board("retouren")} glyph={BarChart3} label="Bord Retouren" active={false} />
      </MenuGroup>
    </>
  )
}

function LivePanel({ route }: { readonly route: Route }) {
  return (
    <>
      <MenuList>
        <MenuItem to={paths.live} glyph={Radio} label="Nu op de winkel" active={route.name === "live"} />
        <MenuItem
          to={paths.storeChat}
          glyph={MessageSquare}
          label="Winkelchat"
          count={openStoreChats()}
          active={route.name === "area" && route.base === "live/winkelchat"}
        />
        <MenuItem
          to={`${paths.orders}?periode=vandaag`}
          glyph={Package}
          label="Bestellingen vandaag"
          count={TODAY.orders}
          active={false}
        />
      </MenuList>
    </>
  )
}

/** The tools that are not on the rail, then the design system's own pages. */
const MORE = [
  { to: paths.affiliates, glyph: BadgePercent, label: "Affiliates", section: "affiliates" },
  { to: paths.sheets, glyph: Sheet, label: "Sheets", section: "sheets" },
  { to: paths.courses, glyph: GraduationCap, label: "Cursussen", section: "courses" },
  { to: paths.costs, glyph: PiggyBank, label: "Kosten", section: "costs" },
  { to: paths.data, glyph: Database, label: "Data", section: "data" },
  { to: paths.marketplace, glyph: Store, label: "Marketplace", section: "marketplace" }
] as const

function MorePanel({ route }: { readonly route: Route }) {
  return (
    <>
      <MenuList>
        <MenuItem to={paths.more} glyph={LayoutGrid} label="Alles" active={route.name === "more"} />
        {MORE.map((item) => (
          <MenuItem
            key={item.to}
            to={item.to}
            glyph={item.glyph}
            label={item.label}
            active={route.name === "area" && route.area === item.section}
          />
        ))}
      </MenuList>
      <MenuGroup title="Ontwerp">
        <MenuItem to={paths.parts} glyph={LayoutGrid} label="Onderdelen" active={route.name === "parts"} />
        <MenuItem to={paths.brand} glyph={Sparkle} label="Merk" active={route.name === "brand"} />
      </MenuGroup>
      <MenuFoot>
        <MenuButton to={paths.settings("koppelingen")} glyph={Workflow} label="Koppelingen" />
      </MenuFoot>
    </>
  )
}

function GenericPanel({ section, pathname }: { readonly section: string; readonly pathname: string }) {
  return (
    <>
      <MenuList>
        <MenuItem
          to={paths.section(section)}
          glyph={LayoutGrid}
          label="Overzicht"
          active={pathname === paths.section(section)}
        />
      </MenuList>
      <p className="px-2 text-xs text-ink-3">
        De rest van dit menu komt als {sectionLabel(section).toLowerCase()} in versie 2 ontworpen is.
      </p>
    </>
  )
}
