import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  AffiliateDashboard,
  AffiliateMe,
  ConversionRow,
  LinkRow,
  PayoutMonth,
  ResourceRow,
  TierDef,
  Week
} from "@insyte/modules/affiliates/domain/Affiliates"
import {
  type AffiliateDashboardView,
  AffiliatePortalProvider,
  type AffiliatePortalSource,
  type PayoutMonthRow,
  type PortalConversion,
  type PortalLink,
  type PortalResource,
  type PortalWeek,
  type Said,
  TIER_LABEL,
  type TierView
} from "@insyte/ui/app/affiliate/source"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useMemo } from "react"
import {
  AFFILIATE_PORTAL,
  affiliateDashboardAtom,
  affiliateDestinationsAtom,
  affiliateLinkAtom,
  affiliateLinkConversionsAtom,
  affiliateLinksAtom,
  affiliatePaymentAtom,
  affiliatePayoutAtom,
  affiliatePayoutsAtom,
  affiliatePortalWrites,
  affiliateProfileAtom,
  affiliateResourcesAtom
} from "../data/affiliate-portal.ts"
import { useAtomSetInTurn } from "../data/in-turn.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The affiliate portal's screens in the console (M16 steps 3–5): `AffiliatePortal.*` as the design's source. Amounts
 * come in minor units and go out in whole ones; days come as epoch ms or `YYYY-MM-DD`. The account is only ever the
 * server's mask. The material downloads from `/api/affiliate/resources/:id` (`?download=1`), and an image or a PDF
 * opens inline for its preview. What the server does not hold yet (the dashboard's closing) is left out.
 */

const COPY: RefusalCopy = {
  gone: "Die link is er niet meer",
  invalid: {
    account: "Dat rekeningnummer of e-mailadres klopt niet.",
    destinationId: "Kies een product uit de lijst.",
    store: "De winkel is nog niet gekoppeld.",
    label: "Je hebt het maximum aantal links bereikt.",
    name: "Vul je naam in."
  }
}

const PREVIEW = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"])

const shortDay = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" })
const longDay = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" })
const monthYear = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })

