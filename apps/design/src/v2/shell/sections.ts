import { ASSISTANT } from "../assistant.ts"
import { openTickets } from "../demo.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { paths } from "../router.tsx"
import {
  BarChart3,
  CreditCard,
  Factory,
  Home,
  Inbox,
  Package,
  Radio,
  Returns,
  ShoppingBag,
  Users,
  Workflow
} from "../ui/icons.tsx"
import { level } from "../view.ts"
import type { PermArea, View } from "../view.ts"

/**
 * The icon rail: every area of the product, in groups. The first group is the day (Start, Inbox,
 * Live), then the assistant on its own, then the records, then the tools. Order follows the owner's
 * priorities; an area's first page is `href`.
 */
export type Section = {
  readonly id: string
  readonly label: string
  readonly href: string
  /** `null` draws Magnus's mark instead of a glyph. */
  readonly glyph: Glyph | null
  /** Unread or waiting, shown as the rail's red count. */
  readonly alert?: number
}

export const SECTION_GROUPS: ReadonlyArray<ReadonlyArray<Section>> = [
  [
    { id: "start", label: "Start", href: paths.home, glyph: Home },
    { id: "inbox", label: "Inbox", href: paths.inbox, glyph: Inbox, alert: openTickets() },
    { id: "live", label: "Live", href: paths.live, glyph: Radio }
  ],
  [{ id: "magnus", label: ASSISTANT, href: paths.newChat(), glyph: null }],
  [
    { id: "bestellingen", label: "Bestellingen", href: paths.orders, glyph: ShoppingBag },
    { id: "klanten", label: "Klanten", href: paths.customers, glyph: Users },
    { id: "producten", label: "Producten", href: paths.products, glyph: Package },
    { id: "retouren", label: "Retouren", href: paths.returns, glyph: Returns },
    { id: "chargebacks", label: "Chargebacks", href: paths.chargebacks, glyph: CreditCard },
    { id: "leveranciers", label: "Leveranciers", href: paths.suppliers, glyph: Factory }
  ],
  [
    { id: "automatiseringen", label: "Automatiseringen", href: paths.automations, glyph: Workflow },
    { id: "analyse", label: "Analyse", href: paths.board("week"), glyph: BarChart3 }
  ]
]

export const SECTIONS: ReadonlyArray<Section> = SECTION_GROUPS.flat()

/** The permission a rail area reads; Start, Live and Magnus are open to every role. */
const SECTION_AREA: Readonly<Record<string, PermArea>> = {
  inbox: "support",
  bestellingen: "orders",
  klanten: "customers",
  producten: "products",
  retouren: "returns",
  chargebacks: "chargebacks",
  leveranciers: "suppliers",
  automatiseringen: "automations",
  analyse: "analytics"
}

/** Whether the role in the demo view may open a rail area at all. */
const sectionVisible = (view: View, id: string) => {
  const area = SECTION_AREA[id]
  return area === undefined || level(view, area) > 0
}

/** The rail's groups as the role sees them: an area it may not open is not offered. */
export const visibleGroups = (view: View): ReadonlyArray<ReadonlyArray<Section>> =>
  SECTION_GROUPS.map((group) => group.filter((section) => sectionVisible(view, section.id))).filter((g) => g.length > 0)

/** Areas reached from a record link that are not on the rail. */
const OTHER_LABELS: Readonly<Record<string, string>> = {
  team: "Team",
  affiliates: "Affiliates",
  instellingen: "Instellingen",
  meer: "Meer",
  onderdelen: "Onderdelen"
}

export function sectionLabel(id: string): string {
  return SECTIONS.find((section) => section.id === id)?.label ?? OTHER_LABELS[id] ?? id
}
