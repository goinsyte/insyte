import { ORDERS, product, PRODUCTS } from "./records.ts"
import type { Order } from "./records.ts"
import { DEMO_NOW } from "./workspace.ts"

/**
 * The affiliate portal's demo data: what Priya Singh, Northwind's partner on Instagram and YouTube,
 * sees of the programme, and the two people whose application is still waiting (Amara Idris) or was
 * turned down (Kai Tanaka). Copied from the current demo (`src/app/fixtures/affiliate-data.ts`,
 * `mock-data/affiliates.ts`, `referrals.ts`, `resources.ts`) and moved to this version's clock: the
 * history ran six months later, so Priya joined in May 2026 and today is Monday 23 November.
 *
 * Every figure is a sum over her conversions, the orders that came in through her links. The ones of
 * this week are Northwind's real orders (`fixtures/records.ts`), so a refunded Aurora shows here as a
 * reversed commission; the older ones carry the store's real products at their shelf price. An
 * affiliate sees an order as its number, its article, its amount and its day, never the shopper.
 * Nothing here is real.
 */

export const BRAND = "Northwind"
/** Priya's rate. The tiers below are the programme's; she is on the top one. */
export const COMMISSION = 0.15
/** A conversion waits out the return window before it is approved. */
export const RETURN_DAYS = 14
/** The day of the month the commission of the month before is paid. */
export const PAYOUT_DAY = 15

const DAY = 86_400_000
const NOW = DEMO_NOW.date.getTime()
/** Monday 16 November: from here on the store's orders are the shared records. */
const RECORDS_FROM = new Date(2026, 10, 16).getTime()

/* ── who is signed in ─────────────────────────────────────────────────────────────────────────── */

export type Tier = "brons" | "zilver" | "goud"

export const TIERS: ReadonlyArray<
  { readonly id: Tier; readonly label: string; readonly rate: number; readonly from: number }
> = [
  { id: "brons", label: "Brons", rate: 10, from: 0 },
  { id: "zilver", label: "Zilver", rate: 12, from: 100 },
  { id: "goud", label: "Goud", rate: 15, from: 250 }
]

export type AffiliatePerson = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly code: string
  readonly tier: Tier
  readonly appliedAt: Date
  readonly decidedAt?: Date
  readonly rejection?: string
}

/** The signed-in person per application state (`?affiliate=`), as `currentAffiliateByState`. */
export const AFFILIATE_BY_STATE = {
  goedgekeurd: {
    id: "priya-singh",
    name: "Priya Singh",
    email: "priya@creators.studio",
    code: "PRIYA10",
    tier: "goud",
    appliedAt: new Date(2026, 4, 1, 10),
    decidedAt: new Date(2026, 4, 4, 10)
  },
  "in-afwachting": {
    id: "amara-idris",
    name: "Amara Idris",
    email: "amara.id@gmail.com",
    code: "AMARA",
    tier: "brons",
    appliedAt: new Date(2026, 10, 18, 10)
  },
  afgewezen: {
    id: "kai-tanaka",
    name: "Kai Tanaka",
    email: "kai@stylelab.jp",
    code: "KAI",
    tier: "brons",
    appliedAt: new Date(2026, 10, 10, 10),
    decidedAt: new Date(2026, 10, 13, 15),
    rejection:
      "Je publiek overlapt met dat van een bestaande affiliate in dezelfde regio. Probeer het over 6 maanden opnieuw."
  }
} as const satisfies Record<string, AffiliatePerson>

export const PRIYA: AffiliatePerson = AFFILIATE_BY_STATE.goedgekeurd

export type PayoutMethod = "paypal" | "bank" | "wise"

export const METHOD_LABEL: Readonly<Record<PayoutMethod, string>> = {
  paypal: "PayPal",
  bank: "Bankoverschrijving",
  wise: "Wise"
}

/** Where the payouts go, as she saved them. The account is only ever shown masked. */
export const PAYMENT = { method: "paypal" as PayoutMethod, account: "priya@creators.studio", taxId: "" }

/* ── links ────────────────────────────────────────────────────────────────────────────────────── */

export type ReferralLink = {
  /** The URL slug: `/v2/portaal/affiliate/doorverwijzingen/instagram-bio`. */
  readonly id: string
  readonly label: string
  /** What she shares, without its scheme. */
  readonly url: string
  readonly clicks: number
  readonly createdAt: Date
  /** How many orders it brought in: the generator places this many. */
  readonly target: number
  /** A link that only ever sells one product. */
  readonly productId?: string
}

