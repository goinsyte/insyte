import type { AreaDef } from "../../areas.ts"
import {
  daysUnderway,
  decimal,
  findSupplier,
  getSupplierState,
  supplierCounts,
  useSupplierState
} from "../../fixtures/suppliers.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths, useQuery } from "../../router.tsx"
import { MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { Clock, Factory, Mail, Plug } from "../../ui/icons.tsx"
import { getView, useView } from "../../view.ts"
import { SupplierDetail } from "./detail.tsx"
import { SuppliersList } from "./list.tsx"

const viewHref = (w: string) => `${paths.suppliers}?weergave=${w}`

/** Leveranciers: the list (`/v2/leveranciers`) and one supplier (`/v2/leveranciers/:id`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id] = route.path
    return id === undefined ? <SuppliersList /> : <SupplierDetail id={id} />
  },
  thread: (route) => {
    const [id] = route.path
    if (id === undefined) {
      return {
        items: [
          { kind: "page", label: "Leveranciers" },
          {
            kind: "supplier",
            label: "Kestrel Goods",
            href: paths.supplier("kestrel-goods"),
            meta: "6 bestellingen te laat",
            peek: ["Levert in 6,1 dagen, belooft 5", "Tweede mail ligt klaar, kantoor sluit 16:00"]
          }
        ],
        ask: "Leveranciers"
      }
    }
    const row = findSupplier(id, getView(), getSupplierState())
    if (row === undefined) return { items: [{ kind: "page", label: "Leverancier niet gevonden" }], ask: null }
    const items: Array<ThreadItem> = [
      {
        kind: "supplier",
        label: row.name,
        peek: [
          row.leadDays === 0
            ? "Nog niets geleverd"
            : `Levert in ${decimal(row.leadDays)} dagen, belooft ${row.promiseDays}`,
          `${row.open.length} open · ${row.late.length} te laat`
        ]
      }
    ]
    const oldest = row.late.toSorted((a, b) => a.placedAt.getTime() - b.placedAt.getTime())[0]
    const first = row.products[0]
    if (oldest !== undefined) {
      items.push({
        kind: "order",
        label: `#${oldest.number}`,
        href: paths.order(oldest.number),
        meta: `${daysUnderway(oldest)} dagen onderweg`,
        peek: [`De oudste van ${row.late.length} te late bestellingen`]
      })
    } else if (first !== undefined) {
      items.push({
        kind: "product",
        label: first.name,
        href: paths.product(first.id),
        meta: `${row.products.length} producten`,
        peek: [`${first.stock} op voorraad`]
      })
    }
    const owner = PEOPLE[row.owner]
    items.push({
      kind: "person",
      label: owner.name,
      href: paths.person(owner.id),
      meta: `volgt ${row.contact === "—" ? "ze" : row.contact} op`,
      peek: [owner.role, row.email]
    })
    return { items, ask: `Leverancier ${row.name}` }
  },
  Menu: ({ pathname }) => {
    const view = useView()
    const st = useSupplierState()
    const weergave = useQuery("weergave")
    const counts = supplierCounts(view, st)
    const here = (w: string | null) => pathname === paths.suppliers && weergave === w
    return (
      <MenuList>
        <MenuItem
          to={paths.suppliers}
          glyph={Factory}
          label="Alle leveranciers"
          count={counts.all}
          active={here(null)}
        />
        <MenuItem
          to={viewHref("vertraagd")}
          glyph={Clock}
          label="Vertraagd"
          count={counts.late}
          active={here("vertraagd")}
        />
        <MenuItem
          to={viewHref("uitgenodigd")}
          glyph={Mail}
          label="Uitgenodigd"
          count={counts.invited}
          active={here("uitgenodigd")}
        />
        <MenuItem to={viewHref("api")} glyph={Plug} label="Via API" count={counts.api} active={here("api")} />
      </MenuList>
    )
  }
}
