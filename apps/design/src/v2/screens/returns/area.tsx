import type { AreaDef, MenuProps } from "../../areas.ts"
import { money } from "../../fixtures/order-desk.ts"
import { customer, product } from "../../fixtures/records.ts"
import {
  amountOf,
  awaitingParcel,
  findReturn,
  readyToResolve,
  REASON_LABEL,
  STATUS,
  toReview,
  useReturnsState
} from "../../fixtures/returns.ts"
import { paths } from "../../router.tsx"
import { MenuFoot, MenuItem, MenuList } from "../../shell/nav.tsx"
import { Check, Inbox, Returns, Settings, Truck } from "../../ui/icons.tsx"
import { ReturnsList } from "./list.tsx"
import { ReturnRecordPage } from "./record.tsx"

/** Retouren: the list in its views and one return (`areas.ts`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const id = route.path[0]
    return id === undefined ? <ReturnsList /> : <ReturnRecordPage id={id} />
  },
  thread: (route) => {
    const id = route.path[0]
    if (id === undefined) return { items: [{ kind: "page", label: "Retouren" }], ask: "Retouren" }
    const r = findReturn(id)
    if (r === undefined) return { items: [{ kind: "page", label: "Retouren", href: paths.returns }], ask: null }
    const who = customer(r.customerId)
    const p = product(r.productId)
    return {
      items: [
        {
          kind: "return",
          label: `Retour ${r.number}`,
          meta: STATUS[r.status].label.toLowerCase(),
          peek: [REASON_LABEL[r.reason], money(amountOf(r))]
        },
        { kind: "order", label: `#${r.orderNumber}`, href: paths.order(r.orderNumber) },
        {
          kind: "customer",
          label: who?.name ?? r.customerId,
          href: paths.customer(r.customerId),
          peek: [who?.email ?? ""]
        },
        { kind: "product", label: p?.name ?? r.productId, href: paths.product(r.productId), meta: `maat ${r.size}` }
      ],
      ask: `Retour ${r.number}`
    }
  },
  Menu: ReturnsMenu
}

function ReturnsMenu({ route, pathname }: MenuProps) {
  const s = useReturnsState()
  const weergave = new URLSearchParams(route.search).get("weergave")
  const on = (v: string | null) => pathname === paths.returns && weergave === v
  return (
    <>
      <MenuList>
        <MenuItem to={paths.returns} glyph={Returns} label="Open retouren" active={on(null)} />
        <MenuItem
          to={`${paths.returns}?weergave=beoordelen`}
          glyph={Inbox}
          label="Te beoordelen"
          count={toReview(s).length}
          active={on("beoordelen")}
        />
        <MenuItem
          to={`${paths.returns}?weergave=onderweg`}
          glyph={Truck}
          label="Wacht op pakket"
          count={awaitingParcel(s).length}
          active={on("onderweg")}
        />
        <MenuItem
          to={`${paths.returns}?weergave=afhandelen`}
          glyph={Check}
          label="Af te handelen"
          count={readyToResolve(s).length}
          active={on("afhandelen")}
        />
      </MenuList>
      <MenuFoot>
        <MenuItem to={paths.settings("retouren")} glyph={Settings} label="Retourinstellingen" active={false} />
      </MenuFoot>
    </>
  )
}
