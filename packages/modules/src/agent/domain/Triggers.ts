import type { AgentActionId } from "@insyte/domain/AgentActions"
import { Schema } from "effect"
import type { Hours, OfflinePlan } from "../../first-analysis/domain/FirstAnalysis.ts"
import type { ShipStatusId } from "../../shared/domain/CustomerFacing.ts"

/*
 * What starts the agent by itself (M15 step 6, ADR-0027 "started by an event"): the outbox sink `agent` hears a mail
 * come in or an order delayed and puts a task on the events queue, so the model never holds the event's transaction;
 * the consumer acts on it as the workspace's own agent, within the autonomy rules. Pure, so the rules are tested
 * without a database.
 */

/** A task on the events queue (`transports/jobs/Queue.ts`): the trigger, by the outbox event that carried it. */
export const AgentTask = Schema.Struct({
  workspaceId: Schema.String,
  /** The outbox event: a second delivery of it, or of this task, is the same trigger and acts once. */
  eventId: Schema.String,
  trigger: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("thread.received"),
      threadId: Schema.String,
      messageId: Schema.String,
      reply: Schema.Boolean
    }),
    Schema.Struct({ kind: Schema.Literal("order.delayed"), orderIds: Schema.Array(Schema.String) }),
    // A shopper's message on the website chat (M15 step 8): the customer agent's (`channel-agent`).
    Schema.Struct({
      kind: Schema.Literal("chat.received"),
      storeId: Schema.String,
      threadId: Schema.String,
      messageId: Schema.String,
      channel: Schema.Literal("webchat")
    })
  ])
})
export type AgentTask = typeof AgentTask.Type

/** How much of a mail the rules read: the question is near the top. */
export const QUESTION_CHARS = 2000

/** Local parts that are a system, never a customer. */
const SYSTEM_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|notificaties?|automated|auto[-_.]?confirm|auto[-_.]?reply|alerts?|newsletter|nieuwsbrief|info[-_.]?no[-_.]?reply)([+.\-_].*)?$/i

/**
 * Domains that only ever mail as a machine: carriers' track-and-trace, the platforms a store runs on and gets paid
 * through, marketplaces and review sites, and the helpdesks another shop answers from (a receipt or an answer from
 * `support@shop.zendesk.com` is a machine's). A subdomain counts (`mail.postnl.nl`).
 */
const SYSTEM_DOMAINS = [
  "postnl.nl",
  "postnl.com",
  "dhl.com",
  "dhl.nl",
  "dhl.de",
  "dhlparcel.nl",
  "dhlecommerce.nl",
  "dpd.nl",
  "dpd.com",
  "dpd.be",
  "gls-group.eu",
  "gls-netherlands.com",
  "ups.com",
  "fedex.com",
  "bpost.be",
  "budbee.com",
  "trunkrs.nl",
  "homerr.com",
  "sendcloud.com",
  "sendcloud.nl",
  "myparcel.nl",
  "aftership.com",
  "parcelpanel.com",
  "shopify.com",
  "shopifyemail.com",
  "shopifymail.com",
  "paypal.com",
  "paypal.nl",
  "klarna.com",
  "stripe.com",
  "mollie.com",
  "adyen.com",
  "google.com",
  "facebookmail.com",
  "meta.com",
  "tiktok.com",
  "amazon.com",
  "amazon.nl",
  "amazon.de",
  "marketplace.amazon.nl",
  "bol.com",
  "aliexpress.com",
  "alibaba.com",
  "trustpilot.com",
  "kiyoh.com",
  "klaviyomail.com",
  "mailchimp.com",
  "mcsv.net",
  "sendgrid.net",
  "amazonses.com",
  "zendesk.com",
  "freshdesk.com",
  "gorgias.com",
  "gorgias.io",
  "helpscout.net",
  "helpscout.com",
  "intercom.io",
  "intercom-mail.com",
  "kustomer.com",
  "kustomerapp.com",
  "reamaze.com",
  "reamaze.io"
]

/**
 * Whether an address is a system's, never a customer's: by its local part (`noreply@`, `mailer-daemon@`, …) or by a
 * domain that only mails as a machine (a carrier, a platform). The agent answers none of them.
 */
export const systemSender = (address: string): boolean => {
  const at = address.lastIndexOf("@")
  if (at <= 0) return true
  const local = address.slice(0, at)
  const domain = address.slice(at + 1).trim().toLowerCase()
  return SYSTEM_LOCAL.test(local) || SYSTEM_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}

