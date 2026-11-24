import { ASSISTANT } from "../assistant.ts"
import { openTickets } from "../demo.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { paths } from "../router.tsx"
import {
  BadgePercent,
  BarChart3,
  CreditCard,
  Database,
  Factory,
  GraduationCap,
  Home,
  Inbox,
  Package,
  PiggyBank,
  Radio,
  Returns,
  Sheet,
  ShoppingBag,
  Store,
  Users,
  Workflow
} from "../ui/icons.tsx"
import { level } from "../view.ts"
import type { PermArea, View } from "../view.ts"
import type { RailPrefs } from "./shell-state.ts"

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

/** The tools under Meer, any of which can be pinned to the rail (`Zijbalk aanpassen`). */
export const TOOLS: ReadonlyArray<Section & { readonly detail: string }> = [
  {
    id: "affiliates",
    label: "Affiliates",
    href: paths.affiliates,
    glyph: BadgePercent,
    detail: "Partners die over je producten praten"
  },
  { id: "sheets", label: "Sheets", href: paths.sheets, glyph: Sheet, detail: "Rekenen op je eigen cijfers" },
  {
    id: "courses",
    label: "Cursussen",
    href: paths.courses,
    glyph: GraduationCap,
    detail: "Uitleg voor team en leveranciers"
  },
  { id: "costs", label: "Kosten", href: paths.costs, glyph: PiggyBank, detail: "Wat de winkel per maand kost" },
  { id: "data", label: "Data", href: paths.data, glyph: Database, detail: "Importeren, exporteren en opschonen" },
  { id: "marketplace", label: "Marketplace", href: paths.marketplace, glyph: Store, detail: "Apps en koppelingen" }
]

/** The permission a rail area reads; Start, Live and Magnus are open to every role. */
const SECTION_AREA: Readonly<Record<string, PermArea>> = {
  affiliates: "affiliates",
  courses: "courses",
  costs: "billing",
  data: "data",
  marketplace: "integrations",
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
export const sectionVisible = (view: View, id: string) => {
  const area = SECTION_AREA[id]
  return area === undefined || level(view, area) > 0
}

/** The rail's groups as the role sees them: an area it may not open is not offered. */
export const visibleGroups = (view: View): ReadonlyArray<ReadonlyArray<Section>> =>
  SECTION_GROUPS.map((group) => group.filter((section) => sectionVisible(view, section.id))).filter((g) => g.length > 0)

/**
 * The rail as this person laid it out: each group in their order, without what they hid, and the
 * tools they pinned as a group of their own after the areas. What the role may not open stays away.
 */
export function railGroups(view: View, prefs: RailPrefs): ReadonlyArray<ReadonlyArray<Section>> {
  const rank = (id: string) => {
    const at = prefs.order.indexOf(id)
    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }
  const groups = visibleGroups(view).map((group) =>
    group
      .map((section, i) => ({ section, i }))
      .toSorted((a, b) => rank(a.section.id) - rank(b.section.id) || a.i - b.i)
      .map((x) => x.section)
      .filter((section) => !prefs.hidden.includes(section.id))
  )
  const pinned = TOOLS.filter((tool) => prefs.pinned.includes(tool.id) && sectionVisible(view, tool.id))
  return [...groups, pinned].filter((g) => g.length > 0)
}

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
