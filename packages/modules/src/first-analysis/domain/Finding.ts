import type { CountryDelivery, DeliveryPromise, Finding, MailFacts, SetupFacts } from "./FirstAnalysis.ts"
import { historyOf, longestPromise, updateDay } from "./Rules.ts"

/*
 * The finding path (M15 step 5; PLAN 45): with enough history and the team's mail in Insyte, the one problem worth
 * fixing first. One detector so far, the one the reference shows: a large share of the mail asks where an order is,
 * while it is still on its way. Every figure is a count Insyte read (the inbox over the window, the store's own
 * parcels), the effect is those figures multiplied out, and nothing is said that a count does not carry. Pure, so
 * every threshold is tested without a database.
 */

/** The window the mail and the parcels are read over: one quarter. */
export const WINDOW_DAYS = 90
/** Below this many conversations the share says too little. */
export const MIN_MAILS = 40
/** From this share of the mail on, status questions are the stream worth fixing first. */
export const MIN_STATUS_SHARE = 0.25
/** Status mails Insyte could tie to an order before it says when they come. */
export const MIN_LINKED = 10
/** Delivered parcels to one country before its delivery time is a figure. */
export const MIN_COUNTRY_PARCELS = 20

const nl = (n: number) => n.toLocaleString("nl-NL")
const pct = (part: number, whole: number) => Math.round((part / whole) * 100)
const oneDecimal = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The share as a Dutch reader says it, never more than it is. */
const shareWords = (share: number) =>
  share >= 0.5
    ? "Meer dan de helft van je klantmail"
    : share > 0.37
    ? "Ruim een derde van je klantmail"
    : share >= 0.3
    ? "Een derde van je klantmail"
    : share > 0.27
    ? "Ruim een kwart van je klantmail"
    : "Een kwart van je klantmail"

/** A count as a round estimate: to 5 below a hundred, to 10 below a thousand, to 50 above. */
const roundish = (n: number) => {
  const step = n < 100 ? 5 : n < 1000 ? 10 : 50
  return Math.max(step, Math.round(n / step) * step)
}

/** Calendar days a promise allows at most: working days stretch over weekends. */
const allowedDays = (p: DeliveryPromise) => (p.working ? (p.max * 7) / 5 : p.max)

const promiseWords = (p: DeliveryPromise) => {
  const span = p.min === p.max ? `${p.max}` : `${p.min} tot ${p.max}`
  const unit = p.working ? " werkdagen" : " dagen"
  return p.source === "product"
    ? `je productpagina's beloven ${span}${unit}`
    : `je verzendbeleid belooft ${span}${unit}`
}

/** The country whose parcels take longest past the promise, with enough parcels to say so. */
export const slowestCountry = (
  countries: ReadonlyArray<CountryDelivery>,
  promise: DeliveryPromise | undefined
): CountryDelivery | undefined => {
  if (promise === undefined) return undefined
  return countries
    .filter((c) => c.delivered >= MIN_COUNTRY_PARCELS && c.days > allowedDays(promise))
    .reduce<CountryDelivery | undefined>((a, c) => (a === undefined || c.days > a.days ? c : a), undefined)
}

/** Whether the mail carries a finding at all: enough of it, mostly status questions, and tied to orders. */
export const findingHolds = (facts: SetupFacts): facts is SetupFacts & { mail: MailFacts } => {
  const mail = facts.mail
  if (mail === undefined || mail === null) return false
  if (historyOf(facts) !== "enough") return false
  return mail.mails >= MIN_MAILS && mail.status / mail.mails >= MIN_STATUS_SHARE && mail.linked >= MIN_LINKED &&
    mail.early > 0
}

/**
 * The finding, or nothing: the store's status mail, where its parcels run past the promise (when a country's do), and
 * how much of that mail comes before the parcel is there, which is what an update on time takes away.
 */
export const findingOf = (facts: SetupFacts, countryName: (code: string) => string): Finding | null => {
  if (!findingHolds(facts)) return null
  const mail = facts.mail
  const promise = longestPromise(facts)
  const slow = slowestCountry(facts.countries ?? [], promise)
  const earlyPct = pct(mail.early, mail.linked)
  const days = mail.dayLow === mail.dayHigh ? `op dag ${mail.dayLow}` : `op dag ${mail.dayLow} tot ${mail.dayHigh}`
  const spared = roundish((mail.status * mail.early) / mail.linked * (WINDOW_DAYS / mail.window))
  const day = updateDay(facts)
  return {
    headline: `${shareWords(mail.status / mail.mails)} is “waar is mijn bestelling?”.`,
    evidence: [
      {
        figure: `${nl(mail.status)} van ${nl(mail.mails)}`,
        says: `mails in ${mail.window} dagen gaan over de status van een bestelling`,
        basis: `Inbox, laatste ${mail.window} dagen`
      },
      ...(slow === undefined || promise === undefined ? [] : [{
        figure: `${oneDecimal(slow.days)} dagen`,
        says: `duurt een bestelling naar ${countryName(slow.country)}, ${promiseWords(promise)}`,
        basis: `${nl(slow.delivered)} bezorgde zendingen naar ${countryName(slow.country)}`
      }]),
      {
        figure: `${earlyPct}%`,
        says: `van die mails komt binnen ${days}, voordat het pakket er is`,
        basis: "Moment van de mail naast de bezorgdatum"
      }
    ],
    fix: {
      title: "Laat de klant niet wachten tot hij gaat vragen.",
      why: `Stuur op dag ${day} zelf de trackinglink en de verwachte datum. Dit is de vaste aanpak bij ${
        promise !== undefined && promise.max > 7 ? "levertijden boven een week" : "veel vragen over de status"
      }: de meeste van deze mails vragen niets anders.`
    },
    effect: {
      figure: `~${nl(spared)} mails minder per kwartaal`,
      basis: `${earlyPct}% van ${nl(mail.status)}, als die klanten de update op tijd krijgen`
    }
  }
}
