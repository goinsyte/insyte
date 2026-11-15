/*
 * What a shopper sees of the workspace's settings (M17 step 20.1b; widgets/05 §7.1–7.3): the one rule every slice that
 * shows a shopper something goes through (`use-cases/CustomerFacing.ts`), as `Senders.ts` is for who a mail comes from.
 * The settings pages keep the values in `workspace_settings`; this reads what a mail, the returns portal and a reply
 * need of them, loosely, so a section never saved, or saved by an older page, answers what a new workspace starts from.
 *
 * - Verzending (`shipping`): per carrier status the sentence the shopper reads and where (`all` "Overal", `line` "Alleen
 *   in de statusregel", `hidden` "Niet tonen"); `{vervoerder}` is the carrier's name.
 * - Sjablonen (`links`): the fixed links a reply's variables stand for; a link left empty takes the sentence that
 *   carries it out, rather than sending a mail with a hole in it.
 * - Huisstijl (`brand`): the colour, only where white text reads on it (the page's own rule), and the logo.
 */

/* ── Verzending ───────────────────────────────────────────────────────────────────────────────── */

/** The twelve carrier statuses, in the page's order, with the wording a new workspace starts from. */
export const SHIP_STATUSES = [
  { id: "info", label: "Je bestelling is verzonden", show: "all" },
  { id: "supplier", label: "We maken je bestelling klaar", show: "line" },
  { id: "country", label: "Onderweg", show: "line" },
  { id: "local", label: "Onderweg met {vervoerder}", show: "all" },
  { id: "noinfo", label: "Verzonden", show: "all" },
  { id: "transit", label: "Onderweg", show: "all" },
  { id: "pickup", label: "Ligt klaar om op te halen", show: "all" },
  { id: "out", label: "Wordt vandaag bezorgd", show: "all" },
  { id: "failed", label: "Bezorgpoging mislukt", show: "all" },
  { id: "exception", label: "We kijken naar je zending", show: "all" },
  { id: "stale", label: "Onderweg", show: "line" },
  { id: "delivered", label: "Bezorgd", show: "all" }
] as const
export const SHIP_STATUS_IDS = [
  "info",
  "supplier",
  "country",
  "local",
  "noinfo",
  "transit",
  "pickup",
  "out",
  "failed",
  "exception",
  "stale",
  "delivered"
] as const satisfies ReadonlyArray<(typeof SHIP_STATUSES)[number]["id"]>
export type ShipStatusId = (typeof SHIP_STATUS_IDS)[number]
export const SHIP_SHOWS = ["all", "line", "hidden"] as const
export type ShipShow = (typeof SHIP_SHOWS)[number]

/** What AfterShip says beyond a parcel's status (`deliveries.stage`): ready at a pickup point, or a missed delivery. */
export type ParcelStage = "available_for_pickup" | "failed_attempt"

/**
 * A parcel's carrier status, by its newest word: AfterShip's once it has one (`deliveries.status`), Shopify's until then
 * (`fulfilments.tracking_status`). The same reading as Verzending's "Nu" column (`Shipping.statusCounts`). AfterShip's
 * "klaar om op te halen" and "bezorging mislukt" (`stage`) keep their own wording; Insyte does not tell "onderweg naar
 * het land" and "bij de lokale vervoerder" apart from the statuses around them yet.
 */
export const parcelStatusOf = (
  tracked: string | null,
  shopify: string | null,
  stage: string | null = null
): ShipStatusId => {
  if (tracked === "in_transit" && stage === "available_for_pickup") return "pickup"
  if (tracked === "exception" && stage === "failed_attempt") return "failed"
  switch ((tracked === "pending" ? null : tracked) ?? shopify) {
    case "delivered":
      return "delivered"
    case "out_for_delivery":
      return "out"
    case "exception":
    case "returned":
      return "exception"
    case "expired":
      return "stale"
    case "in_transit":
      return "transit"
    default:
      return tracked === "pending" ? "noinfo" : "info"
  }
}

/** A status as the shopper reads it: the sentence with the carrier filled in, and where it shows. */
export interface Worded {
  readonly text: string
  readonly show: ShipShow
}

