import type { AgentActionId } from "@insyte/domain/AgentActions"
import { Schema } from "effect"
import type { Hours, OfflinePlan } from "../../first-analysis/domain/FirstAnalysis.ts"

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
    Schema.Struct({ kind: Schema.Literal("order.delayed"), orderIds: Schema.Array(Schema.String) })
  ])
})
export type AgentTask = typeof AgentTask.Type

/** How much of a mail the rules read: the question is near the top. */
export const QUESTION_CHARS = 2000

/** Local parts that are a system, never a customer. */
const SYSTEM_LOCAL =
  /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|notificaties?|automated|auto-?confirm|auto-?reply|alerts?|newsletter|nieuwsbrief|info-noreply)([+.\-_].*)?$/i

/**
 * Domains that only ever mail as a machine: carriers' track-and-trace, the platforms a store runs on and gets paid
 * through, marketplaces and review sites. A subdomain counts (`mail.postnl.nl`).
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
  "amazonses.com"
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

/** Asking where an order is: where it is, that it has not come, when it comes, its tracking. "bestelling" alone is not. */
const WHERE = [
  /\bwaar (is|blijft|zit|staat)\b/,
  /\b(nog|steeds|nog steeds) (niet|niets|niks) (ontvangen|binnen|aangekomen|bezorgd|geleverd|gekregen)\b/,
  /\bniet (ontvangen|aangekomen|bezorgd|geleverd)\b/,
  /\b(pakket|bestelling|zending|order|levering)\b[^.?!\n]{0,40}\b(is|zijn) (er )?(nog )?(steeds )?niet\b/,
  /\bwanneer (komt|komen|wordt|worden|krijg|ontvang|is|zijn)\b[^.?!\n]{0,40}\b(pakket|bestelling|zending|order|levering|binnen)\b/,
  /\b(track(ing)?|volg|track ?& ?trace)[ -]?(code|nummer|link)\b/,
  /\b(where is|where's) my (order|package|parcel)\b/,
  /\b(not|never) (yet )?(arrived|received|delivered)\b/
]

/**
 * What a mail that asks where an order is may not also be about: it is the team's, not a status the agent can tell
 * (something broken, a cancellation, another address, a return, a complaint).
 */
const OTHER =
  /kapot|beschadigd|schade|defect|stuk aangekomen|gebroken|annuleer|annuler|geannuleerd|ander adres|adres (wijzig|aanpass|veranderen)|adreswijziging|verkeerd adres|retour|terugsturen|terug sturen|ruilen|omruilen|klacht|ontevreden|teleurgesteld|advocaat|juridisch|chargeback|geschil|terugbetal|geld terug|refund|cancel|damaged|broken|wrong address/

/**
 * Whether a mail asks where an order is ("waar is mijn bestelling?") and nothing the team must answer. A reply is read
 * by its own words only: its subject is the thread's, and a "bedankt" under "Re: Waar is mijn pakket" asks nothing.
 */
export const asksWhereOrderIs = (
  mail: { readonly subject: string; readonly text: string; readonly reply: boolean }
) => {
  const text = `${mail.reply ? "" : mail.subject} ${mail.text.slice(0, QUESTION_CHARS)}`.toLowerCase()
  return WHERE.some((w) => w.test(text)) && !OTHER.test(text)
}

/**
 * What a reply that goes without a person may never say (ADR-0027: the agent never refunds, cancels or promises money
 * or goods): money back, credit or vouchers, something free, a cancellation, a new parcel. Across line breaks. A draft
 * that says one waits for the team instead.
 */
const MONEY = new RegExp(
  [
    "terug\\s*(te\\s*)?betal",
    "terug\\s*(te\\s*)?stort",
    "(geld|stort\\w*|betaal\\w*|betal\\w*)\\s+(\\S+\\s+){0,3}terug",
    "restitu",
    "crediteer|crediteren|creditnota|credit",
    "tegoed",
    "waardebon|cadeaubon|cadeaukaart|voucher|kortingscode|coupon",
    "refund|reimburs|compensat",
    "korting",
    "vergoed",
    "gratis|kosteloos|kostenloos|zonder kosten|free of charge",
    "annuleer|annuler|geannuleerd|cancel",
    "nieuw(e)?\\s+(pakket|bestelling|exemplaar|product|zending)",
    "opnieuw\\s+(ver)?(stur|zend|send)",
    "(ver)?(stuur|stur|zend|send)\\w*\\s+(\\S+\\s+){0,3}opnieuw",
    "(na|her)levering|nalever|herzend|vervangend|vervanging"
  ].join("|"),
  "i"
)

export const promisesMoney = (text: string) => MONEY.test(text)

const LINK = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+|[\w.+-]+@[\w-]+(\.[\w-]+)+/gi

/**
 * Links and addresses a reply states that what it was written from never gave (the order's tracking, the store's own
 * addresses): a shopper's words cannot slip a link or an address into a mail the agent sends.
 */
export const untracedLinks = (output: string, given: string): Array<string> => {
  const known = given.toLowerCase()
  return [
    ...new Set(
      [...output.matchAll(LINK)].map((m) => m[0].replace(/[.,;:!?]+$/, "").toLowerCase())
    )
  ].filter((l) => !known.includes(l))
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