const LINKS: ReadonlyArray<ReferralLink> = [
  {
    id: "instagram-bio",
    label: "Instagram bio",
    url: "northwind.co/p/priya10",
    clicks: 4218,
    createdAt: new Date(2026, 4, 4, 10),
    target: 312
  },
  {
    id: "lookbook-najaar",
    label: "Lookbook najaar",
    url: "northwind.co/lb/priya-najaar",
    clicks: 1822,
    createdAt: new Date(2026, 8, 12, 10),
    target: 148
  },
  {
    id: "aurora-review",
    label: "YouTube-video · Aurora-review",
    url: "northwind.co/r/aurora-yt",
    clicks: 894,
    createdAt: new Date(2026, 9, 22, 10),
    target: 41,
    productId: "aurora-hooded-fleece"
  }
]

/** The busy week: a dozen more links, with the long labels and addresses that break a row. */
const BUSY_LINKS: ReadonlyArray<ReferralLink> = [
  "TikTok-video zomerjassen deel twee, met de Coastline Bomber en de Harbor Raincoat naast elkaar",
  "Nieuwsbrief december: cadeaugids voor iedereen die het koud heeft",
  "Pinterest-bord Wintergarderobe",
  "Blog: tien manieren om een fleece te dragen zonder dat het op sportkleding lijkt",
  "Instagram-story Black Friday",
  "YouTube Shorts · Field Pant in drie kleuren",
  "Podcast-aflevering 41, link in de shownotes",
  "Flyer markt Utrecht",
  "Threads-post najaarscollectie",
  "Samenwerking met @wandelenmetwim, gedeelde link voor zijn volgers in Nederland en België",
  "Linktree hoofdlink",
  "QR-code op de visitekaartjes"
].map((label, i): ReferralLink => ({
  id: `link-${i + 4}`,
  label,
  url: `northwind.co/?ref=PRIYA10&utm_source=affiliate&utm_medium=${
    ["video", "email", "social", "blog", "social", "video", "social", "print", "social", "social", "social", "print"][i]
  }&utm_campaign=${label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
  clicks: 120 + ((i * 397) % 1900),
  createdAt: new Date(2026, 8 + (i % 3), 2 + i * 2, 10),
  target: 3 + ((i * 7) % 22)
}))

/* ── conversions ──────────────────────────────────────────────────────────────────────────────── */

export type ConversionStatus = "in-retourtermijn" | "goedgekeurd" | "uitbetaald" | "teruggedraaid"

export const CONVERSION_STATUS: Readonly<
  Record<ConversionStatus, { readonly label: string; readonly tone: "warn" | "accent" | "good" | "neutral" }>
> = {
  "in-retourtermijn": { label: "In retourtermijn", tone: "warn" },
  goedgekeurd: { label: "Goedgekeurd", tone: "accent" },
  uitbetaald: { label: "Uitbetaald", tone: "good" },
  teruggedraaid: { label: "Teruggedraaid", tone: "neutral" }
}

/** An order that came in through one of her links (or her code alone: `linkId` null). */
export type Conversion = {
  readonly id: string
  readonly linkId: string | null
  readonly at: Date
  /** Northwind's order number, without the hash. */
  readonly order: string
  readonly productId: string
  readonly title: string
  /** What the order was worth, incl. btw. */
  readonly total: number
  readonly commission: number
  readonly status: ConversionStatus
}

/** The 15th of the month after `at`, at 10:00, when that month's commission is paid. */
export const payDayOf = (at: Date) => new Date(at.getFullYear(), at.getMonth() + 1, PAYOUT_DAY, 10)

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Before 16 November the shared records hold no orders; their numbers run up to #5249 from the store's start. */
const STORE_START = new Date(2025, 2, 1).getTime()
const historicNumber = (at: number) => Math.round(1000 + ((at - STORE_START) / (RECORDS_FROM - STORE_START)) * 4249)

const SELLABLE = PRODUCTS.filter((p) => p.status === "actief")
const cents = (n: number) => Math.round(n * 100) / 100

function statusOf(at: number, refunded: boolean): ConversionStatus {
  if (refunded) return "teruggedraaid"
  if (payDayOf(new Date(at)).getTime() <= NOW) return "uitbetaald"
  return NOW - at < RETURN_DAYS * DAY ? "in-retourtermijn" : "goedgekeurd"
}

function build(links: ReadonlyArray<ReferralLink>): ReadonlyArray<Conversion> {
  // This week's orders, oldest first, that a conversion can be: not cancelled, not today's last minutes.
  const real: Array<Order> = ORDERS.filter((o) => o.status !== "geannuleerd").toReversed()
  const taken = new Set<string>()
  const numbers = new Set<number>()
  const out: Array<Conversion> = []
  let seq = 0
  for (const [li, link] of links.entries()) {
    const r = mulberry(4000 + li)
    const start = link.createdAt.getTime()
    const span = NOW - start
    // Later days carry more weight, the way a link picks up as it is shared.
    const times = Array.from({ length: link.target }, () => start + Math.sqrt(r()) * span).toSorted((a, b) => a - b)
    for (const at of times) {
      seq += 1
      if (at >= RECORDS_FROM) {
        const fits = (o: Order) =>
          !taken.has(o.number) && o.placedAt.getTime() >= at &&
          (link.productId === undefined || o.lines.some((l) => l.productId === link.productId))
        const hit = real.find(fits) ?? real.findLast((o) => !taken.has(o.number) && o.placedAt.getTime() <= NOW)
        if (hit === undefined) continue
        taken.add(hit.number)
        const line = hit.lines.find((l) => l.productId === link.productId) ?? hit.lines[0]
        const p = product(line?.productId ?? "")
        if (p === undefined) continue
        const placed = hit.placedAt.getTime()
        out.push({
          id: `cv-${seq}`,
          linkId: link.id,
          at: hit.placedAt,
          order: hit.number,
          productId: p.id,
          title: p.name,
          total: hit.total,
          commission: cents(hit.total * COMMISSION),
          status: statusOf(placed, hit.status === "terugbetaald")
        })
        continue
      }
      const p = link.productId === undefined
        ? SELLABLE[Math.floor(r() * SELLABLE.length)]
        : product(link.productId)
      if (p === undefined) continue
      const quantity = r() < 0.85 ? 1 : 2
      const total = p.price * quantity
      let number = historicNumber(at)
      while (numbers.has(number)) number += 1
      numbers.add(number)
      const returned = NOW - at >= RETURN_DAYS * DAY && r() < 0.04
      out.push({
        id: `cv-${seq}`,
        linkId: link.id,
        at: new Date(at),
        order: String(number),
        productId: p.id,
        title: quantity === 1 ? p.name : `${p.name} (2×)`,
        total,
        commission: cents(total * COMMISSION),
        status: statusOf(at, returned)
      })
    }
  }
  return out.toSorted((a, b) => b.at.getTime() - a.at.getTime())
}

type Book = { readonly links: ReadonlyArray<ReferralLink>; readonly conversions: ReadonlyArray<Conversion> }

let normal: Book | undefined
let busy: Book | undefined

/** Her links and conversions; `druk` adds the busy week's links. Built once, on first use. */
export function affiliateBook(druk: boolean): Book {
  if (druk) {
    busy ??= ((links) => ({ links, conversions: build(links) }))([...LINKS, ...BUSY_LINKS])
    return busy
  }
  normal ??= { links: LINKS, conversions: build(LINKS) }
  return normal
}

/** A link's totals, from its conversions, so the list and its page add up to the rows. */
export type LinkTotals = {
  readonly link: ReferralLink
  readonly conversions: number
  readonly revenue: number
  readonly commission: number
}

export function linkTotals(book: Book, link: ReferralLink): LinkTotals {
  const rows = book.conversions.filter((c) => c.linkId === link.id && c.status !== "teruggedraaid")
  return {
    link,
    conversions: rows.length,
    revenue: cents(rows.reduce((n, c) => n + c.total, 0)),
    commission: cents(rows.reduce((n, c) => n + c.commission, 0))
  }
}

const SHORT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

export type Week = {
  readonly label: string
  readonly earned: number
  readonly conversions: number
  readonly clicks: number
}

/** Eight weeks to today, for one link or all of them; clicks follow the link's own clicks per order. */
export function weeksOf(book: Book, linkId?: string): ReadonlyArray<Week> {
  const rows = book.conversions.filter((c) => linkId === undefined || c.linkId === linkId)
  const links = book.links.filter((l) => linkId === undefined || l.id === linkId)
  const clicks = links.reduce((n, l) => n + l.clicks, 0)
  const all = rows.length
  const perOrder = all === 0 ? 14 : clicks / all
  return Array.from({ length: 8 }, (_, i) => {
    const to = NOW - (7 - i) * 7 * DAY
    const from = to - 7 * DAY
    const xs = rows.filter((c) => c.at.getTime() > from && c.at.getTime() <= to)
    const kept = xs.filter((c) => c.status !== "teruggedraaid")
    return {
      label: SHORT.format(new Date(to)).replace(".", ""),
      conversions: kept.length,
      clicks: Math.round(xs.length * perOrder),
      earned: Math.round(kept.reduce((n, c) => n + c.commission, 0))
    }
  })
}

/* ── payouts ──────────────────────────────────────────────────────────────────────────────────── */

export type PayoutMonth = {
  /** `2026-11`, also the URL. */
  readonly id: string
  readonly label: string
  readonly rows: ReadonlyArray<Conversion>
  readonly gross: number
  readonly reversed: number
  readonly total: number
  readonly status: "uitbetaald" | "loopt"
  readonly payDay: Date
}

const MONTH = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })

/** Her months, newest first: what came in, what was taken back, and when it is paid. */
export function payoutMonths(book: Book): ReadonlyArray<PayoutMonth> {
  const by = new Map<string, Array<Conversion>>()
  for (const c of book.conversions) {
    const key = `${c.at.getFullYear()}-${String(c.at.getMonth() + 1).padStart(2, "0")}`
    by.set(key, [...(by.get(key) ?? []), c])
  }
  return [...by.entries()]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([id, rows]) => {
      const [y = 2026, m = 1] = id.split("-").map(Number)
      const first = new Date(y, m - 1, 1)
      const gross = cents(rows.reduce((n, c) => n + c.commission, 0))
      const reversed = cents(rows.filter((c) => c.status === "teruggedraaid").reduce((n, c) => n + c.commission, 0))
      const payDay = payDayOf(first)
      const label = MONTH.format(first)
      return {
        id,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        rows,
        gross,
        reversed,
        total: cents(gross - reversed),
        status: payDay.getTime() <= NOW ? "uitbetaald" : "loopt",
        payDay
      }
    })
}

/* ── where a new link can land ────────────────────────────────────────────────────────────────── */

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export const DESTINATIONS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly path: string }> = [
  { id: "home", label: "Startpagina", path: "" },
  { id: "nieuw", label: "Collectie · Nieuw binnen", path: "collections/nieuw" },
  { id: "jassen", label: "Collectie · Jassen", path: "collections/jassen" },
  ...SELLABLE.slice(0, 10).map((p) => ({ id: p.id, label: `Product · ${p.name}`, path: `products/${slug(p.name)}` }))
]

export type Medium = "social" | "video" | "email" | "blog" | "print"

export const MEDIUM_LABEL: Readonly<Record<Medium, string>> = {
  social: "Social media",
  video: "Video",
  email: "Nieuwsbrief",
  blog: "Blog of website",
  print: "Print"
}

/** The address a link will have, before it is made, without its scheme. */
export function linkUrl(destinationId: string, medium: Medium, campaign: string, code: string) {
  const d = DESTINATIONS.find((x) => x.id === destinationId)
  const query = new URLSearchParams({
    ref: code,
    utm_source: "affiliate",
    utm_medium: medium,
    utm_campaign: slug(campaign) || "link"
  })
  return `northwind.co/${d?.path ?? ""}?${query.toString()}`
}

export { slug as linkSlug }

/* ── material and questions ───────────────────────────────────────────────────────────────────── */

export type ResourceKind = "logo" | "afbeelding" | "video" | "document" | "gids"

export type Resource = {
  readonly id: string
  readonly name: string
  readonly kind: ResourceKind
  readonly size: string
  readonly updatedAt: Date
}

export const RESOURCES: ReadonlyArray<Resource> = [
  {
    id: "lookbook-winter",
    name: "Lookbook winter '26",
    kind: "afbeelding",
    size: "22 MB · ZIP",
    updatedAt: new Date(2026, 10, 22, 14, 30)
  },
  {
    id: "logopakket",
    name: "Logopakket Northwind",
    kind: "logo",
    size: "2,4 MB · ZIP",
    updatedAt: new Date(2026, 9, 12)
  },
  {
    id: "lookbook-najaar",
    name: "Lookbook najaar '26",
    kind: "afbeelding",
    size: "18 MB · ZIP",
    updatedAt: new Date(2026, 8, 22)
  },
  {
    id: "reels-aurora",
    name: "Productreels Aurora fleece",
    kind: "video",
    size: "240 MB · MP4",
    updatedAt: new Date(2026, 9, 1)
  },
  {
    id: "merkstem",
    name: "Gids voor merkstem en boodschap",
    kind: "document",
    size: "1,1 MB · PDF",
    updatedAt: new Date(2026, 7, 20)
  },
  {
    id: "handboek",
    name: "Affiliatehandboek 2026",
    kind: "gids",
    size: "3,2 MB · PDF",
    updatedAt: new Date(2026, 6, 8)
  },
  {
    id: "captions",
    name: "Kant-en-klare captions voor social",
    kind: "document",
    size: "120 KB · DOCX",
    updatedAt: new Date(2026, 9, 30)
  }
]

export const FAQS: ReadonlyArray<{ readonly q: string; readonly a: string }> = [
  {
    q: "Wanneer worden uitbetalingen gedaan?",
    a: "Op de 15e van elke maand betaalt Northwind de commissie van de maand ervoor uit, zodra de retourtermijn van 14 dagen voorbij is, via PayPal, bankoverschrijving of Wise."
  },
  {
    q: "Mag ik betaalde advertenties draaien op Northwind-zoekwoorden?",
    a: "Nee. Bieden op zoekwoorden met de merknaam Northwind is niet toegestaan en kan leiden tot schorsing van je account."
  },
  {
    q: "Hoelang blijven doorverwijscookies geldig?",
    a: "30 dagen vanaf de eerste klik. Koopt een klant binnen die periode, dan wordt de conversie aan jou toegeschreven."
  },
  {
    q: "Wat gebeurt er als een klant iets terugstuurt?",
    a: "Binnen de retourtermijn van 14 dagen wacht je commissie. Wordt de bestelling terugbetaald, dan draait Northwind de commissie terug; je ziet hem doorgestreept bij de maand."
  }
]

/* ── notifications ────────────────────────────────────────────────────────────────────────────── */

export type AffiliateNote = {
  readonly id: string
  readonly kind: "conversie" | "uitbetaling" | "materiaal"
  readonly text: string
  readonly at: string
  readonly page: string
  readonly unread: boolean
  readonly from?: string
}

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What an affiliate hears about: what its links earn and what the brand put ready. Never the brand's own work. */
export function affiliateNotes(book: Book): ReadonlyArray<AffiliateNote> {
  const last = book.conversions.find((c) => c.status !== "teruggedraaid")
  const link = book.links.find((l) => l.id === last?.linkId)
  const open = payoutMonths(book).find((m) => m.status === "loopt")
  return [
    ...(last === undefined ? [] : [{
      id: "a1",
      kind: "conversie" as const,
      text: `Nieuwe conversie via **${link?.label ?? "je code"}**: ${euro(last.total)}, jouw commissie ${
        euro(last.commission)
      }.`,
      at: `${String(last.at.getHours()).padStart(2, "0")}:${String(last.at.getMinutes()).padStart(2, "0")}`,
      page: link === undefined ? "doorverwijzingen" : `doorverwijzingen/${link.id}`,
      unread: true
    }]),
    ...(open === undefined ? [] : [{
      id: "a2",
      kind: "uitbetaling" as const,
      text: `Je volgende uitbetaling staat gepland voor **15 december**: ${euro(open.total)} naar PayPal.`,
      at: "11:40",
      page: `uitbetalingen/${open.id}`,
      unread: true
    }]),
    {
      id: "a3",
      kind: "materiaal",
      from: "Maya Roy",
      text: "Maya Roy van Northwind heeft nieuw materiaal klaargezet: **Lookbook winter '26**.",
      at: "gisteren",
      page: "materiaal",
      unread: false
    },
    {
      id: "a4",
      kind: "uitbetaling",
      text: "Je uitbetaling over **oktober** is overgemaakt naar PayPal.",
      at: "15 nov",
      page: "uitbetalingen/2026-10",
      unread: false
    }
  ]
}

/** The unread count the portal's nav shows, from the same rows as the page. */
export const affiliateUnread = () => affiliateNotes(affiliateBook(false)).filter((n) => n.unread).length

/** Pages a pending or rejected applicant can still reach; the rest is the application. */
export const NOW_MS = NOW
export const DAY_MS = DAY
