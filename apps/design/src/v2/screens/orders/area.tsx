import type { AreaDef, MenuProps } from "../../areas.ts"
import { CHANNEL_LABEL, orderCases } from "../../fixtures/chargebacks.ts"
import {
  busyName,
  deskOrder,
  forwardingWork,
  lateOrders,
  money,
  ORDER_TICKETS,
  statusOf,
  suppliersOf,
  todayOrders,
  useDesk
} from "../../fixtures/order-desk.ts"
import { customer, supplier } from "../../fixtures/records.ts"
import { orderReturns, STATUS as RETURN_STATUS } from "../../fixtures/returns.ts"
import { paths } from "../../router.tsx"
import { MenuButton, MenuFoot, MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { AlertTriangle, Clock, Factory, Plus, ShoppingBag } from "../../ui/icons.tsx"
import { ForwardingQueue } from "./forwarding.tsx"
import { OrdersList } from "./list.tsx"
import { OrderRecord } from "./record.tsx"

/** The queue of what has not gone to a supplier yet. */
const FORWARDING = `${paths.orders}/bij-leverancier`

/** Bestellingen: the list, the supplier queue and one order (`areas.ts`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const first = route.path[0]
    if (first === undefined) return <OrdersList />
    if (first === "bij-leverancier") return <ForwardingQueue />
    return <OrderRecord number={first} />
  },
  thread: (route) => {
    const first = route.path[0]
    if (first === undefined) return { items: [{ kind: "page", label: "Bestellingen" }], ask: "Bestellingen" }
    if (first === "bij-leverancier") {
      return {
        items: [{ kind: "page", label: "Bestellingen", href: paths.orders }, {
          kind: "page",
          label: "Bij leverancier"
        }],
        ask: "Bij leverancier"
      }
    }
    const o = deskOrder(first)
    if (o === undefined) return { items: [{ kind: "page", label: "Bestellingen", href: paths.orders }], ask: null }
    const who = customer(o.customerId)
    const items: Array<ThreadItem> = [
      {
        kind: "order",
        label: `#${o.number}`,
        meta: statusOf(o).label.toLowerCase(),
        peek: [money(o.total), o.carrier, o.payment]
      },
      {
        kind: "customer",
        label: busyName(o, false),
        href: paths.customer(o.customerId),
        peek: [who?.email ?? "", who?.city ?? ""].filter((s) => s !== "")
      },
      ...suppliersOf(o).map((s): ThreadItem => ({
        kind: "supplier",
        label: supplier(s)?.name ?? s,
        href: paths.supplier(s),
        peek: [`Belofte ${supplier(s)?.promiseDays ?? "?"}`]
      }))
    ]
    const ticket = ORDER_TICKETS[o.number]
    if (ticket !== undefined) {
      items.push({
        kind: "ticket",
        label: `Ticket #${ticket.id}`,
        href: paths.ticket(ticket.id),
        meta: ticket.subject.toLowerCase(),
        peek: [ticket.meta]
      })
    }
    for (const r of orderReturns(o.number)) {
      items.push({
        kind: "return",
        label: `Retour ${r.number}`,
        href: paths.return(r.id),
        meta: RETURN_STATUS[r.status].label.toLowerCase()
      })
    }
    for (const c of orderCases(o.number)) {
      items.push({
        kind: "chargeback",
        label: c.id,
        href: paths.chargeback(c.id),
        meta: `${CHANNEL_LABEL[c.channel]} · ${money(c.amount)}`
      })
    }
    return { items, ask: `Bestelling #${o.number}` }
  },
  Menu: OrdersMenu
}

function OrdersMenu({ route, pathname }: MenuProps) {
  const desk = useDesk()
  const q = new URLSearchParams(route.search)
  const plain = pathname === paths.orders
  const only = (key: string, value: string) =>
    plain && q.get(key) === value && [...q.keys()].every((k) => k === key || k === "pagina")
  return (
    <>
      <MenuList>
        <MenuItem
          to={paths.orders}
          glyph={ShoppingBag}
          label="Alle bestellingen"
          active={plain && q.toString() === ""}
        />
        <MenuItem
          to={`${paths.orders}?periode=vandaag`}
          glyph={Clock}
          label="Vandaag"
          count={todayOrders(desk).length}
          active={only("periode", "vandaag")}
        />
        <MenuItem
          to={`${paths.orders}?status=vertraagd`}
          glyph={AlertTriangle}
          label="Vertraagd"
          count={lateOrders(desk).length}
          active={only("status", "vertraagd")}
        />
        <MenuItem
          to={FORWARDING}
          glyph={Factory}
          label="Bij leverancier"
          count={forwardingWork(desk)}
          hint="Te versturen en fouten"
          active={pathname === FORWARDING}
        />
      </MenuList>
      <MenuFoot>
        <MenuButton to={`${paths.orders}?nieuw=1`} glyph={Plus} label="Nieuwe bestelling" />
      </MenuFoot>
    </>
  )
}