/** What the question is about: an order or a parcel, by name or by its number. */
const ORDER_NOUN =
  /\b(bestelling(en)?|pakket(je)?|pakje|zending|order|bestelnummer|ordernummer|levering|package|parcel|shipment)\b|#\s?\d{3,}/

/** Asking for its tracking is asking where it is. */
const TRACKING = /\b(track(ing)?|volg|track ?& ?trace)[ -]?(code|nummer|link)\b|\btrack[ -]?(&|and|en)[ -]?trace\b/

/** That it has not come: with an order's name of its own, or, in a reply, under a subject that names one. */
const NOT_COME = [
  /\b(nog|steeds|nog steeds) (niet|niets|niks)\b/,
  /\bniet (ontvangen|aangekomen|bezorgd|geleverd|binnen)\b/,
  /\b(is|zijn) (er )?(nog )?(steeds )?niet\b/,
  /\b(not|never) (yet )?(arrived|received|delivered)\b/
]

/** Where it is or when it comes: only with an order's name in the same sentence. */
const WHERE_WHEN = [/\bwaar\b/, /\bwanneer\b/, /\bstatus\b/, /\bonderweg\b/, /\bwhere\b/, /\bwhen\b/]

/**
 * What a mail that asks where an order is may not also be about: it is the team's, not a status the agent can tell
 * (something broken, a cancellation, a change to the order, a move or another address, a return or another size, a
 * complaint, money or an invoice, fraud).
 */
const OTHER =
  /wijzig|aanpass|aan te passen|toevoeg|toe te voegen|verander|bijbestel|erbij bestel|ophalen|afhalen|omzetten|uitstel|later (bezorg|lever)|ander(e)? (kleur|product|artikel|variant)|change (my|the) order|modify|add to (my|the) order|pick ?up|kapot|beschadigd|schade|defect|stuk aangekomen|gebroken|annuleer|annuler|geannuleerd|ander adres|nieuw adres|adres (wijzig|aanpass|veranderen)|adreswijziging|verkeerd adres|verhuisd|verhuis|retour|terugsturen|terug sturen|ruilen|omruilen|andere maat|wil (hem|het|ze|deze|die|dit) niet meer|niet meer nodig|klacht|ontevreden|teleurgesteld|advocaat|juridisch|consumentenbond|fraude|oplichting|aangifte|politie|chargeback|geschil|terugbetal|\bgeld\b|factuur|refund|cancel|damaged|broken|wrong address|invoice|money/

/**
 * Whether a mail asks where an order is ("waar is mijn bestelling?") and nothing the team must answer: a sentence that
 * names the order or the parcel and asks where it is, when it comes, or says it has not come; or asks for its tracking.
 * "Waar staat de maattabel?" names no order. A reply is read by its own words: its subject is the thread's, so only
 * a "nog steeds niet ontvangen" may lean on the subject's order, and a "bedankt" under "Re: Waar is mijn pakket" asks
 * nothing.
 */
export const asksWhereOrderIs = (
  mail: { readonly subject: string; readonly text: string; readonly reply: boolean }
) => {
  const subject = mail.subject.toLowerCase()
  const text = `${mail.reply ? "" : `${subject}\n`}${mail.text.slice(0, QUESTION_CHARS).toLowerCase()}`
  if (OTHER.test(text) || OTHER.test(subject) || !plainSubject(subject)) return false
  const aboutAnOrder = mail.reply && ORDER_NOUN.test(subject)
  return text.split(/[.?!\n]+/).some((sentence) =>
    TRACKING.test(sentence) ||
    (ORDER_NOUN.test(sentence) && [...WHERE_WHEN, ...NOT_COME].some((w) => w.test(sentence))) ||
    (aboutAnOrder && NOT_COME.some((w) => w.test(sentence)))
  )
}

/**
 * A subject the team must read: one that names money, an amount, or a link or an address, written plainly or to slip
 * past ("Betaal €4,95 invoerkosten via x.nl"). Whatever it asks, such a mail is the team's.
 */
const plainSubject = (subject: string) =>
  !promisesMoney(subject) && !AMOUNT.test(subject) && !DEFANGED.test(subject) && subject.match(LINK) === null