const iso = (ms: number) => new Date(ms).toISOString()
const minor = (n: number) => n / 100
/** A `YYYY-MM-DD` day as noon UTC, so no zone moves it. */
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthLabel = (month: string) => capital(monthYear.format(new Date(`${month}-15T12:00:00Z`)))
/** The day of the month after `month` that its payout goes out. */
const payDayOf = (month: string, day: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  return Date.UTC(y, m, day, 12)
}
const bare = (url: string) => url.replace(/^https?:\/\//, "")

const sizeOf = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`

const refused = (error: unknown) => sayRefusal(error, COPY)

const done = (exit: Exit.Exit<unknown, unknown>, then: () => void) => {
  if (Exit.isFailure(exit)) return refused(failureOf(exit))
  then()
}

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

const tierOf = (t: TierDef): TierView => ({
  id: t.tier,
  label: TIER_LABEL[t.tier],
  rate: t.rate,
  from: t.threshold
})

const weekOf = (w: Week): PortalWeek => ({
  label: shortDay.format(new Date(w.end)),
  earned: minor(w.earnedMinor),
  conversions: w.conversions,
  clicks: w.clicks
})

const conversionOf = (c: ConversionRow): PortalConversion => ({
  id: c.id,
  at: iso(c.placedAt),
  order: c.orderNumber,
  title: c.productTitle,
  total: minor(c.amountMinor),
  commission: minor(Math.abs(c.commissionMinor)),
  status: c.status,
  via: c.attributedBy === "code" ? null : c.linkLabel
})

const linkOf = (l: LinkRow): PortalLink => ({
  id: l.id,
  label: l.label,
  url: bare(l.url),
  clicks: l.clicks,
  conversions: l.conversions,
  revenue: minor(l.revenueMinor),
  commission: minor(l.commissionMinor),
  created_at: iso(l.createdAt)
})

const monthOf = (m: PayoutMonth): PayoutMonthRow => ({
  id: m.month,
  label: monthLabel(m.month),
  count: m.conversions,
  gross: minor(m.grossMinor),
  reversed: minor(Math.abs(m.reversedMinor)),
  total: minor(m.totalMinor),
  status: m.status === "paid" ? "paid" : m.status === "approved" ? "approved" : "open",
  payDay: m.paidAt ?? dayMs(m.payDay)
})

const resourceOf = (r: ResourceRow): PortalResource => ({
  id: r.id,
  name: r.title,
  kind: r.kind,
  size: sizeOf(r.sizeBytes),
  updated_at: iso(r.updatedAt),
  previewable: PREVIEW.has(r.mime)
})

const dashboardOf = (d: AffiliateDashboard): AffiliateDashboardView => ({
  owed: minor(d.owedMinor),
  nextPayout: longDay.format(new Date(dayMs(d.nextPayout.payDay))),
  method: d.nextPayout.method,
  conversions30: d.conversions30d,
  clicks30: d.clicks30d,
  quarter: d.quarterConversions,
  weeks: d.weeks.map(weekOf),
  recent: d.recent.map(conversionOf),
  links: d.bestLinks.map(linkOf),
  linksCount: d.linksCount,
  resourcesCount: d.resourcesCount,
  fresh: d.linksCount === 0 && d.recent.length === 0
})

const EMPTY_DASHBOARD: AffiliateDashboardView = {
  owed: 0,
  nextPayout: "",
  method: null,
  conversions30: 0,
  clicks30: 0,
  quarter: 0,
  weeks: [],
  recent: [],
  links: [],
  linksCount: 0,
  resourcesCount: 0,
  fresh: false
}

function useDashboard(): AffiliateDashboardView {
  const d = value(useAtomValue(affiliateDashboardAtom))
  return useMemo(() => (d === undefined ? EMPTY_DASHBOARD : dashboardOf(d)), [d])
}

function useLinks(): Array<PortalLink> {
  const list = value(useAtomValue(affiliateLinksAtom))
  return useMemo(() => list?.rows.filter((l) => !l.archived).map(linkOf) ?? [], [list])
}

function useLink(id: string) {
  const detail = value(useAtomValue(affiliateLinkAtom(id)))
  const conversions = value(useAtomValue(affiliateLinkConversionsAtom(id)))
  return useMemo(
    () =>
      detail === undefined ? undefined : {
        link: linkOf(detail.link),
        weeks: detail.weeks.map(weekOf),
        rows: conversions?.rows.map(conversionOf) ?? []
      },
    [detail, conversions]
  )
}

function useDestinations() {
  return value(useAtomValue(affiliateDestinationsAtom)) ?? []
}

function usePayouts() {
  const p = value(useAtomValue(affiliatePayoutsAtom))
  return useMemo(() => {
    if (p === undefined) return { months: [], current: undefined, paidLifetime: 0, payoutDay: 15 }
    return {
      months: p.months.map(monthOf),
      current: {
        label: monthLabel(p.current.month),
        approved: minor(p.current.approvedMinor),
        waiting: minor(p.current.pendingMinor),
        payDay: payDayOf(p.current.month, p.payoutDay)
      },
      paidLifetime: minor(p.paidLifetimeMinor),
      payoutDay: p.payoutDay
    }
  }, [p])
}

function usePayout(month: string) {
  const p = value(useAtomValue(affiliatePayoutAtom(month)))
  return useMemo(
    () =>
      p === undefined ? undefined : {
        row: monthOf(p.payout),
        rows: p.rows.map(conversionOf),
        method: p.method,
        taxId: p.taxId
      },
    [p]
  )
}

function useResources() {
  const r = value(useAtomValue(affiliateResourcesAtom))
  return useMemo(() => ({ resources: r?.resources.map(resourceOf) ?? [], faqs: r?.faqs ?? [] }), [r])
}

function usePayment() {
  const p = value(useAtomValue(affiliatePaymentAtom))
  return useMemo(() => ({ method: p?.method ?? null, accountHint: p?.accountHint ?? "", taxId: p?.taxId ?? "" }), [p])
}

const download = (r: PortalResource) => {
  const a = document.createElement("a")
  a.href = `/api/affiliate/resources/${encodeURIComponent(r.id)}?download=1`
  a.rel = "noopener"
  a.click()
}

const preview = (r: PortalResource) =>
  void window.open(`/api/affiliate/resources/${encodeURIComponent(r.id)}`, "_blank", "noopener")

/** The portal over `AffiliatePortal.*`, for the affiliate `me` names. */
export function ConsoleAffiliatePortal({ me, children }: { me: AffiliateMe; children: ReactNode }) {
  const keys = { reactivityKeys: AFFILIATE_PORTAL }
  const write = {
    createLink: useAtomSet(affiliatePortalWrites.createLink, { mode: "promiseExit" }),
    archiveLink: useAtomSet(affiliatePortalWrites.archiveLink, { mode: "promiseExit" }),
    saveProfile: useAtomSet(affiliatePortalWrites.saveProfile, { mode: "promiseExit" }),
    savePayment: useAtomSet(affiliatePortalWrites.savePayment, { mode: "promiseExit" }),
    undo: useAtomSetInTurn(affiliatePortalWrites.undo)
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<{ readonly undo: { readonly token: string } | null }, unknown>, words: Said) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(words.message, () => undo(ticket.token), words.description)
  }

  const dashboard = value(useAtomValue(affiliateDashboardAtom))
  const links = value(useAtomValue(affiliateLinksAtom))
  const profile = value(useAtomValue(affiliateProfileAtom))
  const destinations = value(useAtomValue(affiliateDestinationsAtom))
  const currency = (dashboard?.currency ?? links?.currency ?? "EUR") as Currency
  // The storefront the links land on, as the newest link shows it; the brand's name before there is one.
  const host = links?.rows[0]?.storefrontUrl.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? me.workspace.name
  const code = profile?.code ?? me.affiliate?.code ?? ""

  const source: AffiliatePortalSource = {
    brand: me.workspace.name,
    money: (amount) => formatCurrency(amount, currency),
    tiers: dashboard?.tiers.map(tierOf) ?? [],
    returnDays: dashboard?.returnDays ?? 30,
    useProfile: () => {
      const p = value(useAtomValue(affiliateProfileAtom))
      return {
        name: p?.name ?? me.affiliate?.name ?? "",
        email: p?.email ?? me.affiliate?.email ?? "",
        code: p?.code ?? me.affiliate?.code ?? "",
        tier: p?.tier ?? me.affiliate?.tier ?? "bronze"
      }
    },
    useDashboard,
    useLinks,
    useLink,
    useDestinations,
    previewUrl: (destinationId, medium, campaign) => {
      const params = new URLSearchParams({
        ref: code,
        utm_source: "affiliate",
        utm_medium: medium,
        utm_campaign: campaign
      })
      const path = destinations?.find((d) => d.id === destinationId)?.path ?? ""
      return `${host}/${path.replace(/^\//, "")}?${params.toString()}`
    },
    createLink: (input, words) =>
      void write.createLink({
        payload: { ...input, campaign: input.campaign.slice(0, 60).replace(/-+$/, "") || "link" },
        ...keys
      }).then((exit) => said(exit, words)),
    canRemove: () => true,
    removeLink: (link, words) =>
      void write.archiveLink({ payload: { linkId: link.id }, ...keys }).then((exit) => said(exit, words)),
    usePayouts,
    usePayout,
    useResources,
    download,
    preview,
    usePayment,
    savePayment: (p, then) =>
      void write.savePayment({
        payload: { method: p.method, account: p.account, ...(p.taxId === "" ? {} : { taxId: p.taxId }) },
        ...keys
      }).then((exit) => done(exit, then)),
    saveName: (name, then) => void write.saveProfile({ payload: { name }, ...keys }).then((exit) => done(exit, then)),
    parts: { Closing: null }
  }
  return <AffiliatePortalProvider value={source}>{children}</AffiliatePortalProvider>
}
