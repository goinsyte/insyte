import type { DeliveryPromise, Prediction, PreparedId, Read, SetupFacts, Watch } from "./FirstAnalysis.ts"

/*
 * The early read's rules (M6.5): fixed, and each one names the fact it stands on. A prediction is said only when its
 * fact is there; nothing is inferred from other stores. Pure, so every rule is tested without a database.
 */

/** What the reading goes through, in order. Mail joins when the inbox does (M15). */
export const READS: ReadonlyArray<Read> = [
  { id: "orders", label: "Bestellingen en verzendingen", done: false },
  { id: "products", label: "Productpagina's en wat ze beloven", done: false },
  { id: "policies", label: "Verzend- en retourbeleid", done: false }
]

/** Above this many days a delivery takes long enough that customers start asking where it is. */
const LONG_DELIVERY_DAYS = 7
/** From this many countries on, delivery times are worth keeping per country. */
const MANY_COUNTRIES = 5
/** What a store needs before mail could show a problem (M15): this many orders over this many days. */
const ENOUGH_ORDERS = 100
const ENOUGH_DAYS = 30

const UNIT = "(werkdagen|werkdag|dagen|dag|business days|working days|days)"
const RANGE = new RegExp(`(\\d{1,2})\\s*(?:-|–|tot|to)\\s*(\\d{1,2})\\s*${UNIT}`, "gi")
const SINGLE = new RegExp(`(\\d{1,2})\\s*${UNIT}`, "gi")
const WORKING = /werk|business|working/i

/** Text without its markup. */
const plain = (html: string) => html.replaceAll(/<[^>]*>/g, " ").replaceAll(/&nbsp;/g, " ")

/**
 * The delivery times a text promises ("7 tot 12 werkdagen", "3-5 days"), in days. A plain number counts only where
 * no range was found, so "binnen 30 dagen retourneren" in a refund text is never read as a delivery time: only
 * product pages and the shipping policy are read.
 */
export const promisesIn = (html: string, source: DeliveryPromise["source"]): Array<DeliveryPromise> => {
  const text = plain(html)
  const ranges = [...text.matchAll(RANGE)].map((m) => ({
    min: Number(m[1]),
    max: Number(m[2]),
    working: WORKING.test(m[3]!),
    source
  }))
  if (ranges.length > 0) return ranges.filter((r) => r.min > 0 && r.max >= r.min && r.max <= 60)
  return [...text.matchAll(SINGLE)]
    .map((m) => ({ min: Number(m[1]), max: Number(m[1]), working: WORKING.test(m[2]!), source }))
    .filter((r) => r.max > 0 && r.max <= 60)
}

/** The longest delivery the store promises anywhere, or nothing. */
export const longestPromise = (facts: SetupFacts): DeliveryPromise | undefined =>
  facts.promises.reduce<DeliveryPromise | undefined>((a, p) => (a === undefined || p.max > a.max ? p : a), undefined)

const days = (p: DeliveryPromise) => (p.working ? "werkdagen" : "dagen")

const promised = (p: DeliveryPromise) =>
  p.min === p.max ? `${p.max} ${days(p)} levertijd` : `${p.min} tot ${p.max} ${days(p)} levertijd`

const DAMAGE = /beschadig|kapot|defect|stuk |schade|damaged|broken|defective/i

/** What the setup predicts, most telling first, at most three. */
export const predictionsOf = (facts: SetupFacts): Array<Prediction> => {
  const out: Array<Prediction> = []
  const longest = longestPromise(facts)
  if (longest !== undefined && longest.max > LONG_DELIVERY_DAYS) {
    out.push({
      read: promised(longest),
      expect:
        "Bij levertijden boven een week worden vragen over de status meestal de grootste stroom mail. Een update voordat de klant gaat vragen staat klaar.",
      prepares: "automation"
    })
  }
  if (facts.gateways.some((g) => /klarna/i.test(g))) {
    out.push({
      read: "Klarna als betaalmethode",
      expect:
        "Een Klarna-geschil heeft een vaste reactietermijn. Insyte zet bewijs per bestelling klaar zodra er een binnenkomt, zodat je die termijn haalt."
    })
  }
  if (facts.policies !== null) {
    if (facts.policies.refund === null || plain(facts.policies.refund).trim() === "") {
      out.push({
        read: "Geen retourbeleid ingesteld",
        expect: "Bij de eerste retourvraag is er geen regel om op terug te vallen. Insyte vraagt je dan om er een."
      })
    } else if (!DAMAGE.test(plain(facts.policies.refund))) {
      out.push({
        read: "Retourbeleid zonder regel voor beschadigde artikelen",
        expect: "Een klacht over schade valt nu tussen wal en schip. Insyte vraagt je bij de eerste om een regel."
      })
    }
  }
  if (facts.shipsTo !== null && facts.shipsTo.length >= MANY_COUNTRIES) {
    out.push({
      read: `Verzending naar ${facts.shipsTo.length} landen`,
      expect:
        "Levertijden verschillen per land. Insyte houdt per land bij hoe lang een zending werkelijk duurt, naast wat je belooft."
    })
  }
  return out.slice(0, 3)
}

/** What Insyte waits for before it judges, with the store's own counts. Mail's watches join with the inbox (M15). */
export const watchOf = (facts: SetupFacts): Array<Watch> => [
  { label: "Levertijd per land", reveals: "dan zie je waar je belofte niet klopt", have: facts.delivered, need: 30 },
  {
    label: "Retourredenen",
    reveals: "dan zie je welk product terugkomt en waarom",
    have: facts.refundReasons,
    need: 10
  }
]

/** Whether the history would be enough to judge once mail is read: it decides why the step says there is no finding. */
export const historyOf = (facts: Pick<SetupFacts, "orders" | "days">): "young" | "enough" =>
  facts.orders >= ENOUGH_ORDERS && facts.days >= ENOUGH_DAYS ? "enough" : "young"

/** The prepared items in this store's words: the update goes out two days before the shortest promise ends. */
export const titlesOf = (facts: SetupFacts): Record<PreparedId, { title: string; does: string }> => {
  const longest = longestPromise(facts)
  const day = longest === undefined ? 5 : Math.min(10, Math.max(2, longest.min - 2))
  return {
    automation: {
      title: `Levertijd-update op dag ${day}`,
      does: `Op dag ${day} de trackinglink en de verwachte datum naar de klant.`
    },
    agent: {
      title: "Antwoorden op statusvragen",
      does: "Schrijft het antwoord met de actuele status, jij keurt het goed."
    },
    sheet: {
      title: "Levertijd per land",
      does: "Wat je belooft naast wat het werkelijk duurt, per land."
    }
  }
}
