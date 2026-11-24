import { formatChange, formatValue, judge } from "../../charts/format.ts"
import type { Better, Format } from "../../charts/format.ts"
import type { BarData } from "../../charts/types.ts"
import type { Block, BlockId } from "../../fixtures/analytics.ts"
import { CHARGEBACKS } from "../../fixtures/chargebacks.ts"
import { FIRST_ORDER_NUMBER, ORDER_STATUS, ORDERS, product, PRODUCTS, supplier } from "../../fixtures/records.ts"
import type { Order, Payment } from "../../fixtures/records.ts"
import { paths } from "../../router.tsx"
import type { Tone } from "../../ui/badge.tsx"
import {
  agg,
  blocksOf,
  bucketsOf,
  CATS,
  dateAt,
  dayOf,
  eventsOf,
  lengthOf,
  NOW,
  shortDate,
  W0,
  weekday
} from "./model.ts"
import type { Agg, Ctx, Span } from "./model.ts"

/*
 * A number, taken apart: what it is against what it was, Magnus's reading of it, what moved it, how it
 * splits, and the orders it counts. Every figure and every bar or point on a board opens one, by a key
 * the address holds (`?uitleg=f.kerncijfers.0`, `?uitleg=i.omzetPerDag.4`), so an explanation can be
 * linked. The findings and the answers to a typed question are built from the same pieces.
 */

/* ── the orders behind a number ────────────────────────────────────────────────────────────────── */

export type Row = {
  readonly key: string
  readonly number: string
  readonly at: Date
  readonly item: string
  readonly outcome: string
  readonly tone: Tone
  readonly total: number
  /** Where the row opens: the order, or the chargeback. Absent for an order older than the order list. */
  readonly href?: string
}

type Placed = {
  readonly number: string
  readonly at: Date
  readonly productId: string
  readonly item: string
  readonly status: Order["status"]
  readonly total: number
  readonly storeId: Order["storeId"]
  readonly payment: Payment
  readonly real: boolean
}

const ACTIVE = PRODUCTS.filter((p) => p.status === "actief")
const PAYMENTS: ReadonlyArray<Payment> = ["iDEAL", "iDEAL", "iDEAL", "Kaart", "Klarna", "PayPal", "Bancontact"]
const STORE_IDS = ["store_eu", "store_us"] as const

/** A deterministic number in [0, 1) from two integers. */
const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2d)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

const itemOf = (o: Order) => {
  const first = o.lines[0]
  const name = product(first?.productId ?? "")?.name ?? ""
  const more = o.lines.length - 1
  return `${(first?.quantity ?? 1) > 1 ? `${first?.quantity} × ` : ""}${name}${more > 0 ? ` +${more}` : ""}`
}

/** The order number the first order of a day before the order list had: counted back from #5250. */
const firstNumber = new Map<number, number>()
function firstOf(i: number): number {
  const hit = firstNumber.get(i)
  if (hit !== undefined) return hit
  let at = FIRST_ORDER_NUMBER
  for (let k = W0 - 1; k >= i; k--) {
    at -= dayOf(k).orders
    firstNumber.set(k, at)
  }
  return firstNumber.get(i) ?? at
}

const placed = new Map<number, ReadonlyArray<Placed>>()

/** A day's orders, oldest first: the order list's from 16 November, the shop's history before. */
function ordersOn(i: number): ReadonlyArray<Placed> {
  const hit = placed.get(i)
  if (hit !== undefined) return hit
  let out: ReadonlyArray<Placed>
  if (i >= W0) {
    out = ORDERS.filter((o) => o.placedAt >= dateAt(i) && o.placedAt < dateAt(i + 1))
      .toReversed()
      .map((o) => ({
        number: o.number,
        at: o.placedAt,
        productId: o.lines[0]?.productId ?? "",
        item: itemOf(o),
        status: o.status,
        total: o.total,
        storeId: o.storeId,
        payment: o.payment,
        real: true
      }))
  } else {
    const count = dayOf(i).orders
    const first = firstOf(i)
    const day = dateAt(i).getTime()
    out = Array.from({ length: count }, (_, j) => {
      const p = ACTIVE[Math.floor(hash(i, j) * ACTIVE.length)] ?? ACTIVE[0]
      const two = hash(j, i) < 0.06
      const lines = (p?.price ?? 0) * (two ? 2 : 1)
      return {
        number: String(first + j),
        at: new Date(day + (7 + 16 * Math.sqrt((j + 0.5) / count)) * 3_600_000),
        productId: p?.id ?? "",
        item: `${two ? "2 × " : ""}${p?.name ?? ""}`,
        status: "bezorgd" as const,
        total: lines + (lines < 50 ? 4.95 : 0),
        storeId: STORE_IDS[hash(i + 7, j) < 0.86 ? 0 : 1] ?? "store_eu",
        payment: PAYMENTS[Math.floor(hash(i + 3, j) * PAYMENTS.length)] ?? "iDEAL",
        real: false
      }
    })
  }
  placed.set(i, out)
  return out
}

