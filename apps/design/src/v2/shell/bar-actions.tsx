import { useEffect, useState } from "react"
import { ASK_ASSISTANT } from "../assistant.ts"
import { setNotesRead, unreadNotes, useDemo } from "../demo.ts"
import { AGENTS } from "../fixtures/agents.ts"
import { NOTIFICATIONS } from "../fixtures/notifications.ts"
import { ME, RECORDS } from "../fixtures/workspace.ts"
import { navigate, paths } from "../router.tsx"
import { AgentAvatar, Avatar } from "../ui/avatar.tsx"
import { IconButton } from "../ui/button.tsx"
import { CommandPalette } from "../ui/command.tsx"
import type { Command } from "../ui/command.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../ui/dropdown.tsx"
import {
  Bell,
  Bot,
  CreditCard,
  Eye,
  Factory,
  Home,
  Inbox,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  User,
  Workflow
} from "../ui/icons.tsx"
import { GlyphTile } from "../ui/list.tsx"
import { NotificationList } from "../ui/notifications.tsx"
import { Popover } from "../ui/popover.tsx"
import { Rich } from "../ui/rich.tsx"
import { ThemePicker } from "../ui/theme-picker.tsx"
import { toast } from "../ui/toast.tsx"
import { DemoViewDialog } from "./demo-view.tsx"
import { SECTIONS } from "./sections.ts"

/*
 * The main bar's right end: Nieuw, Zoeken (⌘K), Meldingen and the avatar menu, each built from the
 * library (`DropdownMenu`, `CommandPalette`, `Popover`, `NotificationList`, `ThemePicker`).
 */

/** "Nieuw": the records you can start from anywhere. */
export function NewMenu() {
  return (
    <DropdownMenu
      label="Nieuw"
      placement="bottom-end"
      trigger={(props) => (
        <IconButton label="Nieuw" {...props}>
          <Plus />
        </IconButton>
      )}
    >
      <DropdownItem glyph={ShoppingBag} shortcut="B" onSelect={() => navigate(`${paths.orders}?nieuw=1`)}>
        Bestelling
      </DropdownItem>
      <DropdownItem glyph={Inbox} shortcut="T" onSelect={() => navigate(`${paths.tickets}?nieuw=1`)}>
        Ticket
      </DropdownItem>
      <DropdownItem glyph={Workflow} onSelect={() => navigate(`${paths.automations}?nieuw=1`)}>
        Automatisering
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem glyph={Bot} hint="met Magnus" onSelect={() => navigate(paths.newChat("Nieuwe agent"))}>
        Agent
      </DropdownItem>
    </DropdownMenu>
  )
}

const COMMANDS: ReadonlyArray<Command> = [
  ...SECTIONS.map((section) => ({
    id: `ga-${section.id}`,
    label: section.label,
    group: "Ga naar",
    glyph: section.glyph ?? MessageSquare,
    run: () => navigate(section.href)
  })),
  {
    id: "kit",
    label: "Onderdelen",
    group: "Ga naar",
    glyph: LayoutGrid,
    keywords: "kit ui componenten",
    run: () => navigate(paths.parts)
  },
  {
    id: "rec-aurora",
    label: RECORDS.aurora.label,
    group: "Records",
    glyph: Package,
    meta: "Product · € 79,00",
    run: () => navigate(RECORDS.aurora.href)
  },
  {
    id: "rec-kestrel",
    label: RECORDS.kestrel.label,
    group: "Records",
    glyph: Factory,
    meta: "Leverancier",
    run: () => navigate(RECORDS.kestrel.href)
  },
  {
    id: "rec-cb",
    label: "Chargeback #CB-2291",
    group: "Records",
    glyph: CreditCard,
    meta: "Klarna · € 129,00",
    keywords: "klarna dispuut",
    run: () => navigate("/v2/chargebacks/cb-2291")
  },
  ...AGENTS.slice(0, 3).map((agent) => ({
    id: `agent-${agent.id}`,
    label: agent.name,
    group: "Agents",
    glyph: agent.glyph,
    run: () => navigate(paths.agent(agent.id))
  })),
  {
    id: "act-ticket",
    label: "Nieuw ticket",
    group: "Acties",
    glyph: Plus,
    shortcut: "T",
    run: () => navigate(`${paths.tickets}?nieuw=1`)
  },
  {
    id: "act-settings",
    label: "Instellingen",
    group: "Acties",
    glyph: Settings,
    run: () => navigate(paths.settings())
  }
]

