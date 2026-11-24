import { useState } from "react"
import { setNotesRead, unreadNotes, useDemo } from "../demo.ts"
import { AGENTS } from "../fixtures/agents.ts"
import { bellNotes, noteAbout } from "../fixtures/notifications.ts"
import type { NOTIFICATIONS } from "../fixtures/notifications.ts"
import { ME } from "../fixtures/workspace.ts"
import { navigate, paths } from "../router.tsx"
import { AgentAvatar, Avatar } from "../ui/avatar.tsx"
import { IconButton } from "../ui/button.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../ui/dropdown.tsx"
import {
  Bell,
  Bot,
  Eye,
  Home,
  Keyboard,
  LayoutGrid,
  LayoutList,
  LogOut,
  Plus,
  Search,
  Settings,
  User
} from "../ui/icons.tsx"
import { GlyphTile } from "../ui/list.tsx"
import { NotificationList } from "../ui/notifications.tsx"
import { Popover } from "../ui/popover.tsx"
import { Rich } from "../ui/rich.tsx"
import { ServiceLogo } from "../ui/service-logo.tsx"
import { ThemePicker } from "../ui/theme-picker.tsx"
import { toast } from "../ui/toast.tsx"
import { useView } from "../view.ts"
import { CREATE_ITEMS, createBlocked } from "./create.ts"
import { DemoViewDialog } from "./demo-view.tsx"
import { openOverlay } from "./shell-state.ts"
import { useWorkspaces } from "./store-switcher.tsx"

/*
 * The main bar's right end: Nieuw, Zoeken (⌘K), Meldingen and the avatar menu, each built from the
 * library (`DropdownMenu`, `Popover`, `NotificationList`, `ThemePicker`); the palette itself is
 * `palette.tsx`.
 */

/**
 * "Nieuw": everything the console can make (`create.ts`), each opening its dialog on its own page.
 * What the role may not make, or what starts from another record, stays listed, greyed, with the
 * short reason; the palette says it in full.
 */
export function NewMenu() {
  const view = useView()
  return (
    <DropdownMenu
      label="Nieuw"
      placement="bottom-end"
      width="w-64"
      trigger={(props) => (
        <IconButton label="Nieuw" {...props}>
          <Plus />
        </IconButton>
      )}
    >
      <DropdownLabel>Nieuw</DropdownLabel>
      {CREATE_ITEMS.map((item) => {
        const blocked = createBlocked(view, item)
        return (
          <DropdownItem
            key={item.kind}
            glyph={item.glyph}
            shortcut={blocked === null ? item.key : undefined}
            hint={blocked === null ? undefined : item.startsFrom === undefined ? "geen rechten" : "via record"}
            disabled={blocked !== null}
            onSelect={() => navigate(item.href)}
          >
            {item.label}
          </DropdownItem>
        )
      })}
      <DropdownSeparator />
      <DropdownItem glyph={Bot} hint="met Magnus" onSelect={() => navigate(paths.newChat("Nieuwe agent"))}>
        Agent
      </DropdownItem>
    </DropdownMenu>
  )
}

/** The search button: opens the palette, as ⌘K does anywhere (`keys.ts`, `palette.tsx`). */
export function SearchButton() {
  return (
    <IconButton label="Zoeken (⌘K)" onClick={() => openOverlay("palette")} aria-haspopup="dialog">
      <Search />
    </IconButton>
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
  if (from.service !== undefined) return <ServiceLogo service={from.service} size={26} />
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
  const items = bellNotes().map((n) => ({
    id: n.id,
    mark: noteMark(n.from),
    text: <Rich text={n.text} />,
    at: n.at,
    href: n.href,
    unread: n.unread && !read,
    about: noteAbout(n)
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
        <NotificationList items={items} tabs />
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
  const { current } = useWorkspaces()
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
              {portal === undefined ? `${current.role} · ${current.name}` : `${portal.name} · Northwind`}
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
              <DropdownItem glyph={Keyboard} shortcut="?" onSelect={() => openOverlay("shortcuts")}>
                Sneltoetsen
              </DropdownItem>
              <DropdownItem glyph={LayoutList} onSelect={() => openOverlay("customise")}>
                Zijbalk aanpassen
              </DropdownItem>
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
