import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import {
  AFF_TODAY,
  type AffStatement,
  affiliateFaqs,
  affiliateResources,
  COMMISSION,
  type Conversion,
  CONVERSIONS,
  currentAffiliateByState,
  DESTINATIONS,
  referralLinks,
  RETURN_DAYS,
  TIERS,
  affiliateStatements,
  weeklyFor
} from "../../data-source"
import { formatCurrency, formatDate } from "../lib/format"
import type { ReferralLink } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { AffiliateClosing } from "../marketing-sections/closings"
import { useAffiliate } from "../stores/affiliate-store"
import {
  type AffiliateDashboardView,
  AffiliatePortalProvider,
  type AffiliatePortalSource,
  type PaymentView,
  type PayoutMonthRow,
  type PortalConversion,
  type PortalLink,
  type PortalResource
} from "./source"

/*
 * The affiliate portal over the demo's fixtures and the affiliate's own edits in this browser (`affiliate-store`), as
 * the design app shows it. The numbers are the fixtures' sums, as they always were; the console's source reads the
 * same shapes from `AffiliatePortal.*`.
 */

const DAY = 86_400_000

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

const linkOf = (l: ReferralLink): PortalLink => ({
  id: l.id,
  label: l.label,
  url: l.url,
  clicks: l.clicks,
  conversions: l.conversions,
  revenue: l.revenue,
  commission: l.revenue * COMMISSION,
  created_at: l.created_at
})

const LABEL = () => new Map(referralLinks.map((l) => [l.id, l.label]))

const conversionOf = (c: Conversion, labels: Map<string, string>): PortalConversion => ({
  id: c.id,
  at: c.at,
  order: c.order,
  title: c.title,
  total: c.total,
  commission: c.commission,
  status: c.status,
  via: labels.get(c.link) ?? null
})

const monthOf = (s: AffStatement): PayoutMonthRow => ({
  id: s.id,
  label: s.label,
  count: s.rows.length,
  gross: s.gross,
  reversed: s.reversed,
  total: s.total,
  status: s.status,
  payDay: s.payDay
})

/** An account as the server would show it back: the first two and the last four. */
const mask = (account: string) => {
  const a = account.trim()
  if (a.includes("@")) {
    const [user = "", host = ""] = a.split("@")
    return `${user.slice(0, 1)}•••@${host}`
  }
  return a.length <= 6 ? a : `${a.slice(0, 2)}•• •••• •••• ${a.slice(-4)}`
}

/*
 * The demo has no asset bucket, so a download hands over a small text file named after the resource. It saves like
 * the real thing and says plainly what it stands in for.
 */
function download(r: PortalResource) {
  const name = slug(r.name)
  const body = `${r.name}\n${r.size} · bijgewerkt ${
    formatDate(r.updated_at)
  }\n\nPlaceholderbestand uit de Insyte-demo. In productie downloadt hier het echte bestand.\n`
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success(`${r.name} wordt gedownload`)
}

function useAllLinks() {
  const made = useAffiliate((s) => s.links)
  return useMemo(() => [...made, ...referralLinks], [made])
}

function useDashboard(): AffiliateDashboardView {
  const links = useAllLinks()
  const payment = useAffiliate((s) => s.payment)
  return useMemo(() => {
    const labels = LABEL()
    const weeks = weeklyFor(referralLinks)
    const unpaid = CONVERSIONS.filter((c) => c.status === "pending" || c.status === "approved")
    const last30 = CONVERSIONS.filter((c) => c.status !== "reversed" && Date.parse(c.at) > AFF_TODAY - 30 * DAY)
    return {
      owed: unpaid.reduce((n, c) => n + c.commission, 0),
      nextPayout: "15 juni",
      method: payment.method,
      conversions30: last30.length,
      clicks30: weeks.slice(-4).reduce((n, w) => n + w.clicks, 0),
      quarter: CONVERSIONS.filter((c) => Date.parse(c.at) > AFF_TODAY - 90 * DAY).length,
      weeks,
      recent: CONVERSIONS.slice(0, 6).map((c) => conversionOf(c, labels)),
      links: [...links].sort((a, b) => b.revenue - a.revenue).slice(0, 3).map(linkOf),
      linksCount: links.length,
      resourcesCount: affiliateResources.length,
      fresh: links.length === 0 && CONVERSIONS.length === 0
    }
  }, [links, payment.method])
}

function useLinks() {
  const links = useAllLinks()
  return useMemo(() => links.map(linkOf), [links])
}

