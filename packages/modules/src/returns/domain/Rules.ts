/*
 * The returns rules, one server copy (M9.1; domain.md §4.7, §12.17): which window applies, which product rule, which
 * resolutions an item allows and what each moves, and what a status may move to. They mirror `lib/returns.ts`, which
 * the design screens and the portal read, so the console and the server cannot disagree on what is returnable.
 */

export type ReturnKind = "return" | "claim"
export type ReturnStatus = "review" | "awaiting_parcel" | "in_transit" | "received" | "ready" | "resolved" | "rejected"
export type Resolution = "refund" | "exchange" | "gift_card" | "replacement" | "discount"
export type RuleKind = "not_returnable" | "refund_only" | "exchange_only"

export const DAY_MS = 86_400_000

/** Two working days, said as 48 hours (`REVIEW_HOURS`). */
export const REVIEW_HOURS = 48

/** What a status may move to (`NEXT`). */
export const NEXT: Record<ReturnStatus, ReadonlyArray<ReturnStatus>> = {
  review: ["awaiting_parcel", "ready", "rejected"],
  awaiting_parcel: ["in_transit", "received", "rejected"],
  in_transit: ["received"],
  received: ["ready"],
  ready: ["resolved"],
  resolved: [],
  rejected: ["review"]
}

export const canMove = (from: ReturnStatus, to: ReturnStatus) => NEXT[from].includes(to)

/** A claim that keeps the item goes straight to be resolved; anything else waits for its parcel. */
export const approvedStatus = (kind: ReturnKind, keepItem: boolean): ReturnStatus =>
  kind === "claim" && keepItem ? "ready" : "awaiting_parcel"

export interface ReasonWindow {
  readonly type: "return" | "claim" | "both"
  readonly windowDays: number | null
}

export interface SpecialWindow {
  readonly label: string
  readonly days: number
  /** Month and day, `MM-DD`, by order date; a period may run over the new year. */
  readonly from: string
  readonly to: string
}

const monthDay = (at: Date) =>
  `${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`

const inPeriod = (md: string, w: SpecialWindow) =>
  w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to

/** The window that applies: the reason's own, else a special window by order date, else the kind's. */
export const windowDaysFor = (
  kind: ReturnKind,
  reason: ReasonWindow | undefined,
  settings: {
    readonly returnDays: number
    readonly claimDays: number
    readonly specialWindows: ReadonlyArray<SpecialWindow>
  },
  placedAt: Date
): number => {
  if (reason?.windowDays != null) return reason.windowDays
  const special = settings.specialWindows.find((w) => inPeriod(monthDay(placedAt), w))
  if (special !== undefined) return special.days
  return kind === "claim" ? settings.claimDays : settings.returnDays
}

export interface WindowCheck {
  readonly inside: boolean
  readonly daysSince: number
  readonly days: number
  readonly closesOn: number
}

/** Whether `now` is inside a window of `days` that opened at delivery; one not delivered yet has not started. */
export const windowCheck = (deliveredAt: Date | null, days: number, now: number): WindowCheck => {
  const from = deliveredAt?.getTime() ?? now
  const closesOn = from + days * DAY_MS
  return { inside: now <= closesOn, daysSince: Math.max(0, Math.floor((now - from) / DAY_MS)), days, closesOn }
}

export interface Rule {
  readonly id: string
  readonly match: "product" | "variant" | "shopify_tag"
  readonly matchRef: string
  readonly policy: RuleKind
  readonly note: string
}

/** The most specific rule wins: variant, then product, then a Shopify tag (`ruleFor`). */
export const ruleFor = (
  rules: ReadonlyArray<Rule>,
  item: { readonly productId: string | null; readonly variantId: string | null; readonly tags: ReadonlyArray<string> }
): Rule | undefined =>
  rules.find((r) => r.match === "variant" && r.matchRef === item.variantId) ??
    rules.find((r) => r.match === "product" && r.matchRef === item.productId) ??
    rules.find((r) => r.match === "shopify_tag" && item.tags.includes(r.matchRef))

/** The resolutions an item allows, after its rule and what the store offers (`resolutionsFor`). */
export const resolutionsFor = (
  offered: ReadonlyArray<Resolution>,
  rule: Pick<Rule, "policy"> | undefined,
  kind: ReturnKind
): Array<Resolution> => {
  if (rule?.policy === "not_returnable" && kind === "return") return []
  const base = offered.filter((r) => kind === "return" ? r !== "replacement" : true)
  if (rule?.policy === "refund_only") return base.filter((r) => r === "refund")
  if (rule?.policy === "exchange_only") {
    return base.filter((r) => r === "exchange" || (kind === "claim" && r === "replacement"))
  }
  return base
}

/** What a resolution moves, in minor units: a gift card adds the bonus, an exchange costs the fee, a code is 15 %. */
export const resolutionAmount = (
  kind: Resolution,
  amountMinor: number,
  settings: { readonly giftCardBonusPct: number; readonly exchangeFeeMinor: number }
): number => {
  if (kind === "gift_card") return Math.round(amountMinor * (1 + settings.giftCardBonusPct / 100))
  if (kind === "exchange") return settings.exchangeFeeMinor
  if (kind === "discount") return Math.round(amountMinor * 0.15)
  if (kind === "replacement") return 0
  return amountMinor
}