const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null && !Array.isArray(u)

/** "Onderweg met {vervoerder}" with the carrier's name, or "de vervoerder" where the parcel names none. */
const filled = (label: string, carrier: string | null) =>
  label.replace(/\{vervoerder\}/gi, () => carrier === null || carrier.trim() === "" ? "de vervoerder" : carrier.trim())

/** Status `id` of a parcel with `carrier`, as Verzending says it (`stored`: the section's value; none: the defaults). */
export const wordingFor = (stored: unknown, id: ShipStatusId, carrier: string | null): Worded => {
  const start = SHIP_STATUSES.find((s) => s.id === id)!
  const rows = isRecord(stored) && Array.isArray(stored["statuses"]) ? stored["statuses"] : []
  const row = rows.find((r): r is Record<string, unknown> => isRecord(r) && r["id"] === id)
  const label = typeof row?.["label"] === "string" && row["label"].trim() !== "" ? row["label"].trim() : start.label
  const show = (SHIP_SHOWS as ReadonlyArray<unknown>).includes(row?.["show"]) ? row!["show"] as ShipShow : start.show
  return { text: filled(label, carrier), show }
}

/* ── Sjablonen ────────────────────────────────────────────────────────────────────────────────── */

export const LINK_KEYS = ["review", "unsubscribe", "restock"] as const
export type LinkKey = (typeof LINK_KEYS)[number]
/** The variable a reply writes for each link. */
export const LINK_VARIABLES: Record<LinkKey, string> = {
  review: "{review_link}",
  unsubscribe: "{uitschrijf_link}",
  restock: "{voorraad_link}"
}

export type Links = Readonly<Record<LinkKey, string>>

/** The saved links, each an `https://` address or empty; never saved, all empty. */
export const linksOf = (stored: unknown): Links =>
  Object.fromEntries(LINK_KEYS.map((k) => {
    const v = isRecord(stored) ? stored[k] : undefined
    return [k, typeof v === "string" && /^https:\/\/[^\s.]+\.[^\s]+$/.test(v.trim()) ? v.trim() : ""]
  })) as Links

/**
 * Abbreviations whose dot does not end a sentence ("Kijk bijv. op …"), without their last dot. Not "zo" or "do", which
 * are words too ("Tot zo.").
 */
const ABBREVIATIONS = new Set([
  "bijv",
  "bv",
  "b.v",
  "o.a",
  "d.w.z",
  "i.p.v",
  "m.b.t",
  "t.a.v",
  "t.z.t",
  "z.s.m",
  "a.u.b",
  "s.v.p",
  "etc",
  "enz",
  "evt",
  "incl",
  "excl",
  "ca",
  "nl",
  "nr",
  "tel",
  "dhr",
  "mevr",
  "ma",
  "di",
  "wo",
  "vr",
  "za"
])

const STOP = /[.!?…]/

/** Where the sentence holding position `at` of `line` starts: after the last stop before it that ends a sentence. */
const sentenceStart = (line: string, at: number) => {
  for (let i = at - 1; i >= 0; i--) {
    if (!STOP.test(line[i]!) || !/\s/.test(line[i + 1] ?? "")) continue
    const word = /([\p{L}.]+)$/u.exec(line.slice(0, i))?.[1]?.toLowerCase() ?? ""
    if (line[i] === "." && ABBREVIATIONS.has(word)) continue
    return i + 1
  }
  return 0
}

/** The words that lead up to a link ("via", "op", "hier:"), which go with it. */
const LEAD_IN = /\s*(?:\b(?:via|op|naar|bij|hier|of)\b\s*:?\s*)?$/iu

/**
 * `line` without the first `variable` in it, whose link is empty. Where the variable ends a sentence and follows a
 * question or a colon ("Vertel je ons wat je ervan vindt? {review_link}", "Je review: {review_link}."), that sentence
 * goes with it: it only led up to the link. Otherwise only the variable goes, with the word that led up to it ("Schrijf
 * je uit via {uitschrijf_link}" is "Schrijf je uit"); the sentences around it stay as written.
 */
