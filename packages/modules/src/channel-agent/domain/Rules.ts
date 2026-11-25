import type { AutonomyLevel } from "@insyte/domain/AgentActions"
import { defanged, namesAmount, promisesMoney, untracedLinks } from "../../agent/domain/Triggers.ts"
import { untracedFigures } from "../../ai/domain/Guards.ts"
import { CHAT_TEXT_MAX } from "../../inbox/domain/ChatKinds.ts"
import {
  CHANNEL_KINDS,
  type ChannelMode,
  type CustomerAgentSettingsInput,
  type DayHours,
  type HandoverRules
} from "./ChannelAgent.ts"

/* ── one reading of a text ────────────────────────────────────────────────────────────────────────────────── */

/** A decimal digit of any script as its ASCII digit: its place in its run of ten. */
const asciiDigit = (ch: string) => {
  if (ch >= "0" && ch <= "9") return ch
  const cp = ch.codePointAt(0)!
  let start = cp
  while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
  return String((cp - start) % 10)
}

/**
 * A text as every check reads it: compatibility forms folded (NFKC: full-width letters and digits, ligatures), every
 * decimal digit as ASCII, the invisible characters that split a word dropped, and the dots of other scripts as `.`. A
 * shopper's message and a model's reply are both read so, so "１５%", "ko\u200brting" and "evil。com" are what they say.
 */
