import type { AutonomyLevel } from "@insyte/domain/AgentActions"
import { promisesMoney, untracedLinks } from "../../agent/domain/Triggers.ts"
import { untracedFigures } from "../../ai/domain/Guards.ts"
import type { ChannelMode, CustomerAgentSettingsInput, DayHours, HandoverRules } from "./ChannelAgent.ts"

/*
 * The customer agent's rules (M15 step 8; ADR-0027, domain.md §6.4), pure so they are tested without a database or a
 * model: what the agent may do on a channel now, what a shopper's message is (a person asked for, money, a complaint,
 * an order it may not talk about yet), how a shopper proves an order, and what a reply may say.
 *
 * One rule for replying to customers: Zelfstandigheid's `SendReply` is the master, the channel's mode can only narrow
 * it, and outside the opening hours "Vraag aannemen" hands over. A shopper's words decide nothing but whether a person
 * should answer: the agent never acts on them.
 */

/* ── what the agent does on a channel now ─────────────────────────────────────────────────────────────────── */

const RANK: Record<ChannelMode, number> = { off: 0, drafts: 1, auto: 2 }

/** What `SendReply` allows at most: Zelf doen answers, Eerst vragen drafts, Nooit nothing. */
const ceilingOf = (
  level: AutonomyLevel
): ChannelMode => (level === "auto" ? "auto" : level === "ask" ? "drafts" : "off")

/** The channel's mode narrowed by the master: never more than `SendReply` allows. */
export const narrow = (level: AutonomyLevel, mode: ChannelMode): ChannelMode => {
  const ceiling = ceilingOf(level)
  return RANK[mode] <= RANK[ceiling] ? mode : ceiling
}

/** Every channel's mode as it works: off while the agent is, else narrowed by `SendReply`. */
export const effectiveModes = <C extends Readonly<Record<string, ChannelMode>>>(
  on: boolean,
  channels: C,
  level: AutonomyLevel
): { readonly [K in keyof C]: ChannelMode } =>
  Object.fromEntries(
    Object.entries(channels).map(([k, m]) => [k, on ? narrow(level, m) : "off"])
  ) as { readonly [K in keyof C]: ChannelMode }

export type Hand = "answer" | "draft" | "handover" | "silent"

/**
 * What the agent does with a new message on the website chat now (the design's `move`, on the server): the agent off,
 * or its channel off, is silent: the chat is the team's, as without the agent. The master at Nooit hands it to the team.
 * Outside the hours with "Vraag aannemen" it takes the question and hands over; otherwise it answers (Zelf doen and Zelf
 * antwoorden) or writes a draft for the team (either at less).
 */
export const handFor = (s: {
  readonly on: boolean
  readonly mode: ChannelMode
  readonly level: AutonomyLevel
  readonly open: boolean
  readonly outside: "answer" | "take"
}): { readonly hand: Hand; readonly mode: ChannelMode } => {
  if (!s.on || s.mode === "off") return { hand: "silent", mode: "off" }
  const mode = narrow(s.level, s.mode)
  if (mode === "off") return { hand: "handover", mode }
  if (!s.open && s.outside === "take") return { hand: "handover", mode }
  return { hand: mode === "auto" ? "answer" : "draft", mode }
}

/* ── opening hours, in the workspace's time zone ──────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const DAY_NAMES = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const

/** The weekday (Monday 0) and the time `HH:mm` at `at` in `timeZone`. */
const localOf = (at: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(at).map((p) => [p.type, p.value])
  )
  return { day: WEEKDAYS.indexOf(parts["weekday"] ?? ""), time: `${parts["hour"]}:${parts["minute"]}` }
}

export const isOpen = (hours: ReadonlyArray<DayHours>, timeZone: string, at: Date): boolean => {
  const { day, time } = localOf(at, timeZone)
  const h = hours[day]
  return h !== undefined && h.open && time >= h.from && time < h.to
}

const hhmm = (t: string) => t.replace(/^0/, "")

