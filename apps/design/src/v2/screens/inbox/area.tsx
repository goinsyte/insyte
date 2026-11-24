import type { AreaDef, MenuProps } from "../../areas.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { CONVERSATIONS, STORE_CHATS, ticket, TICKET_STATUS, waited, waitedMinutes } from "../../fixtures/inbox.ts"
import { customer, order, ORDER_STATUS } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import type { AreaRoute } from "../../router.tsx"
import { paths } from "../../router.tsx"
import { MenuButton, MenuFoot, MenuGroup, MenuItem, MenuList } from "../../shell/nav.tsx"
import type { Thread, ThreadItem } from "../../shell/threads.ts"
import { useAccess } from "../../ui/access.tsx"
import {
  AlertOctagon,
  Archive,
  CheckCircle,
  Clock,
  Inbox,
  MessagesSquare,
  Plus,
  Star,
  Ticket,
  User,
  UserX
} from "../../ui/icons.tsx"
import { InboxScreen, inView, VIEWS } from "./inbox.tsx"
import type { ViewId } from "./inbox.tsx"
import { customerName } from "./record.tsx"
import { StoreChatScreen } from "./store-chat.tsx"
import { getInbox, ticketsOf, useTickets } from "./store.ts"
import { TeamChatScreen, useTeamChatUnread } from "./team-chat.tsx"
import { TicketsScreen } from "./tickets.tsx"

/** Which page of the area a route is: the inbox (with a ticket open or not), the board, the chats. */
type Page =
  | { readonly kind: "inbox"; readonly ticket: string | null }
  | { readonly kind: "tickets" }
  | { readonly kind: "teamchat" }
  | { readonly kind: "winkelchat" }

function pageOf(route: AreaRoute): Page {
  if (route.base === "live/winkelchat") return { kind: "winkelchat" }
  const [first] = route.path
  if (first === "tickets") return { kind: "tickets" }
  if (first === "teamchat") return { kind: "teamchat" }
  return { kind: "inbox", ticket: first ?? null }
}

function Screen({ route }: { readonly route: AreaRoute }) {
  const page = pageOf(route)
  switch (page.kind) {
    case "tickets":
      return <TicketsScreen />
    case "teamchat":
      return <TeamChatScreen />
    case "winkelchat":
      return <StoreChatScreen />
    case "inbox":
      return <InboxScreen ticketId={page.ticket} search={route.search} />
  }
}

/** The werkdraad of a ticket: who asked, the order it is about, who has it, what else it touches. */
function ticketThread(number: string): Thread {
  const t = ticket(number, ticketsOf(getInbox(), false))
  if (t === undefined) {
    return {
      items: [{ kind: "page", label: "Inbox", href: paths.inbox }, { kind: "ticket", label: `Ticket #${number}` }],
      ask: null
    }
  }
  const c = customer(t.customerId)
  const o = t.order === undefined ? undefined : order(t.order)
  const mins = waitedMinutes(t)
  const items: Array<ThreadItem> = [
    {
      kind: "ticket",
      label: `Ticket #${t.number}`,
      meta: mins === null ? TICKET_STATUS[t.status].label.toLowerCase() : `wacht ${waited(mins)}`,
      peek: [t.subject, `${TICKET_STATUS[t.status].label} · ${t.deadline?.text ?? `sinds ${t.createdAt}`}`]
    }
  ]
  items.push({
    kind: "customer",
    label: customerName(t),
    ...(c === undefined ? {} : { href: paths.customer(c.id) }),
    meta: "vraagt",
    peek: c === undefined ? [t.handle] : [c.email, `${c.ordersCount} bestellingen · ${c.city}`]
  })
  if (o !== undefined) {
    items.push({
      kind: "order",
      label: `Bestelling #${o.number}`,
      href: paths.order(o.number),
      meta: ORDER_STATUS[o.status].label.toLowerCase(),
      peek: [`${o.carrier} · ${ORDER_STATUS[o.status].label}`]
    })
  }
  if (t.also?.kind === "chargeback") {
    items.push({ kind: "chargeback", label: t.also.label, href: paths.chargeback(t.also.id), meta: "loopt nog" })
  } else if (t.also?.kind === "supplier") {
    items.push({ kind: "supplier", label: t.also.label, href: paths.supplier(t.also.id), meta: "leverancier" })
  } else if (t.also?.kind === "product") {
    items.push({ kind: "product", label: t.also.label, href: paths.product(t.also.id) })
  }
  if (t.assignee !== null) {
    const p = PEOPLE[t.assignee]
    items.push({ kind: "person", label: p.name, href: paths.person(p.id), meta: "heeft het", peek: [p.role] })
  } else {
    const agentEntry = t.entries.findLast((e) => e.kind === "agent")
    const agent = agentEntry?.kind === "agent" ? AGENTS.find((a) => a.id === agentEntry.agentId) : undefined
    if (agent !== undefined) {
      items.push({ kind: "agent", label: agent.name, href: paths.agent(agent.id), meta: "niet toegewezen" })
    }
  }
  return { items, ask: `Ticket #${t.number}` }
}

