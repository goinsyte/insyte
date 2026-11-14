import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type {
  AnalyticsCharts,
  AnalyticsFindings,
  AnalyticsOverview,
  AnalyticsPeriods,
  Driver,
  ExplainRef,
  Explanation,
  Figure,
  Finding,
  RecordRow,
  Span
} from "@insyte/modules/analytics/domain/Analytics"
import type {
  AnalyticsSource,
  ChartsView,
  DrawerView,
  DriverView,
  FigureView,
  FindingView,
  PeriodLabels,
  RecordView
} from "@insyte/ui/app/analytics/analytics-source"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { analyticsReads, chartsAtom, explainAtom, findingsAtom, pairKey, refKey } from "../data/analytics.ts"
import { usePrefSection } from "../frame/prefs.ts"

/*
 * Analyse's source in the console (M14 step 2): `Analytics.*` as the design's page. The server keeps the numbers and no
 * words, so the sentences are written here, a template per finding kind, with every amount in the workspace's currency.
 * The two months are the member's `analytics` preference. Ask has no model yet and says so.
 */

/* ── Words ──────────────────────────────────────────────────────────────────────────────────── */

const MONTH = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december"
] as const
const ABBR = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const
const WEEKDAY = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"] as const

const TOPIC: Record<string, string> = {
  where_is_my_order: "Waar is mijn bestelling",
  returns: "Retouren",
  sizing: "Maatvoering",
  payment: "Betaling",
  product_question: "Productvraag"
}

const CHANNEL: Record<string, string> = {
  web: "de webshop",
  pos: "de kassa",
  shopify_draft_order: "conceptbestellingen",
  iphone: "de Shopify-app",
  android: "de Shopify-app"
}

/** The questions the field offers; Ask cannot answer them yet. */
const SUGGESTED = [
  "Waarom veranderde de omzet?",
  "Welke leverancier is het vaakst te laat?",
  "Waarom zijn er meer terugbetalingen?",
  "Welk kanaal groeide het meest?",
  "Wanneer zijn tickets het traagst?"
] as const

/** A dispute's normalised reason, as the design names it. */
const DISPUTE_REASON: Record<string, string> = {
  item_not_received: "Niet ontvangen",
  not_as_described: "Niet zoals beschreven",
  unauthorized: "Niet geautoriseerd",
  duplicate: "Dubbele afschrijving",
  other: "Overig"
}
const disputeReason = (reason: string | null) => DISPUTE_REASON[reason ?? ""] ?? reason ?? "Overig"

const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["nl"], { type: "region" }) : undefined
const countryName = (
  code: string | null
) => (code === null || code === "" ? "Onbekend land" : regions?.of(code) ?? code)
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
const monthIndex = (m: string) => Number(m.slice(5, 7)) - 1
const nameOf = (m: string) => MONTH[monthIndex(m)] ?? m
const abbrOf = (m: string) => ABBR[monthIndex(m)] ?? m
const reasonName = (reason: string | null) => (reason === null || reason === "" ? "geen reden" : reason)
/** "wegens “Beschadigd”", or "zonder opgegeven reden". */
const because = (
  reason: string | null
) => (reason === null || reason === "" ? "zonder opgegeven reden" : `wegens “${reason}”`)
const channelName = (channel: string | null) =>
  channel === null || channel === "" ? "bestellingen zonder kanaal" : CHANNEL[channel] ?? channel

const num = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })
const dec1 = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const int = (n: number) => n.toLocaleString("nl-NL")
const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100)
const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "")
const major = (minor: number) => minor / 100
const asNumber = (v: unknown) => (typeof v === "number" ? v : 0)
const asString = (v: unknown) => (typeof v === "string" ? v : null)

/** "1–12 november" and "1–12 nov" while A runs; "oktober 2026" and "oktober" for a whole month. */
const labelsOf = (s: Span): PeriodLabels => {
  const name = nameOf(s.month)
  const days = s.days === 1 ? "1" : `1–${s.days}`
  return s.full ?
    { label: `${name} ${s.month.slice(0, 4)}`, short: name, abbr: abbrOf(s.month) } :
    { label: `${days} ${name}`, short: `${days} ${abbrOf(s.month)}`, abbr: abbrOf(s.month) }
}