/** "vandaag vanaf 9:00", "morgen vanaf 9:00", "maandag vanaf 9:00", "nu": when a person is next there. */
export const nextOpenLabel = (hours: ReadonlyArray<DayHours>, timeZone: string, at: Date): string => {
  const { day, time } = localOf(at, timeZone)
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7
    const h = hours[d]
    if (h === undefined || !h.open) continue
    if (i === 0) {
      if (time < h.from) return `vandaag vanaf ${hhmm(h.from)}`
      if (time < h.to) return "nu"
      continue
    }
    return `${i === 1 ? "morgen" : DAY_NAMES[d]} vanaf ${hhmm(h.from)}`
  }
  return "zodra er iemand is"
}

/** The handover sentence with `{wanneer}` filled in. */
export const handoverText = (
  s: Pick<CustomerAgentSettingsInput, "handoverMessage" | "hours">,
  timeZone: string,
  at: Date
) => {
  const when = nextOpenLabel(s.hours, timeZone, at)
  return s.handoverMessage.replaceAll("{wanneer}", when === "nu" ? "vandaag nog" : when)
}

/** The first day whose closing is not after its opening, or none. */
export const badDay = (hours: ReadonlyArray<DayHours>): number | null => {
  const i = hours.findIndex((h) => h.open && h.to <= h.from)
  return i === -1 ? null : i
}

/** The week before anyone saved it: Monday to Friday, 9 to 18. */
export const DEFAULT_HOURS: ReadonlyArray<DayHours> = [
  ...Array.from({ length: 5 }, () => ({ open: true, from: "09:00", to: "18:00" })),
  { open: false, from: "10:00", to: "16:00" },
  { open: false, from: "10:00", to: "16:00" }
]

export const DEFAULT_HANDOVER_MESSAGE =
  "Hier kijkt een collega graag even naar. Je hoort {wanneer} van ons, hier in de chat of per mail."

export const DEFAULT_RULES: HandoverRules = {
  unsure: true,
  asksPerson: true,
  topics: ["klachten", "chargebacks", "juridisch"],
  afterMessages: 8
}

/* ── what a shopper's message is ──────────────────────────────────────────────────────────────────────────── */

/** Why a message goes to a person before the agent says anything of its own. */
export type Trigger = "asks_person" | "sensitive" | "money" | "topic"

const ASKS_PERSON =
  /\b(een )?(mens|medewerker|medewerkster|collega|persoon|klantenservice|iemand (anders )?(spreken|bellen)|met iemand|echt(e)? iemand|bel(len)? (me|mij)|telefonisch|human|real person|live agent)\b/i

const SENSITIVE =
  /klacht|klagen|advocaat|jurist|juridisch|rechter|rechtszaak|consumentenbond|geschillencommissie|aangifte|politie|fraude|oplicht|bedrog|bedrieg|chargeback|terugboek|geschil|ontevreden|teleurgesteld|belachelijk|schandalig|waardeloos|woedend|boos|kwaad|schande|\bscam\b|lawyer|complaint|!!/i

const MONEY =
  /geld terug|terug\s*(te\s*)?betal|terugstort|refund|restitu|korting|kortingscode|coupon|voucher|waardebon|cadeaubon|tegoed|gratis|compensatie|compenseer|vergoed|schadevergoeding|annuleer|annuler|cancel|ander(e)? adres|nieuw(e)? adres|adres (wijzig|aanpass|aan te passen|verander)|adreswijziging|verkeerd(e)? adres|wijzig\w* (mijn |de )?bestelling|bestelling (wijzig|aanpass|verander)|omruil|ruilen/i

/** Mostly capitals, at length: shouting. */
const shouting = (text: string) => {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "")
  return letters.length >= 12 && letters.replace(/[^A-ZÀ-Þ]/g, "").length / letters.length > 0.7
}

const stem = (topic: string) => topic.toLowerCase().trim().replace(/(en|s)$/, "")

/** What in the message makes it a person's, in order: a person asked for, a complaint or anger, money, a topic. */
export const triggerOf = (
  text: string,
  rules: HandoverRules
): { readonly trigger: Trigger; readonly topic?: string } | null => {
  const t = text.toLowerCase()
  if (rules.asksPerson && ASKS_PERSON.test(t)) return { trigger: "asks_person" }
  if (SENSITIVE.test(t) || shouting(text)) return { trigger: "sensitive" }
  if (MONEY.test(t)) return { trigger: "money" }
  const topic = rules.topics.find((x) => stem(x).length >= 3 && t.includes(stem(x)))
  return topic === undefined ? null : { trigger: "topic", topic }
}