function thread(route: AreaRoute): Thread {
  const page = pageOf(route)
  const q = new URLSearchParams(route.search)
  switch (page.kind) {
    case "tickets":
      return { items: [{ kind: "page", label: "Tickets" }], ask: "Tickets" }
    case "teamchat": {
      const c = CONVERSATIONS.find((x) => x.id === q.get("kanaal"))
      if (c === undefined) return { items: [{ kind: "page", label: "Teamchat" }], ask: null }
      return {
        items: [
          { kind: "page", label: "Teamchat", href: paths.teamChat },
          { kind: "chat", label: c.kind === "kanaal" ? `#${c.name}` : c.name, meta: c.topic }
        ],
        ask: c.kind === "kanaal" ? `#${c.name}` : null
      }
    }
    case "winkelchat": {
      const c = STORE_CHATS.find((x) => x.id === q.get("chat"))
      const base: ThreadItem = { kind: "page", label: "Winkelchat", href: paths.storeChat }
      if (c === undefined) return { items: [{ kind: "page", label: "Winkelchat" }], ask: "Winkelchat" }
      const known = c.customerId === undefined ? undefined : customer(c.customerId)
      return {
        items: [
          base,
          { kind: "chat", label: c.about, meta: c.state === "overgedragen" ? "wacht op jou" : "afgehandeld" },
          ...(known === undefined
            ? []
            : [{ kind: "customer" as const, label: known.name, href: paths.customer(known.id) }])
        ],
        ask: null
      }
    }
    case "inbox": {
      if (page.ticket !== null) return ticketThread(page.ticket)
      const view = q.get("weergave")
      const label = view !== null && view in VIEWS ? VIEWS[view as ViewId] : "Inbox"
      return { items: [{ kind: "page", label }], ask: "Inbox" }
    }
  }
}

function InboxMenu({ route, pathname }: MenuProps) {
  const tickets = useTickets()
  const chatUnread = useTeamChatUnread()
  const access = useAccess("support")
  const q = new URLSearchParams(route.search)
  const onInbox = pathname === paths.inbox || pathname.startsWith(`${paths.inbox}/`) &&
      /^\d+$/.test(pathname.slice(paths.inbox.length + 1))
  const view = q.get("weergave")
  const count = (v: ViewId) => tickets.filter((t) => inView(t, v)).length
  const viewItem = (v: Exclude<ViewId, "open">, glyph: typeof Inbox, hint?: string) => (
    <MenuItem
      key={v}
      to={`${paths.inbox}?weergave=${v}`}
      glyph={glyph}
      label={VIEWS[v]}
      count={count(v)}
      hint={hint}
      active={onInbox && view === v}
    />
  )
  return (
    <>
      <MenuList>
        <MenuItem
          to={paths.inbox}
          glyph={Inbox}
          label="Inbox"
          count={count("open")}
          active={onInbox && (view === null || view === "open")}
        />
        <MenuItem to={paths.tickets} glyph={Ticket} label="Tickets" active={pathname === paths.tickets} />
        <MenuItem
          to={paths.teamChat}
          glyph={MessagesSquare}
          label="Teamchat"
          count={chatUnread}
          hint="Ongelezen berichten"
          active={pathname === paths.teamChat}
        />
      </MenuList>
      <MenuGroup title="Weergaven">
        <MenuList>
          {viewItem("mij", User)}
          {viewItem("niet-toegewezen", UserX)}
          {viewItem("wacht", Clock, "Klanten die het langst wachten")}
          {viewItem("klaar", CheckCircle)}
          {viewItem("ster", Star)}
        </MenuList>
      </MenuGroup>
      <MenuGroup title="Bewaard">
        <MenuList>
          {viewItem("archief", Archive)}
          {viewItem("spam", AlertOctagon)}
        </MenuList>
      </MenuGroup>
      {access.edit && (
        <MenuFoot>
          <MenuButton to={`${paths.tickets}?nieuw=1`} glyph={Plus} label="Nieuw ticket" />
        </MenuFoot>
      )}
    </>
  )
}

/** Inbox: the area's entry for the shell (`areas.ts`). */
export const area: AreaDef = { Screen, thread, Menu: InboxMenu }