const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${abbrOf(d.slice(0, 7))}`
const longDay = (d: string) => `${Number(d.slice(8, 10))} ${nameOf(d.slice(0, 7))} ${d.slice(0, 4)}`

/** Money in whole units of `currency`, the way the plate and the drawer print it. */
const moneyIn = (currency: string) => {
  const whole = new Intl.NumberFormat("nl-NL", { style: "currency", currency, maximumFractionDigits: 0 })
  const exact = new Intl.NumberFormat("nl-NL", { style: "currency", currency })
  const symbol = whole.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency
  return {
    money: (n: number) => whole.format(n),
    /** An order's total, in its own currency, to the cent. */
    exact,
    kilo: (n: number) => {
      // A small store's axis in whole amounts: "€150", not "€0,2k".
      if (Math.abs(n) < 1000) return `${symbol}${Math.round(n)}`
      const k = n / 1000
      return `${symbol}${Number.isInteger(k) ? k : dec1(k)}k`
    }
  }
}

/* ── The two months ─────────────────────────────────────────────────────────────────────────── */

export interface Pair {
  readonly a: string
  readonly b: string
}

/** The member's saved months where the pickers still offer them; else this month against the one before. */
export const pairFor = (frame: Frame, periods: AnalyticsPeriods): Pair => {
  const ids = periods.months.map((m) => m.month)
  const saved = frame.prefs.sections.analytics?.value as { a?: unknown; b?: unknown } | undefined
  const a = typeof saved?.a === "string" && ids.includes(saved.a) ? saved.a : periods.current
  const before = ids[ids.indexOf(periods.current) - 1] ?? periods.current
  const b = typeof saved?.b === "string" && ids.includes(saved.b) ? saved.b : before
  return { a, b }
}

/** The pair the page reads, kept in the member's `analytics` preference. */
export function useAnalyticsPair(frame: Frame, periods: AnalyticsPeriods) {
  const fallback = pairFor(frame, periods)
  const [saved, save] = usePrefSection<Pair>(frame, "analytics", fallback)
  const ids = new Set(periods.months.map((m) => m.month))
  const kept = saved as Partial<Pair> | null
  const pair = kept?.a !== undefined && kept.b !== undefined && ids.has(kept.a) && ids.has(kept.b) ?
    { a: kept.a, b: kept.b } :
    fallback
  return [pair, save] as const
}

/* ── The figures ────────────────────────────────────────────────────────────────────────────── */

const LABEL: Record<Figure["id"], string> = {
  revenue: "Omzet",
  paid_orders: "Betaalde bestellingen",
  on_time: "Op tijd",
  refund_rate: "Terugbetaald",
  disputes: "Geschillen",
  resolve_hours: "Uren tot opgelost"
}

/** Which finding a figure opens; the paid orders open their own breakdown. */
const OPENS: Partial<Record<Figure["id"], Finding["kind"]>> = {
  revenue: "revenue",
  on_time: "delivery",
  refund_rate: "refunds",
  disputes: "disputes",
  resolve_hours: "support"
}

function figureOf(f: Figure, money: (n: number) => string, open: (() => void) | undefined): FigureView {
  const label = LABEL[f.id]
  const base = { id: f.id, label, goodWhenUp: f.id === "revenue" || f.id === "paid_orders" || f.id === "on_time" }
  if (!f.available) {
    return { ...base, value: "—", before: "—", delta: 0, unit: "", available: false }
  }
  const show = (v: number) =>
    f.id === "revenue" ?
      money(major(v)) :
      f.id === "paid_orders" || f.id === "disputes" ?
      int(v) :
      f.id === "resolve_hours" ?
      `${num(v)} u` :
      `${num(round1(v))}%`
  const value = f.a === null ? "—" : show(f.a)
  const before = f.b === null ? "—" : show(f.b)
  if (f.a === null || f.b === null) {
    return {
      ...base,
      value,
      before,
      delta: 0,
      unit: "",
      available: false,
      note: f.a === null ? "Nog niets in deze periode" : "Niets om mee te vergelijken",
      open
    }
  }
  // Disputes compare as a count, as the design shows them: "+2", never a percentage.
  if (f.id === "disputes") {
    return { ...base, value, before, delta: f.a - f.b, unit: "", digits: 0, available: true, open }
  }
  const points = f.id === "on_time" || f.id === "refund_rate"
  if (!points && f.b === 0 && f.a !== 0) {
    return { ...base, value, before, delta: 0, unit: "", available: false, note: "Niets om mee te vergelijken", open }
  }
  return {
    ...base,
    value,
    before,
    delta: points ? round1(f.a - f.b) : pct(f.a, f.b),
    unit: points ? " pp" : "%",
    available: true,
    open
  }
}

/* ── The findings, written ──────────────────────────────────────────────────────────────────── */

const METRIC: Record<Finding["kind"], string> = {
  revenue: "Omzet",
  delivery: "Op tijd geleverd",
  refunds: "Terugbetalingen",
  disputes: "Geschillen",
  support: "Klantenservice",
  growth: "Groei"
}

interface Written {
  headline: string
  figure: string
  explain: string
  drivers: Array<DriverView>
  open?: { label: string; to: string } | undefined
}

const moved = (label: string, a: number, b: number, shown: (v: number) => string, detail: string): DriverView => ({
  label,
  value: a - b,
  shown: `${sign(a - b)}${shown(Math.abs(a - b))}`,
  detail
})

/** "product|store" as the line reads: "Hoodie · Noord", or the store alone. */
const productStore = (name: string | null) => {
  const [p = "", s = ""] = (name ?? "|").split("|")
  return p === "" ? (s === "" ? "Onbekend" : s) : s === "" ? p : `${p} · ${s}`
}

function write(f: Finding, A: PeriodLabels, B: PeriodLabels, money: (n: number) => string): Written {
  const x = f.figures
  const m = (k: string) => money(major(asNumber(x[k])))
  switch (f.kind) {
    case "revenue": {
      const change = asNumber(x["change"])
      const up = change >= 0
      const byVolume = Math.abs(asNumber(x["volume"])) >= Math.abs(asNumber(x["size"]))
      const why = byVolume ?
        (asNumber(x["volume"]) >= 0 ? "meer bestellingen" : "minder bestellingen") :
        (asNumber(x["size"]) >= 0 ? "grotere bestellingen" : "kleinere bestellingen")
      const product = asString(x["topProduct"])
      const store = asString(x["topStore"])
      const top = store === null ?
        "" :
        ` De grootste verschuiving zat in ${product ?? "bestellingen zonder product"} bij ${store}: ${
          m("topB")
        } in ${B.short}, ${m("topA")} nu.`
      // Nothing in B: a change in percent would say nothing.
      const fresh = asNumber(x["b"]) === 0
      return {
        headline: fresh ?
          `De omzet kwam op ${m("a")}; in ${B.short} kwam er nog niets binnen.` :
          `De omzet ${up ? "steeg" : "daalde"} ${dec1(Math.abs(change))}% naar ${m("a")}, vooral door ${why}.`,
        figure: fresh ? m("a") : `${sign(change)}${dec1(Math.abs(change))}%`,
        explain: `In ${A.label} kwam ${m("a")} binnen uit ${
          plural(asNumber(x["ordersA"]), "betaalde bestelling", "betaalde bestellingen")
        } van gemiddeld ${m("aovA")}, tegenover ${m("b")} uit ${int(asNumber(x["ordersB"]))} van gemiddeld ${
          m("aovB")
        } in ${B.label}.${top}`,
        drivers: f.drivers.map((d): DriverView => {
          const signedMoney = (v: number) => money(major(v))
          if (d.dim === "volume") {
            const v = asNumber(x["volume"])
            return {
              label: "Aantal bestellingen",
              value: major(v),
              shown: `${sign(v)}${signedMoney(Math.abs(v))}`,
              detail: `${int(d.b)} → ${int(d.a)}`
            }
          }
          if (d.dim === "size") {
            const v = asNumber(x["size"])
            return {
              label: "Bedrag per bestelling",
              value: major(v),
              shown: `${sign(v)}${signedMoney(Math.abs(v))}`,
              detail: `${money(major(d.b))} → ${money(major(d.a))}`
            }
          }
          return moved(
            productStore(d.name),
            major(d.a),
            major(d.b),
            money,
            `${money(major(d.b))} → ${money(major(d.a))}`
          )
        }),
        open: { label: "Bestellingen openen", to: "/orders" }
      }
    }
    case "delivery": {
      const pts = asNumber(x["pts"])
      const onTime = `${num(asNumber(x["onTimeA"]))}%`
      const delivered = asNumber(x["delivered"])
      const late = asNumber(x["late"])
      const compared = asNumber(x["deliveredB"]) > 0
      const supplier = asString(x["supplier"])
      const grew = asNumber(x["topA"]) > asNumber(x["topB"])
      const where = `${supplier ?? "bestellingen zonder leverancier"} naar ${countryName(asString(x["country"]))}`
      return {
        headline: `${onTime} kwam op tijd aan${
          compared ?
            `, ${dec1(Math.abs(pts))} pp ${pts >= 0 ? "meer" : "minder"} dan in ${B.short}` :
            `; in ${B.short} werd niets bezorgd`
        }${grew ? `; ${where} liep het meest uit` : ""}.`,
        figure: onTime,
        explain: `In ${A.label} ${delivered === 1 ? "kwam 1 pakket" : `kwamen ${int(delivered)} pakketten`} aan, ${
          late === 0 ? "geen" : int(late)
        } na de beloofde datum: ${onTime} op tijd${
          compared ? `, tegenover ${num(asNumber(x["onTimeB"]))}% in ${B.label}` : ""
        }.${
          grew ?
            ` ${cap(where)}: ${int(asNumber(x["topB"]))} te laat in ${B.short}, ${
              int(asNumber(x["topA"]))
            } nu, gemiddeld ${dec1(asNumber(x["avgLate"]))} dag over de belofte.` :
            ""
        }`,
        drivers: f.drivers.filter((d) => d.a !== 0 || d.b !== 0).map((d) => {
          const [, country = ""] = d.key.split("|")
          return moved(
            `${d.name ?? "Zonder leverancier"} · ${countryName(country)}`,
            d.a,
            d.b,
            int,
            `${int(d.b)} → ${int(d.a)}`
          )
        })
      }
    }
    case "refunds": {
      const a = asNumber(x["a"])
      const b = asNumber(x["b"])
      const product = asString(x["product"])
      return {
        headline: `${a > b ? "Meer" : "Minder"} terugbetalingen ${because(asString(x["reason"]))}: ${
          int(a)
        } tegenover ${int(b)} in ${B.short}${product === null ? "" : `, de meeste bij ${product}`}.`,
        figure: int(a),
        explain: `In ${A.label} ${
          asNumber(x["refundsA"]) === 1 ?
            "werd 1 bestelling" :
            `werden ${int(asNumber(x["refundsA"]))} bestellingen`
        } terugbetaald, ${int(a)} ${because(asString(x["reason"]))} tegenover ${int(b)} in ${B.label}.${
          product === null ?
            "" :
            ` ${int(asNumber(x["productRefunds"]))} daarvan bij ${product}, waarvan er ${
              int(asNumber(x["sold"]))
            } verkocht werden.`
        } Van de bestellingen geplaatst in ${A.short} is ${
          num(round1(asNumber(x["rateA"])))
        }% (deels) terugbetaald, tegenover ${num(round1(asNumber(x["rateB"])))}%.`,
        drivers: f.drivers.map((d) =>
          moved(cap(reasonName(d.key === "" ? null : d.key)), d.a, d.b, int, `${int(d.b)} → ${int(d.a)}`)
        )
      }
    }
    case "disputes": {
      const a = asNumber(x["a"])
      const b = asNumber(x["b"])
      const reason = asString(x["reason"])
      const tied = asNumber(x["notReceived"])
      const late = asNumber(x["arrivedLate"])
      const linked = tied === 0 ?
        "" :
        ` ${
          late === tied ?
            (tied === 1 ? "Het enige geval" : tied === 2 ? "Beide gevallen" : `Alle ${int(tied)} gevallen`) :
            `${int(late)} van de ${int(tied)} gevallen`
        } van “${disputeReason("item_not_received")}” ${
          tied === 1 ? "was een pakket dat" : "waren pakketten die"
        } meer dan twee dagen te laat ${tied === 1 ? "aankwam" : "aankwamen"}${
          late * 2 > a ? ", dus de meeste geschillen volgen uit het leveringsprobleem en niet uit fraude" : ""
        }.`
      return {
        headline: `${plural(a, "geschil", "geschillen")} geopend, ${
          a > b ? "meer dan" : a < b ? "minder dan" : "evenveel als"
        } de ${int(b)} in ${B.short}${reason === null ? "" : `; “${disputeReason(reason)}” veranderde het meest`}.`,
        figure: `${sign(a - b)}${int(Math.abs(a - b))}`,
        explain: `Er staat ${m("amountA")} onder geschil uit ${A.label}.${linked}`,
        drivers: f.drivers.map((d) => moved(disputeReason(d.key), d.a, d.b, int, `${int(d.b)} → ${int(d.a)}`)),
        open: { label: "Geschillen openen", to: "/chargebacks" }
      }
    }
    case "support": {
      const weekend = asNumber(x["weekend"])
      const weekendTickets = asNumber(x["weekendTickets"])
      return {
        headline: weekendTickets === 0 ?
          `Tickets werden gemiddeld na ${num(asNumber(x["resolveA"]))} u opgelost, tegenover ${
            num(asNumber(x["resolveB"]))
          } u in ${B.short}.` :
          `Tickets uit het weekend wachten ${num(weekend)} u tot ze opgelost zijn, tegenover ${
            num(asNumber(x["weekday"]))
          } u door de week.`,
        figure: `${num(asNumber(x["resolveA"]))} u`,
        explain: `In ${A.label} kwamen ${plural(asNumber(x["tickets"]), "ticket", "tickets")} binnen, ${
          int(weekendTickets)
        } in het weekend. Gemiddeld duurde het ${
          num(asNumber(x["resolveA"]))
        } u tot een ticket opgelost was, tegenover ${num(asNumber(x["resolveB"]))} u in ${B.label}.`,
        drivers: f.drivers.map((d) => ({
          label: cap(WEEKDAY[Number(d.key)] ?? d.key),
          value: round1(d.a - d.b),
          shown: `${sign(d.a - d.b)}${dec1(Math.abs(d.a - d.b))} u`,
          detail: `${num(d.a)} u · ${plural(d.n ?? 0, "ticket", "tickets")}`
        })),
        open: { label: "Tickets openen", to: "/tickets" }
      }
    }
    case "growth": {
      const channel = channelName(asString(x["channel"]))
      const store = asString(x["store"])
      const gain = asNumber(x["a"]) - asNumber(x["b"])
      return {
        headline: `${cap(channel)} bracht ${money(major(gain))} meer op dan in ${B.short}${
          store === null ? "" : `; ${store} groeide het snelst`
        }.`,
        figure: `+${money(major(gain))}`,
        explain: `Via ${channel} kwam in ${A.label} ${m("a")} binnen, tegenover ${m("b")} in ${B.label}.${
          store === null ? "" : ` ${store} ging van ${m("storeB")} naar ${m("storeA")}.`
        }`,
        drivers: f.drivers.map((d) =>
          moved(
            cap(channelName(d.key === "" ? null : d.key)),
            major(d.a),
            major(d.b),
            money,
            `${money(major(d.b))} → ${money(major(d.a))}`
          )
        ),
        open: { label: "Bestellingen openen", to: "/orders" }
      }
    }
  }
}

/* ── Explanations, written ──────────────────────────────────────────────────────────────────── */

const storeName = (d: Driver) => d.name ?? "Onbekende winkel"

/** An explanation's figure, what it is compared with, its sentence and what moved it. */
interface Read {
  value: string
  compare: string
  explain: string
  drivers: Array<DriverView>
}

function explained(e: Explanation, money: (n: number) => string): Read {
  const A = labelsOf(e.A)
  const B = labelsOf(e.B)
  const key = e.ref.key
  switch (key._tag) {
    case "paid_orders":
      return {
        value: int(e.a),
        compare: `tegenover ${int(e.b)} in ${B.short}`,
        explain: `In ${A.label} ${
          e.a === 1 ? "werd 1 bestelling" : `werden ${int(e.a)} bestellingen`
        } betaald en gehouden${e.of === null || e.a === 0 ? "" : `, gemiddeld ${money(major(e.of))}`}, tegenover ${
          int(e.b)
        } in ${B.label}.`,
        drivers: e.drivers.map((d) => moved(storeName(d), d.a, d.b, int, `${int(d.b)} → ${int(d.a)}`))
      }
    case "day": {
      const change = pct(e.a, e.b)
      const n = e.of ?? 0
      return {
        value: money(major(e.a)),
        compare: `tegenover ${money(major(e.b))} op ${key.day} ${B.abbr}`,
        explain: `${
          plural(n, "betaalde bestelling bracht", "betaalde bestellingen brachten")
        } op ${key.day} ${A.abbr} ${money(major(e.a))} op${
          e.b === 0 ?
            "." :
            `, ${dec1(Math.abs(change))}% ${change >= 0 ? "meer" : "minder"} dan op dezelfde dag in ${B.label}.`
        }`,
        drivers: e.drivers.map((d) =>
          moved(storeName(d), major(d.a), major(d.b), money, `${money(major(d.b))} → ${money(major(d.a))}`)
        )
      }
    }
    case "supplier_late": {
      const of = e.of ?? 0
      const name = e.name ?? "bestellingen zonder leverancier"
      return {
        value: `${num(of === 0 ? 0 : round1((e.a / of) * 100))}%`,
        compare: `van ${int(of)} bezorgd in ${A.label}`,
        explain: `${int(e.a)} van de ${int(of)} pakketten van ${name} kwamen na de beloofde datum aan.`,
        drivers: e.drivers.map((d) => ({ label: countryName(d.key), value: d.a, shown: `+${int(d.a)}` }))
      }
    }
    case "refund_reason": {
      return {
        value: int(e.a),
        compare: `tegenover ${int(e.b)} in ${B.short}`,
        explain: `In ${A.label} ${e.a === 1 ? "werd 1 bestelling" : `werden ${int(e.a)} bestellingen`} terugbetaald ${
          because(key.reason)
        }, tegenover ${int(e.b)} in ${B.label}.`,
        drivers: e.drivers.map((d) => moved(d.name ?? "Zonder product", d.a, d.b, int, `${int(d.b)} → ${int(d.a)}`))
      }
    }
    case "disputes":
    case "dispute_reason": {
      const one = key._tag === "dispute_reason"
      return {
        value: int(e.a),
        compare: `tegenover ${int(e.b)} in ${B.short}`,
        explain: `In ${A.label} ${e.a === 1 ? "is 1 geschil" : `zijn ${int(e.a)} geschillen`} geopend${
          one ? ` wegens “${disputeReason(key.reason)}”` : ""
        }, samen ${money(major(e.of ?? 0))}.`,
        drivers: e.drivers.map((d) =>
          moved(
            one ? (d.key === "" ? "Zonder winkel" : storeName(d)) : disputeReason(d.key),
            d.a,
            d.b,
            int,
            `${int(d.b)} → ${int(d.a)}`
          )
        )
      }
    }
    case "weekday": {
      const n = e.drivers.reduce((s, d) => s + d.a, 0)
      return {
        value: `${num(e.a)} u`,
        compare: `tot opgelost, tegenover ${num(e.of ?? 0)} u over de hele week`,
        explain: `In ${A.label} ${n === 1 ? "kwam 1 ticket" : `kwamen ${int(n)} tickets`} op ${
          WEEKDAY[key.weekday]
        } binnen, gemiddeld na ${num(e.a)} u opgelost.`,
        drivers: e.drivers.map((d) => ({
          label: d.key === "" ? "Zonder onderwerp" : TOPIC[d.key] ?? d.key,
          value: d.a,
          shown: int(d.a)
        }))
      }
    }
    default:
      return { value: "", compare: "", explain: "", drivers: [] }
  }
}

/* ── The rows ───────────────────────────────────────────────────────────────────────────────── */

function recordOf(r: RecordRow): RecordView {
  const total = new Intl.NumberFormat("nl-NL", { style: "currency", currency: r.currency }).format(major(r.totalMinor))
  const late = r.daysLate ?? 1
  const [outcome, tone] = r.outcome === "refunded" ?
    [r.refundReason === null ? "Terugbetaald" : `Terugbetaald · ${r.refundReason}`, "red" as const] :
    r.outcome === "cancelled" ?
    ["Geannuleerd", "muted" as const] :
    r.outcome === "unfulfilled" ?
    ["Nog niet verzonden", "plain" as const] :
    r.outcome === "on_the_way" ?
    ["Onderweg", "plain" as const] :
    r.outcome === "late" ?
    [`${late} ${late === 1 ? "dag" : "dagen"} te laat`, "amber" as const] :
    ["Op tijd", "plain" as const]
  return {
    id: r.orderId,
    number: r.number,
    day: dayLabel(r.placedDay),
    item: r.title === null ? "—" : `${r.qty > 1 ? `${r.qty} × ` : ""}${r.title}`,
    country: countryName(r.country),
    store: r.storeName,
    outcome,
    tone,
    total
  }
}

/* ── The source ─────────────────────────────────────────────────────────────────────────────── */

/** What the drawer holds: a finding, written when it opened, or a figure or mark read from `Analytics.explain`. */
type Opened =
  | {
    readonly kind: "finding"
    readonly key: string
    readonly title: string
    readonly written: Written
    readonly rows: ExplainRef | null
    readonly total: number
  }
  | {
    readonly kind: "explain"
    readonly key: string
    readonly title: string
    readonly ref: ExplainRef
    readonly open?: { label: string; to: string } | undefined
  }

interface Paged {
  readonly key: string
  readonly rows: ReadonlyArray<RecordRow>
  readonly next: string | null
  readonly loading: boolean
  readonly failed: boolean
}

type ExplainRead = ReturnType<typeof explainAtom> extends Atom.Atom<infer R> ? R : never
/** Read while no figure is open, so the drawer's hook always has an atom. */
const idle: Atom.Atom<ExplainRead> = Atom.make<ExplainRead>(AsyncResult.initial())

const success = <A>(r: AsyncResult.AsyncResult<A, unknown>): A | undefined =>
  AsyncResult.isSuccess(r) ? r.value : Option.getOrUndefined(AsyncResult.value(r))

export function useConsoleAnalyticsSource(input: {
  readonly periods: AnalyticsPeriods
  readonly pair: Pair
  readonly setPair: (pair: Pair) => void
  readonly overview: AnalyticsOverview
}): AnalyticsSource {
  const { periods, pair, setPair, overview } = input
  const key = pairKey(pair)
  const { money, kilo } = useMemo(() => moneyIn(overview.currency), [overview.currency])
  const A = useMemo(() => labelsOf(overview.A), [overview.A])
  const B = useMemo(() => labelsOf(overview.B), [overview.B])
  const charts: AnalyticsCharts | undefined = success(useAtomValue(chartsAtom(key)))
  const found: AnalyticsFindings | undefined = success(useAtomValue(findingsAtom(key)))

  const [opened, setOpened] = useState<Opened | null>(null)
  const explainKey = opened?.kind === "explain" ? refKey(opened.ref) : null
  const explainResult = useAtomValue(explainKey === null ? idle : explainAtom(explainKey))
  const retryExplain = useAtomRefresh(explainKey === null ? idle : explainAtom(explainKey))
  const explanation = AsyncResult.isSuccess(explainResult) ? explainResult.value : undefined

  // The drawer's orders: the first page once it opens, the next ones on request.
  const readRecords = useAtomSet(analyticsReads.records, { mode: "promiseExit" })
  const rowsRef = opened === null ? null : opened.kind === "finding" ? opened.rows : opened.ref
  const rowsKey = rowsRef === null ? null : refKey(rowsRef)
  const [paged, setPaged] = useState<Paged | null>(null)
  const load = (ref: ExplainRef, cursor: string | null, before: ReadonlyArray<RecordRow>) => {
    const k = refKey(ref)
    setPaged({ key: k, rows: before, next: cursor, loading: true, failed: false })
    void readRecords({ payload: { explainKey: ref, ...(cursor === null ? {} : { cursor }) } }).then((exit) =>
      setPaged((p) =>
        p?.key !== k ?
          p :
          Exit.isSuccess(exit) ?
          { key: k, rows: [...before, ...exit.value.rows], next: exit.value.next, loading: false, failed: false } :
          { ...p, loading: false, failed: true }
      )
    )
  }
  useEffect(() => {
    if (rowsRef !== null) load(rowsRef, null, [])
    else setPaged(null)
  }, [rowsKey])

  const openExplain = (ref: Omit<ExplainRef, "a" | "b">, title: string, open?: { label: string; to: string }) =>
    setOpened({ kind: "explain", key: refKey({ ...pair, ...ref }), title, ref: { ...pair, ...ref }, open })

  const openFinding = (f: Finding) => {
    const written = write(f, A, B, money)
    setOpened({
      kind: "finding",
      key: `${key}:${f.kind}`,
      title: METRIC[f.kind],
      written,
      rows: f.records === null ? null : { ...pair, key: f.records },
      total: f.recordCount
    })
  }

  const findings = useMemo(
    () =>
      found?.findings.map((f): FindingView => ({
        id: f.kind,
        metric: METRIC[f.kind],
        tone: f.tone,
        headline: write(f, A, B, money).headline,
        chart: f.chart,
        lit: f.lit ?? undefined,
        open: () => openFinding(f)
      })) ?? null,
    [found, A, B, money]
  )

  const figures = useMemo(
    () =>
      overview.figures.map((f) => {
        const kind = OPENS[f.id]
        const finding = kind === undefined ? undefined : found?.findings.find((x) => x.kind === kind)
        const open = f.id === "paid_orders" ?
          () =>
            openExplain({ key: { _tag: "paid_orders" } }, "Betaalde bestellingen", {
              label: "Bestellingen openen",
              to: "/orders"
            }) :
          finding === undefined ?
          undefined :
          () => openFinding(finding)
        return figureOf(f, money, open)
      }),
    [overview, found, money, pair]
  )

  const chartsView: ChartsView = useMemo(() =>
    charts === undefined ?
      { daily: null, leadTimes: null, refunds: null, disputes: null, support: null } :
      {
        daily: charts.daily.map((p) => ({
          day: p.day,
          revenue: p.a === null ? null : major(p.a),
          revenuePrev: p.b === null ? null : major(p.b),
          forecast: p.forecast === null ? undefined : major(p.forecast),
          band: p.band === null ? undefined : [major(p.band[0]), major(p.band[1])] as const
        })),
        leadTimes: charts.leadTimes.map((r) => ({
          key: r.supplierId ?? "",
          label: r.name ?? "Zonder leverancier",
          dots: r.dots.map((d) => ({ id: d.orderId, d: d.daysLate })),
          late: r.n === 0 ? 0 : round1((r.late / r.n) * 100)
        })),
        refunds: charts.refundReasons
          .map((r) => ({ key: r.reason ?? "", label: cap(reasonName(r.reason)), a: r.a, b: r.b }))
          .toSorted((x, y) => y.a - x.a),
        disputes: charts.disputeReasons.map((r) => ({
          key: r.reason ?? "",
          label: disputeReason(r.reason),
          a: r.a,
          b: r.b
        })),
        support: charts.supportByWeekday.map((r) => ({
          w: r.weekday,
          label: cap((WEEKDAY[r.weekday] ?? "").slice(0, 2)),
          a: r.a,
          b: r.b
        }))
      }, [charts])

  const drawer = useMemo((): DrawerView | null => {
    if (opened === null) return null
    const mine = paged !== null && paged.key === rowsKey ? paged : null
    const records = rowsKey === null
      ? []
      : mine === null || (mine.loading && mine.rows.length === 0)
      ? null
      : mine.rows.map(recordOf)
    const more = mine === null || mine.next === null || rowsRef === null ?
      undefined :
      { load: () => load(rowsRef, mine.next, mine.rows), loading: mine.loading }
    if (opened.kind === "finding") {
      const w = opened.written
      return {
        key: opened.key,
        title: opened.title,
        value: w.figure,
        compare: `${A.short} tegenover ${B.short}`,
        text: w.explain,
        drivers: w.drivers,
        records,
        total: opened.total,
        more,
        open: w.open
      }
    }
    const failed = AsyncResult.isFailure(explainResult) && !explainResult.waiting
    if (explanation === undefined) {
      return {
        key: opened.key,
        title: opened.title,
        value: "",
        text: null,
        drivers: [],
        records: [],
        total: 0,
        open: opened.open,
        failed: failed ? { retry: retryExplain } : undefined
      }
    }
    const e = explained(explanation, money)
    return {
      key: opened.key,
      title: opened.title,
      value: e.value,
      compare: e.compare,
      text: e.explain,
      drivers: e.drivers,
      records,
      total: explanation.recordCount,
      more,
      open: opened.open
    }
  }, [opened, paged, rowsKey, explanation, explainResult, A, B, money])

  return {
    months: periods.months.map((p) => ({
      id: p.month,
      label: cap(nameOf(p.month)) +
        (p.month.slice(0, 4) === periods.current.slice(0, 4) ? "" : ` ${p.month.slice(0, 4)}`),
      running: p.inProgress && p.toDay !== null ? `tot ${p.toDay} ${abbrOf(p.month)}` : undefined
    })),
    a: pair.a,
    b: pair.b,
    setPeriods: (a, b) => setPair({ a, b }),
    A,
    B,
    empty: overview.basis.orders === 0 ?
      { action: { label: "Winkels bekijken", to: "/settings/stores" } } :
      undefined,
    figures,
    footnote: `Berekend uit ${plural(overview.basis.orders, "bestelling", "bestellingen")}${
      overview.basis.since === null ? "" : ` sinds ${longDay(overview.basis.since)}`
    }, met hun leveringen en terugbetalingen, en ${plural(overview.basis.tickets, "ticket", "tickets")}.${
      overview.unconverted > 0 ? " Bestellingen in een munt zonder wisselkoers tellen nog niet mee in de bedragen." : ""
    }`,
    findings,
    charts: chartsView,
    openDay: (day) =>
      openExplain({ key: { _tag: "day", day } }, `Omzet op ${day} ${A.abbr}`, {
        label: "Bestellingen openen",
        to: "/orders"
      }),
    openSupplier: (supplier) => {
      const row = charts?.leadTimes.find((r) => (r.supplierId ?? "") === supplier)
      openExplain(
        { key: { _tag: "supplier_late", supplierId: supplier === "" ? null : supplier } },
        `${row?.name ?? "Zonder leverancier"}, te late pakketten`
      )
    },
    openRefundReason: (reason) =>
      openExplain(
        { key: { _tag: "refund_reason", reason: reason === "" ? null : reason } },
        `Terugbetalingen ${because(reason === "" ? null : reason)}`
      ),
    openDisputeReason: (reason) =>
      openExplain(
        { key: { _tag: "dispute_reason", reason } },
        `Geschillen wegens “${disputeReason(reason)}”`,
        { label: "Geschillen openen", to: "/chargebacks" }
      ),
    openWeekday: (w) =>
      openExplain({ key: { _tag: "weekday", weekday: w } }, `Tickets op ${WEEKDAY[w] ?? ""}`, {
        label: "Tickets openen",
        to: "/tickets"
      }),
    drawer,
    closeDrawer: () => setOpened(null),
    money,
    kilo,
    ask: {
      suggested: SUGGESTED,
      submit: () =>
        void toast("Vragen over je cijfers is nog niet beschikbaar", { description: "Dit komt er nog aan." })
    }
  }
}