/** A shopper's own order: "mijn bestelling", "waar blijft", a number, its tracking. A question about delivery times is not. */
const OWN_ORDER =
  /\b(mijn|m'n|onze|ons)\s+(bestelling(en)?|order|pakket(je)?|pakje|zending|levering|aankoop)\b|\bwaar (is|blijft)\b|bestelnummer|ordernummer|\btrack|volgcode|#\s?\d{3,}/i

/** Whether the message is about an order of the shopper's (its status, where it is): the agent needs it proved first. */
export const aboutAnOrder = (text: string) => OWN_ORDER.test(text)

/* ── proving an order ─────────────────────────────────────────────────────────────────────────────────────── */

export interface Claim {
  /** The order number's digits. */
  readonly number: string | null
  readonly email: string | null
  /** A Dutch postcode, `1234AB`. */
  readonly postcode: string | null
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const POSTCODE = /\b([1-9]\d{3})\s?([a-z]{2})\b/gi

/** Two letters after four digits that are a word, not a postcode ("1042 en ..."); SA, SD and SS no postcode has. */
const NOT_POSTCODE = new Set([
  "EN",
  "OF",
  "IS",
  "OP",
  "IN",
  "TE",
  "OM",
  "IK",
  "JE",
  "NU",
  "DE",
  "ER",
  "AL",
  "SA",
  "SD",
  "SS"
])

const postcodeIn = (text: string) =>
  [...text.matchAll(POSTCODE)].find((m) => !NOT_POSTCODE.has(m[2]!.toUpperCase())) ?? null
const MARKED_NUMBER =
  /#\s?(\d{3,10})\b|\b(?:bestel(?:ling)?(?:nummer)?|order(?:nummer)?|nummer|nr\.?)\s*(?:is\s*)?:?\s*#?\s?(\d{3,10})\b/i

/**
 * What a message offers as proof of an order: its number (marked, "#1042" or "bestelling 1042", or a lone number of three
 * to ten digits beside an address or a postcode) and the e-mail address or the postcode on it.
 */
export const claimOf = (text: string): Claim => {
  const email = EMAIL.exec(text)?.[0].toLowerCase() ?? null
  const withoutEmail = text.replace(EMAIL, " ")
  const pc = postcodeIn(withoutEmail)
  const postcode = pc === null ? null : `${pc[1]}${pc[2]!.toUpperCase()}`
  const rest = pc === null ? withoutEmail : withoutEmail.replace(pc[0], " ")
  const marked = MARKED_NUMBER.exec(rest)
  const lone = email !== null || postcode !== null ? /\b(\d{3,10})\b/.exec(rest) : null
  const number = marked?.[1] ?? marked?.[2] ?? lone?.[1] ?? null
  return { number, email, postcode }
}

/** A claim the agent can check: a number and an address or a postcode. */
export const checkable = (c: Claim) => c.number !== null && (c.email !== null || c.postcode !== null)

/** Failed checks on one thread before it goes to a person. */
export const VERIFY_CAP = 3

/** Failed checks in one store within the hour before every check there goes to a person (guessing across chats). */
export const STORE_VERIFY_CAP = 30

/** A proved order as the chat says it: its number and its one plain status, with its carrier, tracking and dates. */
export interface OrderFacts {
  readonly number: string
  /** The status in the workspace's Verzending wording, the carrier filled in. */
  readonly label: string
  readonly carrier: string | null
  readonly trackingUrl: string | null
  readonly expectedOn: string | null
  readonly deliveredOn: string | null
  readonly delivered: boolean
}

/** The fixed reply with a proved order's status: nothing in it is the model's or the shopper's. */
export const orderStatusReply = (o: OrderFacts, formal: boolean): string =>
  [
    `De status van ${formal ? "uw" : "je"} bestelling ${o.number}: ${o.label}.`,
    ...(o.carrier === null || o.delivered ? [] : [`Vervoerder: ${o.carrier}.`]),
    ...(o.trackingUrl === null ? [] : [`${formal ? "Volg uw" : "Volg je"} pakket: ${o.trackingUrl}`]),
    ...(o.expectedOn === null ? [] : [`Verwachte bezorging: ${o.expectedOn}.`]),
    ...(o.deliveredOn === null ? [] : [`Bezorgd op ${o.deliveredOn}.`])
  ].join("\n")

/* ── what a reply may say ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Words that promise money, goods or a change to an order (ADR-0027: the agent never refunds, cancels, changes an
 * address or promises a discount). A reply may only repeat one the facts it was given say themselves (a published
 * return policy that says "je geld terug binnen 14 dagen"); one of its own is never sent.
 */
const PROMISES = [
  "terugbetal",
  "terug te betalen",
  "geld terug",
  "terugstort",
  "refund",
  "restitu",
  "korting",
  "coupon",
  "voucher",
  "waardebon",
  "cadeaubon",
  "tegoed",
  "gratis",
  "compensatie",
  "vergoed",
  "annuleer",
  "annuler",
  "geannuleerd",
  "adres gewijzigd",
  "adres aangepast",
  "ander adres",
  "nieuw adres",
  "opnieuw verstu",
  "opnieuw op",
  "nieuwe bestelling",
  "nalever",
  "vervangend",
  "credit"
]

export type ReplyFault = "figure" | "promise" | "link" | "empty"

/**
 * What is wrong with a reply before it may go: a digit in neither the shopper's own message nor the facts the model was
 * given (an amount, a date, a tracking number it made up), a promise the facts do not make themselves, a link or an
 * address the facts never had, or nothing to say. None: it may go.
 */
export const replyFaults = (text: string, given: { readonly shopper: string; readonly facts: string }) => {
  const faults: Array<ReplyFault> = []
  if (text.trim() === "") return ["empty"] satisfies Array<ReplyFault>
  if (untracedFigures(text, `${given.shopper}\n${given.facts}`).length > 0) faults.push("figure")
  const said = text.toLowerCase()
  const facts = given.facts.toLowerCase()
  if (
    PROMISES.some((p) => said.includes(p) && !facts.includes(p)) || (promisesMoney(text) && !promisesMoney(given.facts))
  ) faults.push("promise")
  if (untracedLinks(text, given.facts).length > 0 || /hxxps?|\[\.\]|\[at\]|\(at\)/i.test(text)) faults.push("link")
  return faults
}

/* ── the agent's fixed words ──────────────────────────────────────────────────────────────────────────────── */

export const ASK_PROOF =
  "Ik zoek je bestelling graag voor je op. Stuur je bestelnummer en het e-mailadres of de postcode die je bij de bestelling gebruikte."

/** The same whether the order, the address or the postcode was wrong, so a guess learns nothing. */
export const PROOF_FAILED =
  "Met deze gegevens kan ik geen bestelling laten zien. Kijk het bestelnummer en het e-mailadres of de postcode van de bestelling nog eens na."

/** The design's labels for why a test answer was handed over. */
export const HANDOVER_LABEL: Readonly<Record<string, string>> = {
  asks_person: "de klant vraagt om een mens",
  sensitive: "een klacht of iets juridisch is altijd voor een collega",
  money: "geld, korting of een wijziging beloven doet Insyte nooit",
  topic: "dit onderwerp is altijd voor een collega",
  turns: "het gesprek duurt te lang zonder antwoord",
  no_knowledge: "niet in de kennisbank, de vraag staat bij Nog niet beantwoord",
  unsure: "Insyte twijfelt aan het antwoord",
  verify_cap: "de bestelling kon niet worden bevestigd",
  order_complex: "de bestelling heeft geen eenduidige status",
  outside_hours: "buiten openingstijden neemt Insyte de vraag aan",
  policy: "Klant beantwoorden staat op Nooit",
  budget: "de AI-limiet van deze maand is bereikt",
  runaway: "het gesprek liep uit de hand",
  error: "Insyte kon nu niet antwoorden",
  disabled: "de agent staat uit"
}
