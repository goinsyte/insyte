import { Landing } from "@insyte/ui/marketing/landing"
import { BeveiligingPage } from "@insyte/ui/marketing/pages/beveiliging"
import { PartnerAanmeldenPage, ToegangPage } from "@insyte/ui/marketing/pages/forms"
import { KoppelingenPage } from "@insyte/ui/marketing/pages/koppelingen"
import { LeveranciersPage, OperatorsPage, PartnersPage } from "@insyte/ui/marketing/pages/oplossingen"
import { PrijzenPage } from "@insyte/ui/marketing/pages/prijzen"
import { PrivacyPage } from "@insyte/ui/marketing/pages/privacy"
import { ProductPage } from "@insyte/ui/marketing/pages/product"
import { ChangelogPage, RoadmapPage } from "@insyte/ui/marketing/pages/updates"
import { VariantsPage } from "@insyte/ui/marketing/pages/variants/lab"
import { VerwerkersovereenkomstPage } from "@insyte/ui/marketing/pages/verwerkersovereenkomst"
import { VoorwaardenPage } from "@insyte/ui/marketing/pages/voorwaarden"
import { VragenPage } from "@insyte/ui/marketing/pages/vragen"
import type { ReactElement } from "react"
import { referenceLinks as links } from "./links.ts"

/**
 * Every page `apps/marketing` serves, by the path it serves it at, rendering the same component
 * with the same props. `apps/marketing/src/routes/` is the list this mirrors: twenty pages in
 * `site.routes`, plus the `/variants` lab that is deliberately not in it.
 *
 * No router: the marketing pages navigate with plain `<a href>` (through `links`), never with a
 * router link, so a lookup by path is the whole of what the Start app's router does for them.
 */
export const PAGES: Record<string, () => ReactElement> = {
  "/": () => <Landing links={links} />,
  "/vragen": () => <VragenPage links={links} />,
  "/prijzen": () => <PrijzenPage links={links} />,
  "/beveiliging": () => <BeveiligingPage links={links} />,
  "/privacy": () => <PrivacyPage links={links} />,
  "/voorwaarden": () => <VoorwaardenPage links={links} />,
  "/verwerkersovereenkomst": () => <VerwerkersovereenkomstPage links={links} />,
  "/oplossingen/operators": () => <OperatorsPage links={links} />,
  "/oplossingen/leveranciers": () => <LeveranciersPage links={links} />,
  "/oplossingen/partners": () => <PartnersPage links={links} />,
  "/product/bestellingen": () => <ProductPage links={links} area="bestellingen" />,
  "/product/klantenservice": () => <ProductPage links={links} area="klantenservice" />,
  "/product/chargebacks": () => <ProductPage links={links} area="chargebacks" />,
  "/product/automatiseringen": () => <ProductPage links={links} area="automatiseringen" />,
  "/product/insyte-ai": () => <ProductPage links={links} area="insyte-ai" />,
  "/koppelingen": () => <KoppelingenPage links={links} />,
  "/changelog": () => <ChangelogPage links={links} />,
  "/roadmap": () => <RoadmapPage links={links} />,
  "/toegang": () => <ToegangPage links={links} />,
  "/partners/aanmelden": () => <PartnerAanmeldenPage links={links} />,
  // The hero-background lab: `?v=1…8` deep links and the Abyss/Licht toggles are the page's own.
  "/variants": () => <VariantsPage links={links} />
}
