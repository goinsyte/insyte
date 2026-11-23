import type { AreaDef, MenuProps } from "../../areas.ts"
import {
  CASE_STATUS,
  CHANNEL_LABEL,
  dueSoon,
  findCase,
  openCases,
  timeLeft,
  useCases
} from "../../fixtures/chargebacks.ts"
import { money } from "../../fixtures/order-desk.ts"
import { customer } from "../../fixtures/records.ts"
import { paths } from "../../router.tsx"
import { MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { Clock, CreditCard, FileText } from "../../ui/icons.tsx"
import { ChargebacksList } from "./list.tsx"
import { ChargebackRecord } from "./record.tsx"

/** Chargebacks: the cases and one case (`areas.ts`). The URL holds the id in lower case. */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const id = route.path[0]
    return id === undefined ? <ChargebacksList /> : <ChargebackRecord id={id} />
  },
  thread: (route) => {
    const id = route.path[0]
    if (id === undefined) return { items: [{ kind: "page", label: "Chargebacks" }], ask: "Chargebacks" }
    const c = findCase(id)
    if (c === undefined) return { items: [{ kind: "page", label: "Chargebacks", href: paths.chargebacks }], ask: null }
    const who = customer(c.customerId)
    const items: Array<ThreadItem> = [
      {
        kind: "chargeback",
        label: c.id,
        meta: CASE_STATUS[c.status].label.toLowerCase(),
        peek: [`${CHANNEL_LABEL[c.channel]} · ${money(c.amount)}`, c.reason, timeLeft(c.dueAt)]
      },
      {
        kind: "order",
        label: `#${c.orderNumber}`,
        ...(c.linked ? { href: paths.order(c.orderNumber) } : { meta: "ouder dan de demo" })
      },
      {
        kind: "customer",
        label: who?.name ?? c.customerId,
        href: paths.customer(c.customerId),
        peek: [who?.email ?? ""]
      }
    ]
    if (c.draftedBy !== undefined) {
      items.push({
        kind: "agent",
        label: c.draftedBy.agent,
        href: paths.agent(c.draftedBy.agentId),
        meta: "stelde het bewijspakket op"
      })
    }
    return { items, ask: `Chargeback ${c.id}` }
  },
  Menu: ChargebacksMenu
}

function ChargebacksMenu({ route, pathname }: MenuProps) {
  const s = useCases()
  const weergave = new URLSearchParams(route.search).get("weergave")
  const list = pathname === paths.chargebacks
  const soon = dueSoon(s)
  return (
    <MenuList>
      <MenuItem
        to={paths.chargebacks}
        glyph={CreditCard}
        label="Open zaken"
        count={openCases(s).length}
        active={list && weergave === null}
      />
      {soon.length > 0 && (
        <MenuItem
          to={soon.length === 1 ? paths.chargeback(soon[0]?.id ?? "") : paths.chargebacks}
          glyph={Clock}
          label="Deadline binnen 48 uur"
          count={soon.length}
          active={soon.length === 1 && pathname === paths.chargeback(soon[0]?.id ?? "")}
        />
      )}
      <MenuItem
        to={`${paths.chargebacks}?weergave=gesloten`}
        glyph={FileText}
        label="Afgesloten"
        active={list && weergave === "gesloten"}
      />
    </MenuList>
  )
}