const withoutVariable = (line: string, variable: string) => {
  const at = line.indexOf(variable)
  const after = at + variable.length
  const before = line.slice(0, at).trimEnd()
  const closing = /^[.!?…]*(?=\s|$)/.exec(line.slice(after))
  if (closing !== null && /[?:]$/.test(before)) {
    const from = sentenceStart(line, before.length - 1)
    const head = line.slice(0, from).trimEnd()
    const tail = line.slice(after + closing[0].length)
    return head === "" ? tail.trimStart() : head + tail
  }
  const lead = LEAD_IN.exec(line.slice(0, at))![0]
  const kept = line.slice(0, at - lead.length)
  const rest = line.slice(after)
  return kept === "" ? rest.trimStart() : kept + rest
}

/** Each variable with its link: a function, so a `$` in a link is the link's, not a replacement pattern. */
const putIn = (text: string, links: Links) =>
  LINK_KEYS.reduce((t, k) => links[k] === "" ? t : t.replaceAll(LINK_VARIABLES[k], () => links[k]), text)

/**
 * The team's words with the links in. Each variable becomes its link. A variable whose link is empty goes, with what
 * only led up to it (`withoutVariable`); a line left empty goes too. Words without a variable come back as they were,
 * and words that were not empty never come back empty: then only the variables go.
 */
export const fillLinks = (text: string, links: Links): string => {
  if (!LINK_KEYS.some((k) => text.includes(LINK_VARIABLES[k]))) return text
  const empty = LINK_KEYS.filter((k) => links[k] === "").map((k) => LINK_VARIABLES[k])
  const kept = text.split("\n").flatMap((line) => {
    if (!empty.some((v) => line.includes(v))) return [line]
    let left = line
    for (let v = empty.find((e) => left.includes(e)); v !== undefined; v = empty.find((e) => left.includes(e))) {
      left = withoutVariable(left, v)
    }
    return left.trim() === "" ? [] : [left.trimEnd()]
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim()
  if (kept !== "" || text.trim() === "") return putIn(kept, links)
  const bare = empty.reduce((t, v) => t.replaceAll(v, ""), text).replace(/[ \t]+$/gm, "").trim()
  return putIn(bare, links)
}

/* ── Huisstijl ────────────────────────────────────────────────────────────────────────────────── */

/** What a shopper's mail and the returns portal show of Huisstijl: none of either, Insyte's own look. */
export interface Look {
  /** `#RRGGBB`, only where white text reads on it (4.5:1): the button. */
  readonly color: string | null
  /** The console path the saved logo is served from to anyone (`/api/brand/…`), none without one. */
  readonly logoPath: string | null
}

export const NO_LOOK: Look = { color: null, logoPath: null }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#abc` as `#AABBCC`. */
const sixDigits = (hex: string) =>
  (hex.length === 4 ? `#${hex.slice(1).split("").map((c) => c + c).join("")}` : hex).toUpperCase()

const luminance = (hex: string) => {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG's contrast of white text on `hex`. */
export const contrastWithWhite = (hex: string) => 1.05 / (luminance(sixDigits(hex)) + 0.05)

/** The brand's colour for a button with white text on it, or none where it is not a colour or too light to read. */
export const buttonColorOf = (stored: unknown): string | null => {
  const color = isRecord(stored) && typeof stored["color"] === "string" ? stored["color"].trim() : ""
  return HEX.test(color) && contrastWithWhite(color) >= 4.5 ? sixDigits(color) : null
}

/** The saved logo's file, as Huisstijl keeps it; none without one. */
export const logoFileOf = (stored: unknown): string | null => {
  const id = isRecord(stored) ? stored["logoFileId"] : undefined
  return typeof id === "string" && /^[a-z]+_[0-9a-z]{10,40}$/i.test(id) ? id : null
}

/** Where anyone reads a workspace's logo: a mail's client, the returns portal. */
export const logoPath = (workspaceId: string, fileId: string) =>
  `/api/brand/${encodeURIComponent(workspaceId)}/logo/${encodeURIComponent(fileId)}`