/**
 * What a reply may never say without a person reading it first (ADR-0027: the agent never refunds, cancels or promises
 * money or goods): money back, money over, credit or vouchers, something free, a charge to pay, a cancellation, a new
 * or second parcel.
 * Across line breaks. On Eerst vragen a draft that says one is flagged for the person who reads it.
 */
const MONEY = new RegExp(
  [
    "terug\\s*(te\\s*)?betal",
    "terug\\s*(te\\s*)?stort",
    "terug\\s*(ge)?boek",
    "(geld|stort\\w*|betaal\\w*|betal\\w*|boek\\w*)\\s+(\\S+\\s+){0,3}terug",
    "\\bstort",
    "over\\s*(te\\s*)?maken|overgemaakt|\\bmaken\\s+(\\S+\\s+){0,4}over\\b",
    "\\bover\\s+(naar|op)\\s+(je|jouw|uw|de)\\s+(bank)?rekening",
    "rekening(nummer)?|\\biban\\b|\\bbedrag",
    "(bij|na)\\s*betal|\\bbetalen\\b|\\bkosten\\b|invoerkosten|douane",
    "restitu",
    "crediteer|crediteren|creditnota|credit",
    "tegoed",
    "waardebon|cadeaubon|cadeaukaart|voucher|kortingscode|coupon",
    "refund|reimburs|compensat",
    "korting",
    "vergoed",
    "gratis|kosteloos|kostenloos|zonder kosten|voor niets|voor niks|free of charge",
    "annuleer|annuler|geannuleerd|cancel",
    "nieuw(e)?\\s+(pakket|bestelling|exemplaar|product|zending)",
    "(tweede|extra|ander|nog een)\\s+(pakket|exemplaar|product|zending)",
    "opnieuw\\s+(ver)?(stur|zend|send)",
    "(ver)?(stuur|stur|zend|send)\\w*\\s+(\\S+\\s+){0,3}opnieuw",
    "(na|her)levering|nalever|herzend|vervangend|vervanging"
  ].join("|"),
  "i"
)

export const promisesMoney = (text: string) => MONEY.test(text)

/** An amount, in figures or in words: "€ 12", "12 euro", "veertig euro", "twintig procent". */
const AMOUNT = /€|\b(euro|eur|cent|procent|percent)\b|%/i

/** Links and addresses written so that a filter misses them: `hxxps://`, `x[.]nl`, `hulp [at] x.nl`, `x dot nl`. */
const DEFANGED =
  /hxxps?|\[\.\]|\(\.\)|\[dot\]|\(dot\)|\{dot\}|\[at\]|\(at\)|\{at\}|\[@\]|\(@\)|\b[\w-]+\s+(dot|punt)\s+[a-z]{2,}\b|\b[\w.+-]+\s+at\s+[\w-]+\.[a-z]{2,}\b/i

/** Whether a text writes a link or an address so that a filter misses it (`DEFANGED`). */
export const defanged = (text: string) => DEFANGED.test(text)

/** Whether a text names an amount, in figures or in words (`AMOUNT`). */
export const namesAmount = (text: string) => AMOUNT.test(text)