function useLink(id: string) {
  const links = useAllLinks()
  return useMemo(() => {
    const link = links.find((l) => l.id === id)
    if (link === undefined) return undefined
    const labels = LABEL()
    return {
      link: linkOf(link),
      weeks: weeklyFor(links, id),
      rows: CONVERSIONS.filter((c) => c.link === id).map((c) => conversionOf(c, labels))
    }
  }, [links, id])
}

function usePayouts() {
  return useMemo(() => {
    const all = affiliateStatements()
    const open = all.find((s) => s.status === "open")
    return {
      months: all.map(monthOf),
      current: open === undefined ? undefined : {
        label: open.label,
        approved: open.rows.filter((c) => c.status === "approved").reduce((n, c) => n + c.commission, 0),
        waiting: open.rows.filter((c) => c.status === "pending").reduce((n, c) => n + c.commission, 0),
        payDay: open.payDay
      },
      paidLifetime: all.filter((s) => s.status === "paid").reduce((n, s) => n + s.total, 0),
      payoutDay: 15
    }
  }, [])
}

function usePayout(month: string) {
  const payment = useAffiliate((s) => s.payment)
  return useMemo(() => {
    const s = affiliateStatements().find((x) => x.id === month)
    if (s === undefined) return undefined
    const labels = LABEL()
    return {
      row: monthOf(s),
      rows: s.rows.map((c) => conversionOf(c, labels)),
      method: payment.method,
      taxId: payment.tax_id === "" ? null : payment.tax_id
    }
  }, [month, payment])
}

function usePayment(): PaymentView {
  const p = useAffiliate((s) => s.payment)
  return useMemo(() => ({ method: p.method, accountHint: mask(p.account), taxId: p.tax_id }), [p])
}

function useProfile() {
  const p = useAffiliate((s) => s.profile)
  return useMemo(
    () => ({ name: p.name, email: p.email, code: p.referral_code, tier: currentAffiliateByState.approved.tier }),
    [p]
  )
}

const RESOURCES = () => ({
  resources: affiliateResources.map((r) => ({ ...r })),
  faqs: affiliateFaqs
})

export function DemoAffiliatePortal({ children }: { children: ReactNode }) {
  const source: AffiliatePortalSource = {
    brand: "Northwind",
    money: (amount) => formatCurrency(amount),
    tiers: TIERS.map((t) => ({ id: t.id, label: t.label, rate: t.rate, from: t.from })),
    returnDays: RETURN_DAYS,
    useProfile,
    useDashboard,
    useLinks,
    useLink,
    useDestinations: () => DESTINATIONS,
    previewUrl: (destinationId, medium, campaign) => {
      const d = DESTINATIONS.find((x) => x.id === destinationId)
      const code = useAffiliate.getState().profile.referral_code
      const params = new URLSearchParams({
        ref: code,
        utm_source: "affiliate",
        utm_medium: medium,
        utm_campaign: campaign || "link"
      })
      return `northwind.co/${d?.path ? `${d.path}` : ""}?${params.toString()}`
    },
    createLink: (input, said) => {
      const id = `ref_new_${Date.now().toString(36)}`
      const d = DESTINATIONS.find((x) => x.id === input.destinationId)
      const params = new URLSearchParams({
        ref: useAffiliate.getState().profile.referral_code,
        utm_source: "affiliate",
        utm_medium: input.medium,
        utm_campaign: input.campaign || "link"
      })
      useAffiliate.getState().addLink({
        id,
        affiliate_id: "aff_priya",
        label: input.label,
        url: `northwind.co/${d?.path ? `${d.path}` : ""}?${params.toString()}`,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        created_at: new Date().toISOString()
      })
      undoable(said.message, () => useAffiliate.getState().removeLink(id), said.description)
    },
    canRemove: (link) => useAffiliate.getState().links.some((l) => l.id === link.id),
    removeLink: (link, said) => {
      const own = useAffiliate.getState().links.find((l) => l.id === link.id)
      if (own === undefined) return
      useAffiliate.getState().removeLink(link.id)
      undoable(said.message, () => useAffiliate.getState().addLink(own), said.description)
    },
    usePayouts,
    usePayout,
    useResources: RESOURCES,
    download,
    preview: null,
    usePayment,
    savePayment: (p, done) => {
      useAffiliate.getState().savePayment({ method: p.method, account: p.account, tax_id: p.taxId })
      done()
    },
    saveName: (name, done) => {
      const profile = useAffiliate.getState().profile
      useAffiliate.getState().saveProfile({ ...profile, name })
      done()
    },
    parts: {
      Closing: ({ tier, next, quarter }) => <AffiliateClosing tier={tier} next={next} quarter={quarter} />
    }
  }
  return <AffiliatePortalProvider value={source}>{children}</AffiliatePortalProvider>
}