/** The search button and ⌘K: both open the palette. */
export function SearchButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
  return (
    <>
      <IconButton label="Zoeken (⌘K)" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Search />
      </IconButton>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        commands={COMMANDS}
        askLabel={(query) => <>{ASK_ASSISTANT}: ‘{query}’</>}
        onAsk={(query) => navigate(paths.newChat(query))}
      />
    </>
  )
}

function noteMark(from: (typeof NOTIFICATIONS)[number]["from"]) {
  if (from.kind === "person") return <Avatar name={from.name} size={26} />
  if (from.kind === "agent") {
    const agent = AGENTS.find((a) => a.id === from.agentId)
    return agent === undefined
      ? (
        <GlyphTile size={26}>
          <Bot size={14} />
        </GlyphTile>
      )
      : <AgentAvatar glyph={agent.glyph} size={26} />
  }
  return (
    <GlyphTile size={26}>
      <Bell size={14} />
    </GlyphTile>
  )
}

/** The bell: the unread count on the glyph, the newest notifications in a popover. */
export function NotificationsButton() {
  const demo = useDemo()
  const read = demo.notesRead
  const unread = unreadNotes(demo)
  const items = NOTIFICATIONS.map((n) => ({
    id: n.id,
    mark: noteMark(n.from),
    text: <Rich text={n.text} />,
    at: n.at,
    href: n.href,
    unread: n.unread && !read
  }))
  return (
    <Popover
      label="Meldingen"
      placement="bottom-end"
      width="w-[min(24rem,calc(100vw-1rem))]"
      trigger={(props) => (
        <IconButton label={unread === 0 ? "Meldingen" : `Meldingen, ${unread} ongelezen`} {...props}>
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-bad ring-2 ring-bar"
            />
          )}
        </IconButton>
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Meldingen</h2>
        <button
          type="button"
          disabled={unread === 0}
          onClick={() => {
            setNotesRead(true)
            toast({
              title: "Alles gelezen",
              tone: "good",
              action: { label: "Ongedaan maken", onClick: () => setNotesRead(false) }
            })
          }}
          className="rounded-xs text-xs text-ink-3 hover:text-ink disabled:text-ink-4"
        >
          Alles gelezen
        </button>
      </div>
      <div className="pane-scroll max-h-[60vh] p-1.5">
        <NotificationList items={items} />
      </div>
    </Popover>
  )
}

/**
 * The avatar: who is signed in, the theme, the way to the profile, the kit and out, and the demo's
 * own view (`demo-view.tsx`). In a portal it says who the portal is signed in as and leads back.
 */
export function AvatarMenu({ portal }: { readonly portal?: { readonly name: string; readonly who: string } }) {
  const [demo, setDemo] = useState(false)
  const name = portal?.who ?? ME.name
  return (
    <>
      <DropdownMenu
        label="Account"
        placement="bottom-end"
        width="w-72"
        trigger={(props) => (
          <button type="button" aria-label={`Account, ${name}`} className="rounded-full" {...props}>
            <Avatar name={name} size={26} presence={portal === undefined ? ME.presence : undefined} on="panel" />
          </button>
        )}
      >
        <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-2">
          <Avatar name={name} size={32} presence={portal === undefined ? ME.presence : undefined} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">{name}</span>
            <span className="truncate text-xs text-ink-3">
              {portal === undefined ? `${ME.role} · Northwind` : `${portal.name} · Northwind`}
            </span>
          </span>
        </div>
        <DropdownSeparator />
        <DropdownLabel>Thema</DropdownLabel>
        <div role="group" aria-label="Thema" className="px-2 pt-0.5 pb-2">
          <ThemePicker layout="stack" />
        </div>
        <DropdownSeparator />
        {portal === undefined
          ? (
            <>
              <DropdownItem glyph={User} onSelect={() => navigate(paths.person(ME.id))}>Je profiel</DropdownItem>
              <DropdownItem glyph={Settings} onSelect={() => navigate(paths.settings())}>Instellingen</DropdownItem>
              <DropdownItem glyph={LayoutGrid} onSelect={() => navigate(paths.parts)}>Onderdelen</DropdownItem>
            </>
          )
          : (
            <DropdownItem glyph={Home} onSelect={() => navigate(paths.home)}>
              Terug naar Northwind, beheer
            </DropdownItem>
          )}
        <DropdownItem glyph={Eye} hint="ontwerp" onSelect={() => setDemo(true)}>Demoweergave</DropdownItem>
        <DropdownSeparator />
        <DropdownItem glyph={LogOut} onSelect={() => navigate(paths.login)}>Uitloggen</DropdownItem>
      </DropdownMenu>
      <DemoViewDialog open={demo} onClose={() => setDemo(false)} />
    </>
  )
}