const NAMED_IDS: ReadonlyArray<string> = CATS.products

function placedIn(s: Span): ReadonlyArray<{ readonly i: number; readonly o: Placed }> {
  const out: Array<{ i: number; o: Placed }> = []
  for (let i = Math.max(0, s.from); i <= Math.min(s.to, NOW); i++) {
    const day = ordersOn(i)
    const kept = i === s.part ? day.slice(0, Math.round(day.length * 0.47)) : day
    for (const o of kept) out.push({ i, o })
  }
  return out
}

const plainRow = (o: Placed): Row => ({
  key: o.number,
  number: o.number,
  at: o.at,
  item: o.item,
  outcome: ORDER_STATUS[o.status].label,
  tone: ORDER_STATUS[o.status].tone,
  total: o.total,
  ...(o.real ? { href: paths.order(o.number) } : {})
})

const newestFirst = (rows: ReadonlyArray<Row>) => rows.toSorted((a, b) => b.at.getTime() - a.at.getTime())

/** The orders of a span, optionally only those `keep` lets through. */
const orderRows = (s: Span, keep?: (o: Placed) => boolean) =>
  newestFirst(placedIn(s).filter(({ o }) => keep === undefined || keep(o)).map(({ o }) => plainRow(o)))

const byNumber = new Map(ORDERS.map((o) => [o.number, o]))

function refundRows(s: Span, keep: (r: { product: number; reason: number; carrier: number }) => boolean): Array<Row> {
  return newestFirst(
    eventsOf(s).refunds.filter(keep).map((r, k) => {
      const real = r.order === undefined ? undefined : byNumber.get(r.order)
      const day = ordersOn(r.i)
      const stand = day[Math.floor(hash(r.i, k + 101) * day.length)]
      const named = r.product < NAMED_IDS.length ? product(NAMED_IDS[r.product] ?? "") : undefined
      const own = real === undefined ? stand?.productId : real.lines[0]?.productId
      const matches = named === undefined ? !NAMED_IDS.includes(own ?? "") : own === named.id
      const shown = named ?? product(matches ? own ?? "" : "mariner-wool-beanie")
      const number = real?.number ?? stand?.number ?? ""
      return {
        key: `r${number}${k}`,
        number,
        at: real?.placedAt ?? stand?.at ?? dateAt(r.i),
        item: shown?.name ?? "",
        outcome: `Terugbetaald · ${CATS.reasons[r.reason] ?? ""}`,
        tone: "bad" as const,
        total: real !== undefined && matches ? real.total : shown?.price ?? 0,
        ...(real !== undefined && matches ? { href: paths.order(real.number) } : {})
      }
    })
  )
}

function lateRows(s: Span, keep: (r: { supplier: number; country: number }) => boolean): Array<Row> {
  const used = new Set<string>()
  return newestFirst(
    eventsOf(s).late.filter(keep).map((r, k) => {
      const wanted = CATS.suppliers[r.supplier]
      const day = ordersOn(r.i)
      const fits = day.filter((o) => !used.has(o.number) && o.status !== "geannuleerd")
      const o = fits.find((x) => product(x.productId)?.supplierId === wanted?.id) ??
        fits[Math.floor(hash(r.i, k + 7) * fits.length)] ?? day[0]
      if (o !== undefined) used.add(o.number)
      const late = `${r.days} ${r.days === 1 ? "dag" : "dagen"} te laat`
      return {
        key: `l${o?.number ?? k}`,
        number: o?.number ?? "",
        at: o?.at ?? dateAt(r.i),
        item: o?.item ?? "",
        outcome: `${late} · ${supplier(wanted?.id ?? "")?.name ?? wanted?.label ?? ""}`,
        tone: "warn" as const,
        total: o?.total ?? 0,
        ...(o?.real === true ? { href: paths.order(o.number) } : {})
      }
    })
  )
}

