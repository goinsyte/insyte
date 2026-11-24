import type { AreaDef } from "../../areas.ts"
import { AFFILIATE_BY_STATE, affiliateBook, affiliateUnread, payoutMonths } from "../../fixtures/affiliate-portal.ts"
import type { AreaRoute } from "../../router.tsx"
import { paths } from "../../router.tsx"
import type { Thread } from "../../shell/threads.ts"
import { Bell, FileText, Home, LinkIcon, Settings, Wallet } from "../../ui/icons.tsx"
import { useView } from "../../view.ts"
import { AffiliateDashboard } from "./dashboard.tsx"
import { ApplicationPage, NotificationsPage, ResourcesPage, SettingsPage } from "./pages.tsx"
import { PayoutMonthPage, PayoutsPage } from "./payouts.tsx"
import { ReferralPage, ReferralsPage } from "./referrals.tsx"
import { getAffiliate } from "./store.ts"

const NAV = [
  { id: "overzicht", label: "Overzicht", href: paths.affiliatePortal(), glyph: Home },
  {
    id: "doorverwijzingen",
    label: "Doorverwijzingen",
    href: paths.affiliatePortal("doorverwijzingen"),
    glyph: LinkIcon
  },
  { id: "uitbetalingen", label: "Uitbetalingen", href: paths.affiliatePortal("uitbetalingen"), glyph: Wallet },
  { id: "materiaal", label: "Materiaal", href: paths.affiliatePortal("materiaal"), glyph: FileText },
  {
    id: "meldingen",
    label: "Meldingen",
    href: paths.affiliatePortal("meldingen"),
    glyph: Bell,
    alert: affiliateUnread()
  },
  { id: "instellingen", label: "Instellingen", href: paths.affiliatePortal("instellingen"), glyph: Settings }
]

function Screen({ route }: { readonly route: AreaRoute }) {
  const view = useView()
  if (view.affiliate !== "goedgekeurd") return <ApplicationPage state={view.affiliate} />
  const [page, id] = route.path
  if (page === undefined) return <AffiliateDashboard />
  if (page === "doorverwijzingen") return id === undefined ? <ReferralsPage /> : <ReferralPage id={id} />
  if (page === "uitbetalingen") return id === undefined ? <PayoutsPage /> : <PayoutMonthPage id={id} />
  if (page === "materiaal") return <ResourcesPage />
  if (page === "meldingen") return <NotificationsPage />
  if (page === "instellingen") return <SettingsPage tab={id === "betaling" ? "betaling" : "profiel"} />
  return <AffiliateDashboard />
}

const PAGE_LABEL: Readonly<Record<string, string>> = {
  doorverwijzingen: "Doorverwijzingen",
  uitbetalingen: "Uitbetalingen",
  materiaal: "Materiaal",
  meldingen: "Meldingen",
  instellingen: "Instellingen"
}

/**
 * The werkdraad in the portal: the page, the record on it, and where that record leads (a link to the
 * month it is paid in, a month to where the money goes). Nobody to ask in a portal.
 */
function thread(route: AreaRoute): Thread {
  const [page, id] = route.path
  const home = { kind: "page" as const, label: "Affiliateportaal", href: paths.affiliatePortal() }
  if (page === undefined) return { items: [home], ask: null }
  const section = {
    kind: "page" as const,
    label: PAGE_LABEL[page] ?? "Affiliateportaal",
    href: paths.affiliatePortal(page)
  }
  const book = affiliateBook(false)
  if (page === "doorverwijzingen" && id !== undefined) {
    const link = [...getAffiliate().made, ...book.links].find((l) => l.id === id)
    const month = payoutMonths(book).find((m) => m.status === "loopt")
    return {
      items: [
        section,
        { kind: "page", label: link?.label ?? "Link", meta: link?.url },
        ...(month === undefined
          ? []
          : [{
            kind: "page" as const,
            label: `Uitbetaling ${month.label.toLowerCase()}`,
            href: paths.affiliatePortal(`uitbetalingen/${month.id}`)
          }])
      ],
      ask: null
    }
  }
  if (page === "uitbetalingen" && id !== undefined) {
    const month = payoutMonths(book).find((m) => m.id === id)
    return {
      items: [
        section,
        {
          kind: "page",
          label: month?.label ?? "Maand",
          meta: month === undefined ? undefined : `${month.rows.length} conversies`
        },
        { kind: "setting", label: "Betaalmethode", href: paths.affiliatePortal("instellingen/betaling") }
      ],
      ask: null
    }
  }
  return { items: [section], ask: null }
}

const APPLICATION_NAV = [{
  id: "overzicht",
  label: "Aanmelding",
  href: paths.affiliatePortal(),
  glyph: FileText
}] as const

/** The affiliate portal: what an approved, pending or rejected affiliate of Northwind sees. */
export const area: AreaDef = {
  Screen,
  thread,
  portal: {
    name: "Affiliateportaal",
    who: (view) => (view.affiliate === "goedgekeurd" ? getAffiliate().name : AFFILIATE_BY_STATE[view.affiliate].name),
    // Until Northwind approves the application, the application is all there is to see.
    nav: (view) => (view.affiliate === "goedgekeurd" ? NAV : APPLICATION_NAV),
    current: (route) => route.path[0] ?? "overzicht"
  }
}
