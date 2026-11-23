import type { AreaDef } from "../../areas.ts"
import {
  decimal,
  getProductState,
  lowStockPick,
  percent,
  productCounts,
  productRows,
  useProductState
} from "../../fixtures/products.ts"
import { euro } from "../../fixtures/records.ts"
import { paths, useQuery } from "../../router.tsx"
import { MenuGroup, MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { AlertTriangle, Archive, Edit, Eye, Package, Play, Returns } from "../../ui/icons.tsx"
import { getView, useView } from "../../view.ts"
import { ProductDetail, threadParts } from "./detail.tsx"
import { ProductsList } from "./list.tsx"

const viewHref = (w: string) => `${paths.products}?weergave=${w}`

/** Producten: the catalogue (`/v2/producten`) and one product (`/v2/producten/:id`). */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id] = route.path
    return id === undefined ? <ProductsList /> : <ProductDetail id={id} />
  },
  thread: (route) => {
    const [id] = route.path
    const view = getView()
    if (id === undefined) {
      const items: Array<ThreadItem> = [{ kind: "page", label: "Producten" }]
      items.push({
        kind: "product",
        label: "Aurora Hooded Fleece",
        href: paths.product("aurora-hooded-fleece"),
        meta: "valt te klein",
        peek: ["26 van 212 terug deze week", "21 keer ‘valt te klein’, bijna allemaal maat S"]
      })
      const pick = lowStockPick(productRows(view, getProductState()))
      if (pick !== undefined) {
        items.push({
          kind: "product",
          label: pick.row.name,
          href: paths.product(pick.row.id),
          meta: `over ${Math.round(pick.days)} dagen op`,
          peek: [`${pick.row.stock} op voorraad`, `${decimal(pick.row.sold / 7)} verkocht per dag`]
        })
      }
      return { items, ask: "Producten" }
    }
    const parts = threadParts(id, view)
    if (parts === undefined) return { items: [{ kind: "page", label: "Product niet gevonden" }], ask: null }
    const { product: p, supplier: sup, last } = parts
    const items: Array<ThreadItem> = [
      {
        kind: "product",
        label: p.name,
        peek: [`${euro(p.price)} · ${percent(p.margin)} marge`, `${p.stock} op voorraad · ${p.sold} verkocht deze week`]
      }
    ]
    if (sup !== undefined) {
      items.push({
        kind: "supplier",
        label: sup.name,
        href: paths.supplier(sup.id),
        meta: `levert in ${decimal(sup.leadDays)} dagen`,
        peek: [`Belooft ${sup.promiseDays} dagen`, sup.apiConnected ? "Gekoppeld via API" : "Werkt in het portaal"]
      })
    }
    if (last !== undefined) {
      items.push({
        kind: "person",
        label: last.person.name,
        href: paths.person(last.person.id),
        meta: `laatste wijziging · ${last.at}`,
        peek: [last.person.role, last.what]
      })
    }
    return { items, ask: `Product ${p.name}` }
  },
  Menu: ({ pathname }) => {
    const view = useView()
    const s = useProductState()
    const weergave = useQuery("weergave")
    const counts = productCounts(view, s)
    const here = (w: string | null) => pathname === paths.products && weergave === w
    return (
      <>
        <MenuList>
          <MenuItem to={paths.products} glyph={Package} label="Alle producten" count={counts.all} active={here(null)} />
          <MenuItem to={viewHref("actief")} glyph={Play} label="Actief" count={counts.actief} active={here("actief")} />
          <MenuItem
            to={viewHref("concept")}
            glyph={Edit}
            label="Concept"
            count={counts.concept}
            active={here("concept")}
          />
          <MenuItem
            to={viewHref("gearchiveerd")}
            glyph={Archive}
            label="Gearchiveerd"
            count={counts.gearchiveerd}
            active={here("gearchiveerd")}
          />
        </MenuList>
        <MenuGroup title="Aandacht">
          <MenuItem
            to={viewHref("laag")}
            glyph={AlertTriangle}
            label="Lage voorraad"
            count={counts.laag}
            active={here("laag")}
          />
          <MenuItem
            to={viewHref("retour")}
            glyph={Returns}
            label="Retour boven 10%"
            count={counts.retour}
            active={here("retour")}
          />
          <MenuItem
            to={viewHref("toezicht")}
            glyph={Eye}
            label="Onder toezicht"
            count={counts.toezicht}
            active={here("toezicht")}
          />
        </MenuGroup>
      </>
    )
  }
}
