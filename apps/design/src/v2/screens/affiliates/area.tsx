import type { AreaDef } from "../../areas.ts"
import {
  affiliateCounts,
  affiliateRows,
  getAffiliateState,
  tierOf,
  useAffiliateState
} from "../../fixtures/affiliates.ts"
import { euro } from "../../fixtures/records.ts"
import { paths, useQuery } from "../../router.tsx"
import { MenuItem, MenuList } from "../../shell/nav.tsx"
import type { ThreadItem } from "../../shell/threads.ts"
import { Banknote, FileText, Send, UserPlus, Users } from "../../ui/icons.tsx"
import { getView, useView } from "../../view.ts"
import { AffiliatesPage, weergaveOf } from "./page.tsx"

const LABEL = {
  actief: "Actief",
  aanmeldingen: "Aanmeldingen",
  uitbetalingen: "Uitbetalingen",
  uitnodigingen: "Uitnodigingen",
  materiaal: "Materiaal"
}

const viewHref = (w: string) => (w === "actief" ? paths.affiliates : `${paths.affiliates}?weergave=${w}`)

/** Affiliates (`/v2/affiliates`): one page with four views (`?weergave=`); one affiliate in a sheet (`?open=`). */
export const area: AreaDef = {
  Screen: () => <AffiliatesPage />,
  thread: (route) => {
    const q = new URLSearchParams(route.search)
    const tab = weergaveOf(q.get("weergave"))
    const items: Array<ThreadItem> = [{
      kind: "page",
      label: tab === "actief" ? "Affiliates" : `Affiliates · ${LABEL[tab]}`
    }]
    const openId = q.get("open")
    const a = openId === null ? undefined : affiliateRows(getView(), getAffiliateState()).find((x) => x.id === openId)
    if (a !== undefined) {
      items.push({
        kind: "affiliate",
        label: a.name,
        href: `${paths.affiliates}?open=${a.id}`,
        meta: `${tierOf(a.tier).label} · ${a.code}`,
        peek: [`${a.conversions} bestellingen · ${euro(a.earned)} verdiend`, a.channel]
      })
    }
    return { items, ask: a === undefined ? "Affiliates" : `Affiliate ${a.name}` }
  },
  Menu: ({ pathname }) => {
    const view = useView()
    const s = useAffiliateState()
    const weergave = weergaveOf(useQuery("weergave"))
    const counts = affiliateCounts(view, s)
    const here = (w: string) => pathname === paths.affiliates && weergave === w
    return (
      <MenuList>
        <MenuItem to={viewHref("actief")} glyph={Users} label="Actief" count={counts.actief} active={here("actief")} />
        <MenuItem
          to={viewHref("aanmeldingen")}
          glyph={UserPlus}
          label="Aanmeldingen"
          count={counts.aanmeldingen}
          active={here("aanmeldingen")}
        />
        <MenuItem
          to={viewHref("uitbetalingen")}
          glyph={Banknote}
          label="Uitbetalingen"
          count={counts.uitbetalingen}
          active={here("uitbetalingen")}
        />
        <MenuItem
          to={viewHref("uitnodigingen")}
          glyph={Send}
          label="Uitnodigingen"
          count={counts.uitnodigingen}
          active={here("uitnodigingen")}
        />
        <MenuItem
          to={viewHref("materiaal")}
          glyph={FileText}
          label="Materiaal"
          count={counts.materiaal}
          active={here("materiaal")}
        />
      </MenuList>
    )
  }
}
