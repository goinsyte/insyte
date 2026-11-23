import type { AreaDef } from "../../areas.ts"
import { customerCounts, findCustomer, getCustomerState, useCustomerState } from "../../fixtures/customers.ts"
import { euro, ORDER_STATUS, when } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths, useQuery } from "../../router.tsx"
import { MenuGroup, MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { AlertTriangle, Award, GitMerge, Star, UserPlus, Users } from "../../ui/icons.tsx"
import { getView, useView } from "../../view.ts"
import { CustomerDetail, threadParts } from "./detail.tsx"
import { CustomersList } from "./list.tsx"

const segmentHref = (seg: string) => `${paths.customers}?segment=${seg}`

/** Klanten: the list (`/v2/klanten`) and one profile (`/v2/klanten/:id`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id] = route.path
    return id === undefined ? <CustomersList /> : <CustomerDetail id={id} />
  },
  thread: (route) => {
    const [id] = route.path
    if (id === undefined) {
      return {
        items: [
          { kind: "page", label: "Klanten" },
          {
            kind: "customer",
            label: "Felix Muller",
            href: paths.customer("felix-muller"),
            meta: "staat er twee keer in",
            peek: ["Vip · Düsseldorf", "Tweede profiel via gastafrekenen", "Chargeback CB-2291 loopt"]
          },
          {
            kind: "customer",
            label: "Hannah Schmidt",
            href: paths.customer("hannah-schmidt"),
            meta: "pakket kwijt",
            peek: ["Vaste klant sinds jan 2025", "Ticket #5141 · DPD sluit claims om 17:00"]
          }
        ],
        ask: "Klanten"
      }
    }
    const row = findCustomer(id, getView(), getCustomerState())
    if (row === undefined) return { items: [{ kind: "page", label: "Klant niet gevonden" }], ask: null }
    const { latest, ticket, count } = threadParts(id)
    const items: Array<ThreadItem> = [
      {
        kind: "customer",
        label: row.name,
        peek: [`${count} · ${euro(row.value)} klantwaarde`, `Klant sinds ${row.since}`]
      }
    ]
    if (latest !== undefined) {
      items.push({
        kind: "order",
        label: `#${latest.number}`,
        href: paths.order(latest.number),
        meta: `laatste bestelling · ${when(latest.placedAt)}`,
        peek: [ORDER_STATUS[latest.status].label, euro(latest.total)]
      })
    }
    if (ticket !== undefined) {
      items.push({
        kind: ticket.kind === "ticket" ? "ticket" : "chargeback",
        label: ticket.kind === "ticket" ? `#${ticket.id}` : ticket.id,
        href: ticket.kind === "ticket" ? paths.ticket(ticket.id) : paths.chargeback(ticket.id),
        meta: ticket.status.toLowerCase(),
        peek: [ticket.title, ticket.detail]
      })
      if (ticket.assignee !== null) {
        const p = PEOPLE[ticket.assignee]
        items.push({ kind: "person", label: p.name, href: paths.person(p.id), meta: "heeft het", peek: [p.role] })
      }
    }
    return { items, ask: `Klant ${row.name}` }
  },
  Menu: ({ pathname }) => {
    const view = useView()
    const s = useCustomerState()
    const segment = useQuery("segment")
    const counts = customerCounts(view, s)
    const here = (seg: string | null) => pathname === paths.customers && segment === seg
    return (
      <>
        <MenuList>
          <MenuItem to={paths.customers} glyph={Users} label="Alle klanten" count={counts.all} active={here(null)} />
          <MenuItem
            to={`${paths.customers}?samenvoegen=1`}
            glyph={GitMerge}
            label="Dubbele profielen"
            count={counts.dubbel}
            active={false}
          />
        </MenuList>
        <MenuGroup title="Segmenten">
          <MenuItem to={segmentHref("vip")} glyph={Star} label="VIP" count={counts.vip} active={here("vip")} />
          <MenuItem to={segmentHref("trouw")} glyph={Award} label="Trouw" active={here("trouw")} />
          <MenuItem
            to={segmentHref("nieuw")}
            glyph={UserPlus}
            label="Nieuw"
            count={counts.nieuw}
            active={here("nieuw")}
          />
          <MenuItem
            to={segmentHref("risico")}
            glyph={AlertTriangle}
            label="Risico"
            count={counts.risico}
            active={here("risico")}
          />
        </MenuGroup>
      </>
    )
  }
}
