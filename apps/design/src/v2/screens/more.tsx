import { paths } from "../router.tsx"
import {
  BadgePercent,
  ChevronRight,
  Database,
  GraduationCap,
  LayoutGrid,
  PiggyBank,
  Sheet,
  Sparkle,
  Store
} from "../ui/icons.tsx"
import { GlyphTile, List, ListRow } from "../ui/list.tsx"
import { Page, PageHead, PageSection } from "../ui/page.tsx"

const TOOLS = [
  {
    to: paths.affiliates,
    glyph: BadgePercent,
    title: "Affiliates",
    meta: "Wie Northwind aanbeveelt, wat het opleverde en wat ze verdienen"
  },
  { to: paths.sheets, glyph: Sheet, title: "Sheets", meta: "Eigen lijsten op je bestellingen, klanten en producten" },
  { to: paths.courses, glyph: GraduationCap, title: "Cursussen", meta: "Uitleg voor het team en de leveranciers" },
  { to: paths.costs, glyph: PiggyBank, title: "Kosten", meta: "Wat de winkel kost, zodat de marge klopt" },
  { to: paths.data, glyph: Database, title: "Data", meta: "Importeren, exporteren en opschonen" },
  { to: paths.marketplace, glyph: Store, title: "Marketplace", meta: "Apps en koppelingen voor de winkel" }
] as const

const DESIGN = [
  {
    to: paths.parts,
    glyph: LayoutGrid,
    title: "Onderdelen",
    meta: "De UI-kit van versie 2, in elke staat en elk thema"
  },
  { to: paths.brand, glyph: Sparkle, title: "Merk", meta: "De drie merktekens en zes kleurrichtingen" }
] as const

/** Meer: the tools that are not on the rail, each one line on what it is for. */
export function MoreScreen() {
  return (
    <Page width="text">
      <PageHead title="Meer" meta="Wat niet op de balk staat, maar wel bij het werk hoort." />
      <PageSection title="Gereedschap" id="meer-gereedschap">
        <List label="Gereedschap">
          {TOOLS.map((tool) => {
            const G = tool.glyph
            return (
              <ListRow
                key={tool.to}
                href={tool.to}
                padded={false}
                lead={
                  <GlyphTile>
                    <G size={16} />
                  </GlyphTile>
                }
                title={tool.title}
                meta={tool.meta}
                trail={<ChevronRight size={15} className="text-ink-4" />}
              />
            )
          })}
        </List>
      </PageSection>
      <PageSection title="Ontwerp" id="meer-ontwerp">
        <List label="Ontwerp">
          {DESIGN.map((item) => {
            const G = item.glyph
            return (
              <ListRow
                key={item.to}
                href={item.to}
                padded={false}
                lead={
                  <GlyphTile>
                    <G size={16} />
                  </GlyphTile>
                }
                title={item.title}
                meta={item.meta}
                trail={<ChevronRight size={15} className="text-ink-4" />}
              />
            )
          })}
        </List>
      </PageSection>
    </Page>
  )
}