/** A link, a `www.`, an e-mail address, or a bare domain (`label.tld`, any two-plus-letter TLD), with its path. */
const LINK =
  /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+|[\w.+-]+@[\w-]+(\.[\w-]+)+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?:\/[^\s<>"')\]]*)?/gi

const bare = (link: string) =>
  link.replace(/[.,;:!?]+$/, "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")

/**
 * Links and addresses a reply states that what it was written from never gave (the order's tracking, the store's own
 * addresses): a shopper's words cannot slip a link or an address into a reply. Defanged ones count, and are never
 * traced.
 */
export const untracedLinks = (output: string, given: string): Array<string> => {
  const known = given.toLowerCase()
  const knownBare = [...given.matchAll(LINK)].map((m) => bare(m[0]))
  return [
    ...new Set([...output.matchAll(LINK)].map((m) => m[0].replace(/[.,;:!?]+$/, "").toLowerCase()))
  ].filter((l) => !known.includes(l) && !knownBare.some((k) => k.startsWith(bare(l))))
}

const MONTHS =
  "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sept?|okt|nov|dec"

/** A date or a time, which a reply may give without it being an amount: "12 november (2026)", "12-11", "14:30". */
const DATE = new RegExp(
  `\\b\\d{1,2}\\s+(${MONTHS})\\b(\\s+\\d{4})?|\\b\\d{1,2}[-/]\\d{1,2}([-/]\\d{2,4})?\\b|\\b\\d{1,2}:\\d{2}\\b`,
  "gi"
)

/** What a reply was written from, as the guard reads it. */
export interface Given {
  /** Everything it may repeat: the store's name and address, the orders' numbers, carriers and tracking. */
  readonly text: string
  /** The money and quantity figures among them: the only bare numbers a reply may state. */
  readonly figures: ReadonlyArray<string>
}

/**
 * Figures a reply states that are no money or quantity it was given. A date or a time is not one, and an order
 * number or a tracking code it was given is repeated, not stated: "#1042" passes, "krijg je 12 euro" does not, even
 * when the order was placed on 12 november.
 */
export const untracedAmounts = (output: string, given: Given): Array<string> => {
  const known = given.text.toLowerCase()
  const figures = new Set(given.figures.map((f) => f.replace(/^0+(?=\d)/, "")))
  const untraced = new Set<string>()
  for (const token of output.replace(DATE, " ").split(/\s+/)) {
    const t = token.replace(/^[("'«]+|[)"'»,;:!?.]+$/g, "").toLowerCase()
    if (!/\d/.test(t)) continue
    // An order number or a code it was given, as it was given.
    if (/\D/.test(t.replace(/[.,]/g, "")) && known.includes(t)) continue
    for (const run of t.match(/\d+/g) ?? []) {
      const n = run.replace(/^0+(?=\d)/, "")
      if (!figures.has(n)) untraced.add(n)
    }
  }
  return [...untraced]
}

export type DraftFlag = "money" | "figure" | "link"

/**
 * What a person must check in a reply before it goes, by the rules a reply without a person may never break:
 * money or goods promised or an amount named (`money`), a figure it was not given (`figure`), a link or an address it
 * was not given, or one written to slip past (`link`). None: nothing to flag.
 */
export const draftFlags = (text: string, given: Given): Array<DraftFlag> => {
  const flags: Array<DraftFlag> = []
  if (promisesMoney(text) || AMOUNT.test(text)) flags.push("money")
  if (untracedAmounts(text, given).length > 0) flags.push("figure")
  if (DEFANGED.test(text) || untracedLinks(text, given.text).length > 0) flags.push("link")
  return flags
}

/* ── the reply on Zelf doen: a fixed text from the order's facts ─────────────────────────────────── */

/** An order of the customer's, as the template reads it. */
export interface WismoOrder {
  readonly number: string
  readonly status: string
  /** Shopify's payment status (`orders.payment_status`): `paid`, `pending`, `partially_refunded`, `refunded`, `voided`. */
  readonly payment: string
  /** Shopify's fulfilment status (`orders.fulfillment_status`): `unfulfilled`, `partial`, `fulfilled`, `returned`. */
  readonly fulfilment: string
  /** How many fulfilments (parcels) the order has, each with its own tracking. */
  readonly parcels: number
  /** The parcel's state, AfterShip's or else Shopify's (`deliveries.status`, `fulfilments.tracking_status`). */
  readonly parcel: string | null
  readonly carrier: string | null
  /** The carrier's page, from the order's own fulfilment; only `https`. */
  readonly trackingUrl: string | null
  /** When the carrier expects it, already in words ("14 november 2026"), if it is still to come. */
  readonly expectedOn: string | null
  readonly deliveredOn: string | null
}

const OPEN = new Set(["placed", "paid", "at_supplier", "shipped"])

/**
 * Which of the customer's orders the mail is about: the one whose number it names, or, naming none, their one open
 * order. A number that is not theirs ("#9999", "bestelling 9999"), two named, or two open: unclear, and the team
 * answers.
 */
export const pickOrder = <O extends { readonly number: string; readonly status: string }>(
  text: string,
  orders: ReadonlyArray<O>
): O | null => {
  const named = orders.filter((o) => {
    const digits = o.number.replace(/\D/g, "")
    return digits !== "" && new RegExp(`(?<!\\d)${digits}(?!\\d)`).test(text)
  })
  if (named.length > 0) return named.length === 1 ? named[0]! : null
  // A number named that is none of theirs: a typo, someone else's order, or a guess. Not their other order.
  if (
    /#\s?\d{3,}|\b(bestel|order)\s*(nummer|nr\.?)\s*(is\s*)?:?\s*\d+|\b(bestelling|order|nummer|nr\.?)\s*(is\s*)?:?\s*\d{3,}/i
      .test(text)
  ) {
    return null
  }
  const open = orders.filter((o) => OPEN.has(o.status))
  return open.length === 1 ? open[0]! : null
}

/** Paid, or still to be: no money has gone back. */
const PAYMENT_AS_PLACED = new Set(["paid", "pending"])

/**
 * The order's state as Verzending names it (Instellingen → Verzending, `SHIP_STATUSES`): not yet sent, sent, on its
 * way, out for delivery, delivered, or looked into. Only an order with one story to tell has one: nothing sent yet,
 * or all of it in the one parcel. A cancelled, refunded or partly refunded order, one sent in part or in several
 * parcels, or one sent back, is not a status to send: the team answers.
 */
export const shipStage = (o: WismoOrder): ShipStatusId | null => {
  if (!PAYMENT_AS_PLACED.has(o.payment)) return null
  if (o.fulfilment === "unfulfilled") {
    return o.parcels === 0 && (o.status === "placed" || o.status === "paid" || o.status === "at_supplier")
      ? "supplier"
      : null
  }
  if (o.fulfilment !== "fulfilled" || o.parcels !== 1) return null
  if (o.status === "delivered") return "delivered"
  if (o.status !== "shipped") return null
  switch (o.parcel) {
    case "delivered":
      return "delivered"
    case "out_for_delivery":
      return "out"
    case "in_transit":
      return "transit"
    case "exception":
      return "exception"
    case "returned":
    case "expired":
      return null
    default:
      return "noinfo"
  }
}

/**
 * The reply the agent sends on its own to "waar is mijn bestelling?", in full: nothing in it is the model's or the
 * shopper's, only the order's facts in the workspace's own Verzending wording, the customer's first name and the
 * store's sign-off (none where the mailbox signs its mail itself).
 */
export const wismoReply = (f: {
  readonly firstName: string
  readonly brand: string
  readonly signed: boolean
  readonly order: WismoOrder
  readonly label: string
}): string => {
  const o = f.order
  const label = f.label.replaceAll("{vervoerder}", o.carrier ?? "de vervoerder")
  const lines = [
    f.firstName === "" ? "Hoi," : `Hoi ${f.firstName},`,
    "",
    `De status van je bestelling ${o.number}: ${label}.`,
    ...(o.carrier === null || o.status === "delivered" ? [] : [`Vervoerder: ${o.carrier}.`]),
    ...(o.trackingUrl === null ? [] : [`Volg je pakket: ${o.trackingUrl}`]),
    ...(o.expectedOn === null ? [] : [`Verwachte bezorging: ${o.expectedOn}.`]),
    ...(o.deliveredOn === null ? [] : [`Bezorgd op ${o.deliveredOn}.`]),
    ...(f.signed ? [] : ["", "Groet,", f.brand])
  ]
  return lines.join("\n")
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Whether `at` falls in the opening hours (Monday first, `HH:MM` in the workspace's time zone). */
export const isOpenAt = (hours: ReadonlyArray<Hours>, timeZone: string, at: Date): boolean => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(at).map((p) => [p.type, p.value])
  )
  const day = hours[DAYS.indexOf(parts["weekday"] ?? "")]
  if (day === undefined || !day.open) return false
  const now = `${parts["hour"]}:${parts["minute"]}`
  return now >= day.from && now < day.to
}

/** The last save on Zelfstandigheid that touched an action: its version, and when (epoch ms). */
export interface LastChange {
  readonly version: number
  readonly at: number
}

/**
 * Whether the offline plan keeps this action for the team right now: the plan gave it Zelf doen for while nobody is
 * online, nobody changed it on Zelfstandigheid since, and the team is online now. "Since" is by the version the plan
 * wrote, or, for a plan that wrote none, by when it was agreed. A level set on Zelfstandigheid after the plan holds at
 * any hour, as does every action the plan does not name.
 */
export const heldForTeam = (
  plan: OfflinePlan | null,
  action: AgentActionId,
  changed: LastChange | null,
  timeZone: string,
  at: Date
): boolean => {
  if (plan === null || plan.levels[action] !== "auto") return false
  if (changed !== null && (plan.version === null ? changed.at > plan.at : changed.version > plan.version)) return false
  return isOpenAt(plan.hours, timeZone, at)
}