function disputeRows(s: Span, keep: (reason: number) => boolean): Array<Row> {
  return newestFirst(
    eventsOf(s).disputes.filter((d) => keep(d.reason)).map((d, k) => {
      const real = CHARGEBACKS.find((c) => c.id === d.id)
      const o = real === undefined ? ordersOn(d.i)[k] : undefined
      const linked = real !== undefined ? byNumber.get(real.orderNumber) : undefined
      return {
        key: `d${d.id ?? k}${d.i}`,
        number: real?.orderNumber ?? o?.number ?? "",
        at: linked?.placedAt ?? o?.at ?? dateAt(d.i),
        item: linked === undefined ? o?.item ?? "" : itemOf(linked),
        outcome: `${real?.id ?? "Geschil"} · ${CATS.disputes[d.reason] ?? ""}`,
        tone: "bad" as const,
        total: d.amount,
        ...(real === undefined ? {} : { href: paths.chargeback(real.id) })
      }
    })
  )
}

/* ── an explanation ────────────────────────────────────────────────────────────────────────────── */

export type Driver = {
  readonly label: string
  readonly value: number
  readonly shown: string
  readonly detail?: string
}

export type Explanation = {
  readonly key: string
  readonly title: string
  readonly value: string
  /** "tegen € 44.800 in 9–15 nov". */
  readonly against?: string
  readonly change?: { readonly text: string; readonly verdict: "good" | "bad" | "flat" }
  /** Magnus's reading, in a sentence or three. */
  readonly reading: string
  readonly driversTitle: string
  readonly drivers: ReadonlyArray<Driver>
  readonly breakdown?: { readonly title: string; readonly data: BarData }
  /** What the rows are, and the rows; `null` when the number is not counted in orders. */
  readonly rows: { readonly title: string; readonly list: () => ReadonlyArray<Row> } | null
  readonly link?: { readonly label: string; readonly to: string }
}

const n = (v: number) => v.toLocaleString("nl-NL")
const euro = (v: number) => formatValue(v, "euro")
const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))
const signed = (v: number, format: Format | "plain") => {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±"
  const abs = Math.abs(v)
  return `${sign}${format === "plain" ? n(Math.round(abs * 10) / 10) : formatValue(abs, format)}`
}

/** What moved a number between two periods, by category, biggest move first; without a comparison, what it is made of. */
function movers(
  labels: ReadonlyArray<string>,
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number> | null,
  format: Format | "plain" = "plain",
  limit = 6
): ReadonlyArray<Driver> {
  return labels
    .map((label, k) => {
      const now = a[k] ?? 0
      const was = b === null ? 0 : b[k] ?? 0
      const value = now - was
      return {
        label,
        value,
        shown: b === null ? (format === "plain" ? n(now) : formatValue(now, format)) : signed(value, format),
        ...(b === null
          ? {}
          : {
            detail: `${format === "plain" ? n(was) : formatValue(was, format)} → ${
              format === "plain" ? n(now) : formatValue(now, format)
            }`
          })
      }
    })
    .filter((d) => (b === null ? (a[labels.indexOf(d.label)] ?? 0) > 0 : d.value !== 0))
    .toSorted((x, y) => Math.abs(y.value) - Math.abs(x.value))
    .slice(0, limit)
}

const rank = (
  labels: ReadonlyArray<string>,
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number> | null,
  format: Format = "count"
): BarData => ({
  items: labels.map((label, k) => ({ label, value: a[k] ?? 0, ...(b === null ? {} : { compare: b[k] ?? 0 }) }))
    .filter((x) => x.value > 0 || (x.compare ?? 0) > 0),
  format
})

type Pair = { readonly A: Agg; readonly B: Agg | null; readonly a: Span; readonly b: Span | null; readonly ctx: Ctx }

function head(now: number, was: number | undefined, format: Format, better: Better, label: string) {
  return {
    value: formatValue(now, format),
    ...(was === undefined
      ? {}
      : {
        against: `tegen ${formatValue(was, format)} ${at(label)}`,
        change: { text: formatChange(now, was, format), verdict: judge(now, was, better) }
      })
  }
}

const WEEKDAY_NAME = /^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) /
/** "in 9–15 nov", "op vrijdag 13 nov". */
const at = (label: string) => `${WEEKDAY_NAME.test(label) ? "op" : "in"} ${label}`
const oneDecimal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 })
/** "7,6%": how far apart two values are, without the sign the sentence carries. */
const rel = (now: number, was: number) => `${oneDecimal.format(Math.abs((now / was - 1) * 100))}%`

const moreLess = (now: number, was: number) => (now >= was ? "meer" : "minder")