export const fold = (text: string) =>
  text
    .normalize("NFKC")
    .replaceAll(/[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g, "")
    .replaceAll(/[\u3002\uFF61\uFF0E\u2024\uFE52\u2027\u2219\u00B7]/g, ".")
    .replaceAll(/\p{Nd}/gu, asciiDigit)

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
/** The refusal of a handover sentence the website chat would not send (a tab, a carriage return). */
export const HANDOVER_REFUSED =
  "Het overdrachtsbericht bevat een teken dat de websitechat niet verstuurt, zoals een tab. Haal het weg."

export const handoverText = (
  s: Pick<CustomerAgentSettingsInput, "handoverMessage" | "hours">,
  timeZone: string,
  at: Date
) => {
  const when = nextOpenLabel(s.hours, timeZone, at)
  // A save refuses an empty sentence, but the test chat runs on the page's draft: the shopper never hears nothing.
  const sentence = s.handoverMessage.trim() === "" ? DEFAULT_HANDOVER_MESSAGE : s.handoverMessage
  // A sentence saved before the chat's own check: what the chat would refuse is a space, so the shopper still hears.
  // oxlint-disable-next-line no-control-regex
  const sendable = sentence.replaceAll("\r\n", "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
  return sendable.replaceAll("{wanneer}", when === "nu" ? "vandaag nog" : when)
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
  raw: string,
  rules: HandoverRules
): { readonly trigger: Trigger; readonly topic?: string } | null => {
  const text = fold(raw)
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
export const aboutAnOrder = (text: string) => OWN_ORDER.test(fold(text))

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
export const NOT_POSTCODE = new Set([
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
export const claimOf = (raw: string): Claim => {
  const text = fold(raw)
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

/** Shopper messages on one thread before a person takes it, whatever "Na zoveel berichten" says. */
export const MAX_TURNS = 30

/**
 * The shopper's messages since the agent or the team last wrote that one turn reads: more at once, and a person takes
 * the thread (every one of them is screened, so a long burst cannot hide what it asked first).
 */
export const MAX_PENDING = 20

/**
 * The customer agent's share of the workspace's monthly AI budget: past it, chats go to the team and every other AI
 * feature still has the rest.
 */
export const AGENT_BUDGET_SHARE = 0.25

/* ── what the model reads of the shopper ──────────────────────────────────────────────────────────────────── */

const EMAILS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONES = /\+?\d[\d\s-]{7,}\d/g

/** An address written around a filter: "jan (at) voorbeeld.nl", "jan [at] voorbeeld punt nl", "jan at voorbeeld.nl". */
const SPELLED_EMAILS =
  /[\w.+-]+\s*(?:\(at\)|\[at\]|\{at\}|\(@\)|\[@\]|\s(?:at|apenstaartje|apestaartje)\s)\s*[\w-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\(punt\)|\[punt\]|\s(?:dot|punt)\s)\s*[\w-]+)+/gi

const STREET_WORDS =
  "straat|weg|laan|plein|gracht|kade|dijk|singel|hof|park|pad|steeg|dreef|markt|plantsoen|veld|kanaal|haven|burgwal|boulevard|allee|hoven|polder"

/** A street and its house number: "Kerkstraat 12a", "Prins Hendrikkade 104-2", "Laan van Meerdervoort 55 bis". */
const STREETS = new RegExp(
  `\\b(?:(?!(?:onder|half)weg\\b)[\\p{L}'-]+(?:${STREET_WORDS})|(?:${STREET_WORDS})\\s+(?:van|der|de|den|het|ter|ten|op|aan|in|bij)(?:\\s+[\\p{L}'-]+){1,3})\\s+\\d{1,5}(?:\\s?[a-z]\\b)?(?:\\s?[-/]\\s?\\d{1,4}|\\s(?:bis|hs|huis|boven|rood)\\b)?`,
  "giu"
)

/**
 * A shopper's words as the model reads them: no e-mail address (also one spelled out), phone number, postcode, or
 * street and house number. Names stay.
 */
export const redactContact = (raw: string) =>
  fold(raw)
    .replaceAll(EMAILS, "[e-mail]")
    .replaceAll(SPELLED_EMAILS, "[e-mail]")
    .replaceAll(STREETS, "[adres]")
    .replaceAll(PHONES, "[telefoon]")
    .replaceAll(
      POSTCODE,
      (m, _d: string, letters: string) => (NOT_POSTCODE.has(letters.toUpperCase()) ? m : "[postcode]")
    )

/** In the history the model reads, a message that offered an order's proof says only that. */
export const PROOF_SHOWN = "[bestelling bewezen]"
export const PROOF_OFFERED = "[bestelgegevens weggelaten]"

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

const statusLines = (o: OrderFacts, formal: boolean, link: boolean) =>
  [
    `De status van ${formal ? "uw" : "je"} bestelling ${o.number}: ${o.label}.`,
    ...(o.carrier === null || o.delivered ? [] : [`Vervoerder: ${o.carrier}.`]),
    ...(o.trackingUrl === null
      ? []
      : [
        link
          ? `${formal ? "Volg uw" : "Volg je"} pakket: ${o.trackingUrl}`
          : formal
          ? "Volg uw pakket met de link in uw verzendmail."
          : "Volg je pakket met de link in je verzendmail."
      ]),
    ...(o.expectedOn === null ? [] : [`Verwachte bezorging: ${o.expectedOn}.`]),
    ...(o.deliveredOn === null ? [] : [`Bezorgd op ${o.deliveredOn}.`])
  ].join("\n")

/**
 * The fixed reply with a proved order's status: nothing in it is the model's or the shopper's. Over the chat's
 * `CHAT_TEXT_MAX` with its tracking link, it points to the shipping mail instead; still over it, `null` (a person says it).
 */
export const orderStatusReply = (o: OrderFacts, formal: boolean): string | null => {
  const full = statusLines(o, formal, true)
  if (full.length <= CHAT_TEXT_MAX) return full
  const short = statusLines(o, formal, false)
  return short.length <= CHAT_TEXT_MAX ? short : null
}

/* ── what a reply may say ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Words that promise money, goods or a change to an order (ADR-0027: the agent never refunds, cancels, changes an
 * address or promises a discount). A sentence of a reply may hold one only as a sentence of the facts it was given
 * says it (a published return policy); one of its own is never sent.
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

/** Keeping the goods: "je mag het artikel houden", "het product houden", not "we houden je op de hoogte". */
const KEEPS =
  /\b(houd|houdt|houden|hou)\s+(\S+\s+){0,2}(het|je|jouw|uw|dit|dat|de|die)\s+(artikel|product|bestelling|pakket|item|spullen|kledingstuk)|\b(artikel|product|bestelling|pakket|item|spullen|kledingstuk)\w*\s+(\S+\s+){0,4}(houden|houdt|houd|hou)\b/i

/**
 * The agent promising the shopper something (money back, an amount, keeping the goods, a change to their order): sent
 * only as a sentence of the facts states the same promise (a published return policy, `statedIn`), never of its own.
 */
const PROMISE_TO_SHOPPER = new RegExp(
  [
    // "Je krijgt 50 euro terug", "u ontvangt het bedrag retour".
    "\\b(je|jij|u)\\s+(krijgt|ontvangt|krijg)\\s+(\\S+\\s+){0,5}(terug|retour|vergoed|gecrediteerd|bijgeschreven)",
    // "Je mag het artikel houden", "mag je houden", "houden mag".
    "\\bmag\\s+(\\S+\\s+){0,5}houden\\b|\\bhouden\\s+mag\\b|\\bmag\\s+(je|jij|u)\\s+(\\S+\\s+){0,4}houden",
    // "Ik stort het bedrag terug", "we maken het over", "wij annuleren", "ik pas het adres aan".
    "\\b(ik|we|wij)\\s+(\\S+\\s+){0,4}(stort\\w*|betaal\\w*|betalen|maak\\w*\\s+(\\S+\\s+){0,3}over|crediteer\\w*|vergoed\\w*|annuleer\\w*|annuleren|wijzig\\w*|pas\\s+(\\S+\\s+){0,3}aan|passen\\s+(\\S+\\s+){0,3}aan|(ver)?stuur\\w*\\s+(\\S+\\s+){0,3}(opnieuw|nieuw\\w*)|ruil\\w*)",
    // "Het bedrag wordt teruggestort", "wordt vergoed".
    "\\bword(t|en)\\s+(\\S+\\s+){0,3}(teruggestort|terugbetaald|vergoed|gecrediteerd|geannuleerd|omgeruild|kwijtgescholden)",
    "\\b(teruggestort|terugbetaald|vergoed)\\s+worden",
    // An amount back: "€ 20 terug", "20 euro retour".
    "(€\\s*\\d|\\b\\d+([.,]\\d+)?\\s*(euro|eur)\\b)(\\S*\\s+){0,4}(terug|retour)"
  ].join("|"),
  "i"
)

/** Numbers in words, Dutch and English: "zestig", "vijfenveertig", "honderdvijftig", "fifty". "Een" and "ten" are not. */
const NUMBER_WORDS =
  /\b(?:(?:een|twee|drie|vier|vijf|zes|zeven|acht|negen)en|honderd|duizend)?(?:twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|zestien|zeventien|achttien|negentien|twintig|dertig|veertig|vijftig|zestig|zeventig|tachtig|negentig|honderd|duizend|two|three|four|five|six|seven|eight|nine|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/gi

/** Links and addresses written to slip past a filter that `DEFANGED` does not name: a dot spaced out before a domain. */
const SPACED_DOMAIN =
  /\b[\w-]+\s+\.\s*(nl|be|com|net|org|eu|de|io|shop|store|info|co|xyz|app|me|ly)\b|\b[\w-]+\s*\.\s+(nl|be|com|net|org|eu|de|io|shop|store|info|co|xyz|app|me|ly)\b|\b(apenstaart(je)?|apestaart(je)?|at-teken)\b|\b[\w.+-]+\s+(at|bij)\s+[\w-]+\s+(dot|punt)\b/i

export type ReplyFault = "figure" | "promise" | "link" | "empty"

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x !== "")

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/* Numbers in words as digits, so "twee werkdagen" and "2 werkdagen" are one figure. "Een" is an article, not a one. */
const UNIT: Readonly<Record<string, number>> = {
  twee: 2,
  drie: 3,
  vier: 4,
  vijf: 5,
  zes: 6,
  zeven: 7,
  acht: 8,
  negen: 9
}
const SMALL: Readonly<Record<string, number>> = {
  ...UNIT,
  "één": 1,
  tien: 10,
  elf: 11,
  twaalf: 12,
  dertien: 13,
  veertien: 14,
  vijftien: 15,
  zestien: 16,
  zeventien: 17,
  achttien: 18,
  negentien: 19,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  eleven: 11,
  twelve: 12,
  fifteen: 15
}
const TENS: Readonly<Record<string, number>> = {
  twintig: 20,
  dertig: 30,
  veertig: 40,
  vijftig: 50,
  zestig: 60,
  zeventig: 70,
  tachtig: 80,
  negentig: 90,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}
const COMPOUND = new RegExp(
  `^(een|${Object.keys(UNIT).join("|")})(?:en|ën)(${Object.keys(TENS).filter((t) => t.endsWith("ig")).join("|")})$`
)

const below100 = (w: string): number | null => {
  if (w in SMALL) return SMALL[w]!
  if (w in TENS) return TENS[w]!
  const m = COMPOUND.exec(w)
  return m === null ? null : (m[1] === "een" ? 1 : UNIT[m[1]!]!) + TENS[m[2]!]!
}

const below1000 = (w: string): number | null => {
  const m = /^(.*?)(honderd|hundred)(?:en)?(.*)$/.exec(w)
  if (m === null) return below100(w)
  const times = m[1] === "" ? 1 : (UNIT[m[1]!] ?? null)
  const rest = m[3] === "" ? 0 : below100(m[3]!)
  return times === null || rest === null ? null : times * 100 + rest
}

/** A number written as one word, Dutch or English, or `null`: "vijfenveertig" 45, "honderdvijftig" 150. */
export const numberOf = (word: string): number | null => {
  const w = word.toLowerCase()
  const m = /^(.*?)(duizend|thousand)(?:en)?(.*)$/.exec(w)
  if (m === null) return below1000(w)
  const times = m[1] === "" ? 1 : below1000(m[1]!)
  const rest = m[3] === "" ? 0 : below1000(m[3]!)
  return times === null || rest === null ? null : times * 1000 + rest
}

/** Words that say "gratis" as other words: read as it, so the promise and its negation are seen ("niet kosteloos"). */
const FREE = /\b(kosteloos|kostenloos|zonder\s+(extra\s+)?kosten)\b/gi

/** Every number in words as its digits, euro and percent signs as words, and "kosteloos" as "gratis": one reading. */
const asFigures = (text: string) =>
  text
    .replaceAll(FREE, "gratis")
    .replaceAll(/\p{L}+/gu, (w) => {
      const n = numberOf(w)
      return n === null ? w : String(n)
    })
    .replaceAll("€", " euro ")
    .replaceAll("%", " procent ")

/* ── whether a fact says what a reply's sentence says ── */

/** Words that change what a sentence says when one is missing or added: a negation, a condition, a vague time. */
const NEGATIONS = ["niet", "geen", "nooit", "niets", "niks"]
const CONDITIONS = ["vanaf", "boven", "onder", "alleen", "behalve", "tenzij", "mits", "uitgezonderd", "uitsluitend"]
const VAGUE = ["paar", "enkele", "snel", "sneller", "direct", "meteen", "morgen", "vandaag"]
const MARKERS = new Set([...NEGATIONS, ...CONDITIONS, ...VAGUE])

/** The words that say how a figure counts ("binnen 14 dagen", "vanaf 50 euro"): a figure's own, matched exactly. */
const BOUNDS = new Set(["binnen", "na", "voor", "vanaf", "boven", "onder", "tot", "uiterlijk"])

/** What a figure counts, as stems: days, weeks, money, a share. */
const UNITS = new Set(
  ["dag", "werkdag", "wek", "week", "maand", "jar", "ur", "euro", "cent", "procent", "stuk", "artikel"]
)

/** Words that carry no fact of their own: who, the verbs that only help, the small words between, a greeting. */
const STOP = new Set([
  "de",
  "het",
  "een",
  "je",
  "jij",
  "jou",
  "jouw",
  "u",
  "uw",
  "jullie",
  "we",
  "wij",
  "ons",
  "onze",
  "ik",
  "mij",
  "me",
  "mijn",
  "hij",
  "zij",
  "ze",
  "dat",
  "dit",
  "die",
  "deze",
  "er",
  "hier",
  "daar",
  "is",
  "zijn",
  "ben",
  "bent",
  "was",
  "waren",
  "wordt",
  "worden",
  "werd",
  "kan",
  "kun",
  "kunt",
  "kunnen",
  "mag",
  "mogen",
  "moet",
  "moeten",
  "zal",
  "zult",
  "zullen",
  "wil",
  "wilt",
  "willen",
  "heb",
  "hebt",
  "heeft",
  "hebben",
  "had",
  "van",
  "voor",
  "met",
  "op",
  "in",
  "aan",
  "bij",
  "naar",
  "om",
  "te",
  "en",
  "of",
  "maar",
  "ook",
  "nog",
  "wel",
  "dan",
  "als",
  "zo",
  "dus",
  "want",
  "even",
  "graag",
  "natuurlijk",
  "gewoon",
  "hoor",
  "toch",
  "staat",
  "staan",
  "bedankt",
  "dank",
  "vraag",
  "goed",
  "nieuws",
  "hoi",
  "hallo",
  "prima",
  "fijn",
  "zeker",
  "ja",
  "helaas",
  "oké",
  "ok",
  "top",
  "super"
])

/** One word for two that say the same here, as stems: "retour" and "terug", "ontvangen" and "krijgen". */
const SAME: Readonly<Record<string, string>> = {
  retour: "terug",
  ontvang: "krijg",
  verstur: "verzend",
  stur: "zend",
  // A shopper's "pakket" (and "pakketje", "zending") is their order, here.
  pakke: "bestelling",
  pakketj: "bestelling",
  zending: "bestelling",
  // "Zodra", "wanneer" and "indien" as "als": one condition in other words. "Nadat" and "voordat" stay their own.
  zodra: "als",
  wanner: "als",
  indi: "als"
}

/** Phrases that say one word's thing, read as that word: "weer op je rekening" is "terug". */
const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [[/\b(weer\s+)?op\s+(je|jouw|uw)\s+rekening\b/gi, "terug"]]

/**
 * A word's simple Dutch stem: one ending off ("-en", "-e", "-s", a "-t" not after "s"), then doubled vowels and a
 * doubled last letter as one, so "betalen", "betaalt" and "betaal" are one word, and "dagen" is "dag".
 */
const stemOf = (word: string) => {
  let w = word.toLowerCase().replaceAll("ë", "e").replaceAll("ï", "i")
  if (/^\d/.test(w) || w.length <= 3) return w
  w = w.replace(/(en|e|s|(?<!s)t)$/, "")
  w = w.replaceAll(/([aeou])\1/g, "$1").replace(/(\p{L})\1$/u, "$1")
  return SAME[w] ?? w
}

/** Whether two stems are one word: the same, one the other's start or inside it (a compound), or a long shared start. */
const alike = (a: string, b: string) => {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < 4) return false
  if (long.startsWith(short) || long.includes(short)) return true
  let n = 0
  while (n < short.length && short[n] === long[n]) n++
  return n >= 6
}

const tokensOf = (text: string) => text.toLowerCase().match(/\d+(?:[.,]\d+)?|[\p{L}]+/gu) ?? []

const isFigure = (t: string) => /^\d/.test(t)

/** "4,95", "4.95" and "4,950" as one figure; "5,00" as "5". */
const figureOf = (t: string) => String(Number(t.replace(",", ".")))

/**
 * Every figure of a text with what it counts and how: "binnen 14 dagen" `binnen 14 dag`, "vanaf € 50" `vanaf 50 euro`,
 * "€ 4,95" ` 4.95 euro`. The bound is the nearest of `BOUNDS` up to four words before it, short of another figure.
 */
const quantitiesOf = (tokens: ReadonlyArray<string>) =>
  tokens.flatMap((t, i) => {
    if (!isFigure(t)) return []
    const next = tokens[i + 1] === undefined ? null : stemOf(tokens[i + 1]!)
    const unit = next !== null && UNITS.has(next) ? next : tokens[i - 1] === "euro" ? "euro" : ""
    let bound = ""
    for (let j = i - 1; j >= Math.max(0, i - 4) && !isFigure(tokens[j]!); j--) {
      if (BOUNDS.has(tokens[j]!)) {
        bound = tokens[j]!
        break
      }
    }
    return [`${bound} ${figureOf(t)} ${unit}`]
  })

/**
 * Words that narrow what a promise is about ("een beschadigd pakket", "sale-artikelen", "een verkeerd artikel"), as
 * stems: a fact that has one is about that thing only, so a reply makes the same promise only with the same ones. "Je
 * bestelling ruilen we gratis om" is not what "Een beschadigd pakket ruilen we gratis om" says, now that "pakket" reads
 * as the order (`SAME`).
 */
const QUALIFIERS: ReadonlySet<string> = new Set(
  [
    "beschadigd",
    "kapot",
    "defect",
    "verkeerd",
    "fout",
    "sale",
    "afgeprijsd",
    "uitverkoop",
    "outlet",
    "gebruikt",
    "gedragen",
    "geopend",
    "ongeopend",
    "gepersonaliseerd",
    "maatwerk",
    "incompleet",
    "onvolledig",
    "vermist",
    "kwijt"
  ].map((w) => stemOf(w))
)

interface Reading {
  readonly content: ReadonlyArray<string>
  readonly quantities: ReadonlySet<string>
  readonly markers: ReadonlySet<string>
  /** What it narrows its promise to (`QUALIFIERS`), as stems. */
  readonly qualifiers: ReadonlySet<string>
  readonly lower: string
}

/** A text as `statedIn` compares it: its words of substance as stems, its figures with their units and bounds. */
const readingOf = (text: string): Reading => {
  const read = PHRASES.reduce((t, [re, word]) => t.replaceAll(re, word), text)
  const tokens = tokensOf(read)
  const words = tokens.filter((t) => !isFigure(t))
  return {
    content: words.filter((w) => !STOP.has(w) && !MARKERS.has(w) && !BOUNDS.has(w)).map(stemOf).filter((w) =>
      !UNITS.has(w)
    ),
    quantities: new Set(quantitiesOf(tokens)),
    markers: new Set(words.filter((w) => MARKERS.has(w))),
    qualifiers: new Set(words.map(stemOf).filter((w) => QUALIFIERS.has(w))),
    lower: text.toLowerCase()
  }
}

/** The promise words a sentence holds, and whether it makes a promise at all. */
const promiseWords = (lower: string) => PROMISES.filter((p) => lower.includes(p))

/**
 * An order's state said as done ("je bestelling is geannuleerd", "we hebben het bedrag teruggestort"): only the proved
 * order's facts can say it, never a chapter. "Zodra je bestelling verzonden is, …" is not one.
 */
const STATE =
  /\b(geannuleerd|terugbetaald|teruggestort|verzonden|verstuurd|aangepast|gewijzigd|omgeruild|gecrediteerd|bezorgd)\b/i
const CONDITIONAL = /\b(zodra|als|wanneer|nadat|voordat|indien|mits|tenzij)\b|\bna\s+ontvangst\b/i
/** What is still to come ("je bestelling wordt binnen 2 werkdagen bezorgd", "we zullen het verzenden"): no state yet. */
const FUTURE = /\b(wordt|worden|zal|zullen|zult|gaat|gaan)\b/i

/**
 * A state said as reached. One in a condition or still to come is the chapter's to state as any promise: it is read
 * against the chapter (`promises` holds every `STATE` word), not let through.
 */
const claimsState = (sentence: string) => STATE.test(sentence) && !CONDITIONAL.test(sentence) && !FUTURE.test(sentence)

/** The shopper's own order, as a reply names it: "je bestelling", "jouw pakket", "uw zending". */
const OUR_ORDER = String.raw`(je|jouw|uw)\s+(bestelling|pakket|pakketje|order|zending)`
/** What is done to an order, in any form: "verzenden", "bezorgd", "annuleren", "omruilen", "aanpassen". */
const ORDER_VERB =
  /\b(verzend\w*|verzond\w*|verstu\w*|bezorg\w*|annule\w*|terugbeta\w*|terugstort\w*|omruil\w*|omgeruild|ruil\w*|aanpass\w*|aangepast|wijzig\w*|gewijzigd|lever\w*|geleverd)\b/i
/** "We zullen je bestelling …", "je pakket gaan we …", "je bestelling wordt …": what is still to be done to it. */
const OUR_ORDER_TO_COME = new RegExp(
  [
    String.raw`\b(we|wij|ik)\s+(zullen|zal|gaan|ga)\b[^.!?]*\b${OUR_ORDER}\b`,
    String.raw`\b${OUR_ORDER}\b[^.!?]*\b(zullen|zal|gaan|ga)\s+(we|wij|ik)\b`,
    String.raw`\b${OUR_ORDER}\s+(wordt|zal|gaat)\b`
  ].join("|"),
  "i"
)

/**
 * A promise of what will be done to the shopper's own order ("We zullen je bestelling vandaag nog verzenden", "Je
 * bestelling wordt omgeruild"): an action on this order, which only the proved order's facts can promise, never a
 * chapter. The general form in a condition ("Zodra je bestelling verzonden is, …") is the chapter's to say.
 */
const promisesOrderAction = (sentence: string) =>
  !CONDITIONAL.test(sentence) && OUR_ORDER_TO_COME.test(sentence) && ORDER_VERB.test(sentence)

const promises = (sentence: string) =>
  PROMISE_TO_SHOPPER.test(sentence) || KEEPS.test(sentence) || promiseWords(sentence.toLowerCase()).length > 0 ||
  promisesMoney(sentence) || namesAmount(sentence) || STATE.test(sentence)

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x))

/** How much of a promise's own clause must be in the fact's words (as stems) for it to say the same. */
const COVERED = 0.75

/** A sentence's clauses: split at a comma, a colon or a semicolon, and before "ook", "maar", "zelfs", "inclusief". */
const clausesOf = (sentence: string) =>
  sentence.split(/\s*[,;:]\s+|\s+(?=(?:ook|maar|zelfs|inclusief)\b)/i).filter((c) => c.trim() !== "")

/** A sentence that goes on with the one before it: "Ook voor sale-artikelen.", "Dat geldt ook voor …". */
const CONTINUES =
  /^(ook|zelfs|inclusief|incl|en|of|maar|behalve|tenzij|alleen|uitgezonderd|mits|zowel|evenals|net als|dat geldt|dit geldt|geldt)\b/i
const continues = (sentence: string) =>
  CONTINUES.test(sentence.trim()) ||
  (wordsOf(sentence).length <= 6 && /\b(ook|eveneens|evenals|zelfs)\b/i.test(sentence))

/** A promise as the reply makes it: its own clause, every other clause of its sentence, and a sentence that goes on. */
interface Promise {
  readonly main: string
  readonly rest: ReadonlyArray<string>
  readonly whole: string
}

const promiseIn = (sentence: string, next: string | undefined): Promise => {
  const clauses = clausesOf(sentence)
  const at = Math.max(0, clauses.findIndex((c) => promises(c)))
  const attached = next !== undefined && continues(next) ? [next] : []
  return {
    main: clauses[at] ?? sentence,
    rest: [...clauses.filter((_, i) => i !== at), ...attached],
    whole: [sentence, ...attached].join(" ")
  }
}

/** Whether two readings share a word of substance. */
const related = (a: Reading, b: Reading) => a.content.some((w) => b.content.some((k) => alike(w, k)))

/**
 * What a promise may be read from: each sentence of the facts, and each two that follow each other and are about one
 * thing (they share a word of substance: "De verzendkosten zijn € 4,95. Vanaf 50 euro verzenden we gratis."), as a
 * reply often says two in one. A heading (a `#` line) states nothing.
 */
const statementsOf = (facts: string) => {
  const lines = sentencesOf(facts).filter((l) => !l.startsWith("#"))
  const read = lines.map(readingOf)
  return [
    ...lines,
    ...lines.slice(1).flatMap((l, i) => (related(read[i]!, read[i + 1]!) ? [`${lines[i]} ${l}`] : []))
  ]
}

/**
 * Whether a sentence of the facts states the promise a reply makes: itself a promise, with the reply's promise words;
 * every figure of the reply with the same unit and bound ("binnen 14 dagen" is not "na 14 dagen", nor "vanaf 2 euro"
 * what "binnen 2 werkdagen" says); the same negations, conditions and vague times, either way round; most words of the
 * promise's own clause (as stems, a number in words as its digits), and every word of what the reply adds to it (a
 * clause, "ook voor sale-artikelen", or a sentence that goes on).
 */
const statedIn = (promise: Promise, facts: ReadonlyArray<string>) => {
  const whole = readingOf(promise.whole)
  const main = readingOf(promise.main)
  const rest = promise.rest.map(readingOf)
  const words = promiseWords(whole.lower)
  return facts.some((f) => {
    if (!promises(f)) return false
    const fact = readingOf(f)
    // A fact of one word is a heading's, not a statement: "Gratis verzending" says nothing of when.
    if (fact.content.length + fact.quantities.size < 2 || !sameSet(whole.markers, fact.markers)) return false
    // About the same thing: "een beschadigd pakket" is not every order, nor a sale-artikel every article.
    if (!sameSet(whole.qualifiers, fact.qualifiers)) return false
    if ([...whole.quantities].some((q) => !fact.quantities.has(q))) return false
    if (words.some((p) => !fact.lower.includes(p))) return false
    const known = (w: string) => fact.content.some((k) => alike(w, k))
    if (rest.some((r) => !r.content.every(known))) return false
    // Its figures count as words it shares (each matched above): "Bestellingen vanaf 50 euro …" is that fact's.
    const covered = main.content.filter(known).length + main.quantities.size
    const all = main.content.length + main.quantities.size
    return all === 0 || covered / all >= COVERED
  })
}

const NEGATION_SET: ReadonlySet<string> = new Set(NEGATIONS)
const negationsOf = (r: Reading) => new Set([...r.markers].filter((m) => NEGATION_SET.has(m)))

/**
 * Whether a sentence of the facts says the opposite of the promise, about the same thing: the same qualifiers, one of
 * the promise's words ("gratis") and another of its words ("retourneren"), and a negation the reply has not, or the
 * other way round. "Sale-artikelen zijn niet gratis te retourneren" wins over any other sentence a reply that sale
 * articles return for free could be read from. One sentence at a time: two side by side are two subjects.
 */
const contradicted = (promise: Promise, facts: ReadonlyArray<string>) => {
  const whole = readingOf(promise.whole)
  const words = promiseWords(whole.lower)
  if (words.length === 0) return false
  const others = whole.content.filter((w) =>
    !QUALIFIERS.has(w) && !words.some((p) => p.startsWith(w) || w.startsWith(p))
  )
  return facts.some((f) => {
    const fact = readingOf(f)
    if (!sameSet(whole.qualifiers, fact.qualifiers)) return false
    if (!words.some((p) => fact.lower.includes(p))) return false
    if (!others.some((w) => fact.content.some((k) => alike(w, k)))) return false
    return !sameSet(negationsOf(whole), negationsOf(fact))
  })
}

/**
 * What is wrong with a reply before it may go, read folded (`fold`) and every number in words as its digits: a figure
 * the facts the model was given do not have (a shopper's own digits are not facts: "ik las 60 dagen?" is not
 * confirmed); a promise (money, goods, a change to an order, an amount, keeping the goods) no sentence of the facts
 * states the same (`statedIn`; `statements`, the facts without the chapters' titles, as the caller has them); an
 * order's state said as done that the proved order's facts (`order`) do not state; a link or an address the facts never
 * had, or one written to slip past; or nothing to say. None: it may go.
 */
export const replyFaults = (
  raw: string,
  given: { readonly facts: string; readonly statements?: string; readonly order?: string | null }
) => {
  const text = asFigures(fold(raw))
  const facts = asFigures(fold(given.facts))
  const faults: Array<ReplyFault> = []
  if (text.trim() === "") return ["empty"] satisfies Array<ReplyFault>
  const knownWords = new Set(wordsOf(facts))
  if (
    untracedFigures(text, facts).length > 0 ||
    [...text.matchAll(NUMBER_WORDS)].some((m) => !knownWords.has(m[0].toLowerCase()))
  ) faults.push("figure")
  const stated = given.statements === undefined ? facts : asFigures(fold(given.statements))
  const statements = statementsOf(stated)
  const singles = sentencesOf(stated).filter((l) => !l.startsWith("#"))
  const order = given.order == null ? [] : statementsOf(asFigures(fold(given.order)))
  const sentences = sentencesOf(text)
  const broken = sentences.some((sentence, i) => {
    const promise = promiseIn(sentence, sentences[i + 1])
    if (claimsState(promise.whole) || promisesOrderAction(promise.whole)) return !statedIn(promise, order)
    return promises(promise.whole) && (!statedIn(promise, statements) || contradicted(promise, singles))
  })
  if (broken) faults.push("promise")
  if (untracedLinks(text, facts).length > 0 || defanged(text) || SPACED_DOMAIN.test(text)) faults.push("link")
  return faults
}

/* ── what widens what the agent says by itself ────────────────────────────────────────────────────────────── */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const topicKey = (t: string) => t.trim().toLowerCase()

/** Rules that hand fewer chats to a person: a check switched off, a topic gone, more messages allowed or no limit. */
const relaxes = (was: HandoverRules, next: HandoverRules) =>
  (was.unsure && !next.unsure) || (was.asksPerson && !next.asksPerson) ||
  was.topics.some((t) => !next.topics.map(topicKey).includes(topicKey(t))) ||
  (was.afterMessages !== null && (next.afterMessages === null || next.afterMessages > was.afterMessages))

/**
 * What a save (or an undo) changes that lets Insyte say more to shoppers by itself: these need `ai.autonomy` beside
 * Instellingen · Beheren. Switching it on, a channel to Zelf antwoorden, other hours, answering outside them, handover
 * rules that hand over less, or other words for the handover. Switching it off, or anything while it is off, narrows.
 */
export const widens = (was: CustomerAgentSettingsInput, next: CustomerAgentSettingsInput) =>
  next.on && (
    !was.on || CHANNEL_KINDS.some((k) => next.channels[k] === "auto" && was.channels[k] !== "auto") ||
    !same(was.hours, next.hours) || (next.outside === "answer" && was.outside !== "answer") ||
    relaxes(was.handover, next.handover) || was.handoverMessage.trim() !== next.handoverMessage.trim()
  )

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

/** The test chat files no question, so its handover for want of a chapter says where a real one goes. */
export const TEST_HANDOVER_LABEL: Readonly<Record<string, string>> = {
  ...HANDOVER_LABEL,
  no_knowledge: "niet in de kennisbank; van een echte klant komt de vraag bij Nog niet beantwoord"
}