type Metric =
  | "revenue"
  | "orders"
  | "refunds"
  | "refundRate"
  | "exchanges"
  | "refundEuro"
  | "reply"
  | "tickets"
  | "solved"
  | "agents"
  | "onTime"
  | "late"
  | "lead"
  | "delayed"

const METRIC: Readonly<Record<string, Metric>> = {
  Omzet: "revenue",
  Bestellingen: "orders",
  Terugbetalingen: "refunds",
  Retourpercentage: "refundRate",
  Omruilingen: "exchanges",
  Terugbetaald: "refundEuro",
  "Eerste reactie": "reply",
  Tickets: "tickets",
  "Binnen een dag opgelost": "solved",
  "Door agents afgehandeld": "agents",
  "Op tijd bezorgd": "onTime",
  "Te laat": "late",
  "Gem. levertijd": "lead",
  "Nu vertraagd": "delayed",
  Vertraagd: "delayed"
}

/** Revenue per store, as the orders split. */
const stores = (x: Agg) => x.byStore.map((c) => (x.orders === 0 ? 0 : Math.round((x.revenue * c) / x.orders)))

function metric(
  p: Pair,
  m: Metric,
  key: string,
  title: string,
  shown?: { value: number; previous?: number }
): Explanation {
  const { A, B, ctx } = p
  const cmp = B === null ? null : B
  const label = p.b === null ? "" : ctx.cmpLabel
  const where = ctx.label

  if (m === "revenue") {
    const aov = A.orders === 0 ? 0 : A.revenue / A.orders
    const bov = cmp === null || cmp.orders === 0 ? 0 : cmp.revenue / cmp.orders
    const volume = cmp === null ? 0 : Math.round((A.orders - cmp.orders) * bov)
    const basket = cmp === null ? 0 : A.revenue - cmp.revenue - volume
    const buckets = bucketsOf(p.a)
    const values = buckets.map((s) => agg(s).revenue)
    const best = values.indexOf(Math.max(...values))
    const bestSpan = buckets[best]
    return {
      key,
      title,
      ...head(A.revenue, cmp?.revenue, "euro", "higher", label),
      reading: [
        `${A.orders === 0 ? "Geen bestellingen" : `${n(A.orders)} betaalde bestellingen`} ${at(where)} brachten ${
          euro(A.revenue)
        } op, ${euro(Math.round(aov))} per bestelling.`,
        cmp === null || cmp.revenue === 0
          ? ""
          : `Dat is ${rel(A.revenue, cmp.revenue)} ${moreLess(A.revenue, cmp.revenue)} dan ${at(label)}: ${
            Math.abs(volume) >= Math.abs(basket)
              ? `vooral ${A.orders >= cmp.orders ? "meer" : "minder"} bestellingen`
              : `vooral een ${aov >= bov ? "hoger" : "lager"} bedrag per bestelling`
          }.`,
        buckets.length > 1 && bestSpan !== undefined
          ? `De beste ${lengthOf(bestSpan) > 1 ? "week was die van" : "dag was"} ${dayName(bestSpan.from)}, met ${
            euro(values[best] ?? 0)
          }.`
          : ""
      ].filter(Boolean).join(" "),
      driversTitle: cmp === null ? "Waar het vandaan komt" : "Wat erachter zit",
      drivers: cmp === null
        ? movers(CATS.stores, stores(A), null, "euro")
        : [
          {
            label: "Aantal bestellingen",
            value: volume,
            shown: signed(volume, "euro"),
            detail: `${n(cmp.orders)} → ${n(A.orders)}`
          },
          {
            label: "Bedrag per bestelling",
            value: basket,
            shown: signed(basket, "euro"),
            detail: `${euro(Math.round(bov))} → ${euro(Math.round(aov))}`
          },
          ...movers(CATS.stores, stores(A), stores(cmp), "euro")
        ],
      breakdown: { title: "Per winkel", data: rank(CATS.stores, stores(A), cmp === null ? null : stores(cmp), "euro") },
      rows: { title: "De bestellingen die meetellen", list: () => orderRows(p.a) },
      link: { label: "In Bestellingen openen", to: paths.orders }
    }
  }

  if (m === "orders") {
    return {
      key,
      title,
      ...head(A.orders, cmp?.orders, "count", "higher", label),
      reading: `${n(A.orders)} bestellingen ${at(where)}${
        cmp === null ? "" : `, ${n(Math.abs(A.orders - cmp.orders))} ${moreLess(A.orders, cmp.orders)} dan ${at(label)}`
      }. ${CATS.stores[0]} bracht er ${n(A.byStore[0] ?? 0)}, ${CATS.stores[1]} ${n(A.byStore[1] ?? 0)}; ${
        CATS.payments[0]
      } blijft de meest gebruikte betaalmethode.`,
      driversTitle: cmp === null ? "Waar ze vandaan komen" : "Wat erachter zit",
      drivers: [
        ...movers(CATS.stores, A.byStore, cmp?.byStore ?? null),
        ...movers(CATS.payments, A.byPayment, cmp?.byPayment ?? null, "plain", 3)
      ],
      breakdown: { title: "Per betaalmethode", data: rank(CATS.payments, A.byPayment, cmp?.byPayment ?? null) },
      rows: { title: "De bestellingen die meetellen", list: () => orderRows(p.a) },
      link: { label: "In Bestellingen openen", to: paths.orders }
    }
  }

  if (m === "refunds" || m === "refundRate" || m === "refundEuro") {
    const top = A.byProduct.indexOf(Math.max(...A.byProduct))
    const reason = A.byReason.indexOf(Math.max(...A.byReason))
    const rateA = A.orders === 0 ? 0 : Math.round((A.refunds / A.orders) * 1000) / 10
    const rateB = cmp === null || cmp.orders === 0 ? undefined : Math.round((cmp.refunds / cmp.orders) * 1000) / 10
    const values = m === "refunds"
      ? head(A.refunds, cmp?.refunds, "count", "lower", label)
      : m === "refundRate"
      ? head(rateA, rateB, "percent", "lower", label)
      : head(A.refundEuro, cmp?.refundEuro, "euro", "lower", label)
    const lead = m === "refundRate"
      ? `${n(rateA)}% van de ${n(A.orders)} bestellingen ${at(where)} kwam terug als terugbetaling.`
      : m === "refundEuro"
      ? `${euro(A.refundEuro)} terugbetaald ${at(where)}, gemiddeld ${
        euro(A.refunds === 0 ? 0 : Math.round(A.refundEuro / A.refunds))
      } per terugbetaling.`
      : `${n(A.refunds)} terugbetalingen ${at(where)}${cmp === null ? "" : `, tegen ${n(cmp.refunds)} ${at(label)}`}.`
    return {
      key,
      title,
      ...values,
      reading: A.refunds === 0
        ? `${lead} Er kwam niets terug.`
        : `${lead} ${
          CATS.productLabel[top] === "Overig"
            ? "Overige producten"
            : `De ${product(CATS.products[top] ?? "")?.name ?? ""}`
        } telt er ${n(A.byProduct[top] ?? 0)}; de meest genoemde reden is ‘${
          (CATS.reasons[reason] ?? "").toLowerCase()
        }’ (${n(A.byReason[reason] ?? 0)}).`,
      driversTitle: cmp === null ? "Per product" : "Wat erachter zit",
      drivers: movers(CATS.productLabel, A.byProduct, cmp?.byProduct ?? null),
      breakdown: { title: "Per reden", data: rank(CATS.reasons, A.byReason, cmp?.byReason ?? null) },
      rows: { title: "De terugbetaalde bestellingen", list: () => refundRows(p.a, () => true) },
      link: { label: "Naar Retouren", to: paths.returns }
    }
  }

  if (m === "exchanges") {
    return {
      key,
      title,
      ...head(A.exchanges, cmp?.exchanges, "count", "higher", label),
      reading: `${n(A.exchanges)} ${A.exchanges === 1 ? "klant koos" : "klanten kozen"} ${
        at(where)
      } een andere maat of kleur in plaats van het geld terug. Elke omruiling is een terugbetaling minder en houdt de omzet binnen.`,
      driversTitle: "Waarom er terugkwam",
      drivers: movers(CATS.reasons, A.byReason, cmp?.byReason ?? null),
      rows: null,
      link: { label: "Naar Retouren", to: paths.returns }
    }
  }

  if (m === "reply" || m === "tickets" || m === "solved" || m === "agents") {
    const busy = A.ticketsByWeekday.indexOf(Math.max(...A.ticketsByWeekday))
    const values = m === "reply"
      ? head(A.reply, cmp?.reply, "minutes", "lower", label)
      : m === "tickets"
      ? head(A.tickets, cmp?.tickets, "count", "lower", label)
      : m === "solved"
      ? head(A.solved, cmp?.solved, "percent", "higher", label)
      : head(A.agents, cmp?.agents, "count", "higher", label)
    const share = pct(A.agents, A.tickets)
    return {
      key,
      title,
      ...values,
      reading: [
        `${n(A.tickets)} tickets ${at(where)}, de eerste reactie na gemiddeld ${n(A.reply)} minuten.`,
        A.agents > 0 ? `De agents handelden er ${n(A.agents)} af (${share}%), dag en nacht.` : "",
        `${capital(DAYS[busy] ?? "")} was de drukste dag, met ${n(A.ticketsByWeekday[busy] ?? 0)}.`
      ].filter(Boolean).join(" "),
      driversTitle: cmp === null ? "Per weekdag" : "Wat erachter zit",
      drivers: movers(DAYS.map(capital), A.ticketsByWeekday, cmp?.ticketsByWeekday ?? null, "plain", 7),
      rows: null,
      link: { label: "Naar Tickets", to: paths.tickets }
    }
  }

  // Delivery: on time, late, lead time, delayed.
  const onA = 100 - (A.delivered === 0 ? 0 : Math.round((A.late / A.delivered) * 1000) / 10)
  const onB = cmp === null
    ? undefined
    : 100 - (cmp.delivered === 0 ? 0 : Math.round((cmp.late / cmp.delivered) * 1000) / 10)
  const slow = A.lateBySupplier.indexOf(Math.max(...A.lateBySupplier))
  const values = m === "onTime"
    ? head(onA, onB, "percent", "higher", label)
    : m === "late"
    ? head(A.late, cmp?.late, "count", "lower", label)
    : m === "lead"
    ? head(A.lead, cmp?.lead, "days", "lower", label)
    : head(shown?.value ?? 0, shown?.previous, "count", "lower", label)
  return {
    key,
    title,
    ...values,
    reading: `${n(A.late)} van de ${n(A.delivered)} pakketten ${at(where)} kwamen na de beloofde dag aan (${
      n(Math.round((100 - onA) * 10) / 10)
    }%). ${supplier(CATS.suppliers[slow]?.id ?? "")?.name ?? ""} had er ${
      n(A.lateBySupplier[slow] ?? 0)
    }, met gemiddeld ${n(A.leadBySupplier[slow] ?? 0)} dagen onderweg.`,
    driversTitle: cmp === null ? "Per leverancier" : "Wat erachter zit",
    drivers: movers(
      CATS.suppliers.map((s) => supplier(s.id)?.name ?? s.label),
      A.lateBySupplier,
      cmp?.lateBySupplier ?? null
    ),
    breakdown: { title: "Te laat per land", data: rank(CATS.countries, A.lateByCountry, cmp?.lateByCountry ?? null) },
    rows: { title: "De te late pakketten", list: () => lateRows(p.a, () => true) },
    link: { label: "Naar Leveranciers", to: paths.suppliers }
  }
}

const DAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const dayName = (i: number) => `${DAYS[weekday(i)]} ${shortDate(i)}`

/** A category within a category, counted from the same events: per product within a reason, and so on. */
const within = <T>(xs: ReadonlyArray<T>, of: (x: T) => number, size: number) => {
  const out = Array.from({ length: size }, () => 0)
  for (const x of xs) out[of(x)] = (out[of(x)] ?? 0) + 1
  return out
}

/** Products 4, 5 and 6 are drawn together as Overig. */
const inShown = (cat: number, k: number) => (k === 4 ? cat >= 4 : cat === k)

function item(p: Pair, blockId: BlockId, k: number, key: string, block: Block): Explanation | null {
  const { A, B, ctx } = p
  const label = ctx.cmpLabel
  const cmp = B

  if (blockId === "omzetPerDag" || blockId === "bestellingenPerDag") {
    const cur = bucketsOf(p.a)
    const span = cur[k]
    if (span === undefined) return null
    const other = p.b === null ? null : bucketsOf(p.b)[k] ?? null
    const nameOf = (x: Span) => (lengthOf(x) > 1 ? `de week van ${shortDate(x.from)}` : dayName(x.from))
    const inner: Pair = {
      ctx: { ...ctx, label: nameOf(span), cmpLabel: other === null ? "" : nameOf(other) },
      A: agg(span),
      B: other === null ? null : agg(other),
      a: span,
      b: other
    }
    const what = blockId === "omzetPerDag" ? "Omzet" : "Bestellingen"
    const title = `${what} ${lengthOf(span) > 1 ? "in" : "op"} ${nameOf(span)}`
    return metric(inner, blockId === "omzetPerDag" ? "revenue" : "orders", key, title)
  }

  if (blockId === "retourredenen" || blockId === "terugbetalingenPerProduct" || blockId === "perVervoerder") {
    const ev = eventsOf(p.a).refunds
    const evB = p.b === null ? null : eventsOf(p.b).refunds
    const keep = (r: { product: number; reason: number; carrier: number }) =>
      blockId === "retourredenen"
        ? r.reason === k
        : blockId === "perVervoerder"
        ? r.carrier === k
        : inShown(r.product, k)
    const mine = ev.filter(keep)
    const was = evB?.filter(keep) ?? null
    const what = block.kind === "rank" || block.kind === "bar" ? block.data.items[k]?.label ?? "" : ""
    const title = blockId === "retourredenen"
      ? `Terugbetalingen om ‘${what.toLowerCase()}’`
      : blockId === "perVervoerder"
      ? `Terugbetalingen met ${what}`
      : what === "Overig"
      ? "Terugbetalingen voor overige producten"
      : `Terugbetalingen voor de ${product(CATS.products[k] ?? "")?.name ?? what}`
    const split = blockId === "retourredenen"
      ? { labels: CATS.productLabel, of: (r: { product: number }) => r.product, title: "Per product" }
      : { labels: CATS.reasons, of: (r: { reason: number }) => r.reason, title: "Per reden" }
    const a = within(mine, split.of as (r: (typeof mine)[number]) => number, split.labels.length)
    const b = was === null ? null : within(was, split.of as (r: (typeof mine)[number]) => number, split.labels.length)
    const top = a.indexOf(Math.max(...a))
    const productId = blockId === "terugbetalingenPerProduct" && k < 4 ? CATS.products[k] : undefined
    return {
      key,
      title,
      ...head(mine.length, was?.length, "count", "lower", label),
      reading: mine.length === 0
        ? `Geen terugbetalingen hiervoor ${at(ctx.label)}.`
        : `${n(mine.length)} van de ${n(A.refunds)} terugbetalingen ${at(ctx.label)} (${pct(mine.length, A.refunds)}%)${
          was === null ? "" : `, tegen ${n(was.length)} ${at(label)}`
        }. ${split.title === "Per product" ? "Het meest" : "Meest genoemd"}: ${split.labels[top]} (${n(a[top] ?? 0)}).`,
      driversTitle: cmp === null ? split.title : `${split.title}, wat bewoog`,
      drivers: movers(split.labels, a, b),
      rows: { title: "De terugbetaalde bestellingen", list: () => refundRows(p.a, keep) },
      link: productId === undefined
        ? { label: "Naar Retouren", to: paths.returns }
        : { label: "Product openen", to: paths.product(productId) }
    }
  }

  if (blockId === "levertijd" || blockId === "teLaatPerLand") {
    const ev = eventsOf(p.a).late
    const evB = p.b === null ? null : eventsOf(p.b).late
    const keep = (r: { supplier: number; country: number }) =>
      blockId === "levertijd" ? r.supplier === k : r.country === k
    const mine = ev.filter(keep)
    const was = evB?.filter(keep) ?? null
    const s = CATS.suppliers[k]
    const name = blockId === "levertijd" ? supplier(s?.id ?? "")?.name ?? s?.label ?? "" : CATS.countries[k] ?? ""
    const labels = blockId === "levertijd" ? CATS.countries : CATS.suppliers.map((x) => supplier(x.id)?.name ?? x.label)
    const of = (r: { supplier: number; country: number }) => blockId === "levertijd" ? r.country : r.supplier
    const a = within(mine, of, labels.length)
    const b = was === null ? null : within(was, of, labels.length)
    const lead = A.leadBySupplier[k] ?? 0
    return {
      key,
      title: blockId === "levertijd" ? `${name}, levertijd` : `Te laat in ${name}`,
      ...(blockId === "levertijd"
        ? head(lead, cmp?.leadBySupplier[k], "days", "lower", label)
        : head(mine.length, was?.length, "count", "lower", label)),
      reading: blockId === "levertijd"
        ? `${name} deed er ${at(ctx.label)} gemiddeld ${n(lead)} dagen over, waar 5 beloofd is. Er kwamen ${
          n(mine.length)
        } pakketten te laat${was === null ? "" : `, tegen ${n(was.length)} ${at(label)}`}.`
        : `${n(mine.length)} van de ${n(A.late)} te late pakketten ${at(ctx.label)} gingen naar ${name}. ${
          labels[a.indexOf(Math.max(...a))] ?? ""
        } leverde er de meeste van (${n(Math.max(...a))}).`,
      driversTitle: blockId === "levertijd" ? "Te laat, per land" : "Te laat, per leverancier",
      drivers: movers(labels, a, b),
      rows: { title: "De te late pakketten", list: () => lateRows(p.a, keep) },
      link: blockId === "levertijd" && s !== undefined
        ? { label: "Leverancier openen", to: paths.supplier(s.id) }
        : { label: "Naar Leveranciers", to: paths.suppliers }
    }
  }

  if (blockId === "geschillenPerReden") {
    const what = block.kind === "rank" ? block.data.items[k]?.label ?? "" : ""
    const reason = CATS.disputes.indexOf(what)
    const mine = eventsOf(p.a).disputes.filter((d) => d.reason === reason)
    const was = p.b === null ? null : eventsOf(p.b).disputes.filter((d) => d.reason === reason)
    return {
      key,
      title: `Geschillen om ‘${what.toLowerCase()}’`,
      ...head(mine.length, was?.length, "count", "lower", label),
      reading: `${mine.length === 1 ? "1 geschil" : `${n(mine.length)} geschillen`} geopend ${at(ctx.label)}, samen ${
        euro(mine.reduce((t, d) => t + d.amount, 0))
      }.`,
      driversTitle: "",
      drivers: [],
      rows: { title: "De betwiste bestellingen", list: () => disputeRows(p.a, (r) => r === reason) },
      link: { label: "Naar Chargebacks", to: paths.chargebacks }
    }
  }

  if (blockId === "ticketsPerDag") {
    const all = A.ticketsByWeekday[k] ?? 0
    return {
      key,
      title: `Tickets op ${DAYS[k]}`,
      ...head(all, cmp?.ticketsByWeekday[k], "count", "lower", label),
      reading: `${n(all)} van de ${n(A.tickets)} tickets ${at(ctx.label)} (${pct(all, A.tickets)}%) kwamen op ${
        DAYS[k]
      } binnen.${
        k === 0 ? " Maandag vangt wat in het weekend bleef liggen: vragen over waar een bestelling blijft voorop." : ""
      }`,
      driversTitle: "",
      drivers: [],
      rows: null,
      link: { label: "Naar Tickets", to: paths.tickets }
    }
  }

  if (blockId === "perWinkel" || blockId === "betaalmethode") {
    const what = block.kind === "rank" || block.kind === "bar" ? block.data.items[k]?.label ?? "" : ""
    const keep = blockId === "perWinkel"
      ? (o: Placed) => o.storeId === (k === 0 ? "store_eu" : "store_us")
      : (o: Placed) => o.payment === what
    const a = blockId === "perWinkel" ? A.byStore[k] ?? 0 : A.byPayment[k] ?? 0
    const b = cmp === null ? undefined : blockId === "perWinkel" ? cmp.byStore[k] : cmp.byPayment[k]
    return {
      key,
      title: blockId === "perWinkel" ? `Bestellingen uit ${what}` : `Betaald met ${what}`,
      ...head(a, b, "count", "higher", label),
      reading: `${n(a)} van de ${n(A.orders)} bestellingen ${at(ctx.label)} (${pct(a, A.orders)}%)${
        b === undefined ? "" : `, tegen ${n(b)} ${at(label)}`
      }.`,
      driversTitle: "",
      drivers: [],
      rows: { title: "De bestellingen die meetellen", list: () => orderRows(p.a, keep) },
      link: { label: "In Bestellingen openen", to: paths.orders }
    }
  }
  return null
}

/** The explanation behind `key` for the period, or `null` when the key does not name one. */
export function explain(ctx: Ctx, key: string): Explanation | null {
  const [kind, blockId, index] = key.split(".")
  const blocks = blocksOf(ctx)
  const block = blocks[blockId as BlockId] as Block | undefined
  const k = Number(index)
  if (block === undefined || !Number.isInteger(k)) return null
  const p: Pair = { ctx, A: agg(ctx.cur), B: ctx.cmp === null ? null : agg(ctx.cmp), a: ctx.cur, b: ctx.cmp }
  if (kind === "f" && block.kind === "figures") {
    const figure = block.figures[k]
    const m = figure === undefined ? undefined : METRIC[figure.label]
    if (figure === undefined || m === undefined) return null
    return metric(p, m, key, figure.label, {
      value: figure.value,
      ...(ctx.cmp === null ? {} : { previous: figure.previous })
    })
  }
  if (kind === "i") return item(p, blockId as BlockId, k, key, block)
  return null
}
