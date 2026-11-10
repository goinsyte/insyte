import { Schema } from "effect"
import { Carrier, Resolution, ReturnKind, ReturnStatus, RuleKind } from "./Returns.ts"

/*
 * The public returns portal (M9.3; widgets/03 `/retour/$storeHandle`), as the shopper's browser reads and changes it.
 * The shopper is not a principal: the handle names the workspace, the order number and its address find the order, and
 * from then on a sealed token names that one order for two hours. Money in minor units of the order's currency, times
 * in epoch milliseconds.
 */

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max))
const Handle = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,79}$/))

export const PortalReason = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  claim: Schema.Boolean,
  photoRequired: Schema.Boolean
})

/** The store's page before any order: its name, its words, its windows and what it offers. */
export class PortalStore extends Schema.Class<PortalStore>("returns/PortalStore")({
  handle: Schema.String,
  name: Schema.String,
  /** Off, the page says returns cannot be started here now; nothing else is shown. */
  on: Schema.Boolean,
  intro: Schema.String,
  done: Schema.String,
  returnDays: Schema.Int,
  claimDays: Schema.Int,
  reasons: Schema.Array(PortalReason),
  offered: Schema.Array(Resolution),
  giftCardBonusPct: Schema.Finite,
  claimSteps: Schema.Array(Schema.String)
}) {}

/** Why a line cannot go back for a kind, as facts: the screen writes the sentence. */
export const LineRefusal = Schema.Union([
  /** Already in a return that is not rejected. */
  Schema.Struct({ kind: Schema.Literal("taken"), number: Schema.String, status: ReturnStatus }),
  Schema.Struct({ kind: Schema.Literal("not_delivered") }),
  Schema.Struct({ kind: Schema.Literal("window"), days: Schema.Int, closesOn: Schema.Finite }),
  /** The product rule allows nothing for this kind; its note, in the shopper's words. */
  Schema.Struct({ kind: Schema.Literal("rule"), note: Schema.String })
])
export type LineRefusal = typeof LineRefusal.Type

export class PortalOrder extends Schema.Class<PortalOrder>("returns/PortalOrder")({
  /** Names this order for two hours: every later call carries it. */
  token: Schema.String,
  number: Schema.String,
  firstName: Schema.String,
  currency: Schema.String,
  deliveredAt: Schema.NullOr(Schema.Finite),
  /** A return or claim of this order still under way. */
  open: Schema.NullOr(Schema.Struct({
    number: Schema.String,
    status: ReturnStatus,
    labelCarrier: Schema.NullOr(Carrier)
  })),
  lines: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    variantTitle: Schema.String,
    unitPriceMinor: Schema.Int,
    image: Schema.NullOr(Schema.String),
    /** `null` where it may go back as a return, or as a claim. */
    return: Schema.NullOr(LineRefusal),
    claim: Schema.NullOr(LineRefusal),
    rule: Schema.NullOr(Schema.Struct({ kind: RuleKind, note: Schema.String })),
    /** The product's other variants, to exchange to. */
    exchange: Schema.Array(Schema.String)
  }))
}) {}

/** `#1042`, `1042`, `so-1042`: the number as the shopper types it, without the sign or a prefix. */
export const normaliseNumber = (number: string) => number.trim().toUpperCase().replace(/^(#|SO-)\s*/, "")

export const PortalStoreInput = Schema.Struct({ handle: Handle })

export const PortalLookupInput = Schema.Struct({
  handle: Handle,
  number: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  email: Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(254)),
  /** Turnstile's token, where the stage checks for humans. */
  human: Schema.optional(Text(4096))
})

export const PortalStartInput = Schema.Struct({
  token: Text(1024),
  kind: ReturnKind,
  lines: Schema.Array(Schema.Struct({ lineId: Schema.String })).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(20)
  ),
  reasonId: Schema.String,
  note: Schema.optional(Text(2000)),
  /** Photos uploaded with this token (`PUT /api/portal/photos`). */
  fileIds: Schema.Array(Schema.String).check(Schema.isMaxLength(6)),
  resolution: Resolution,
  exchangeTo: Schema.optional(Text(120))
})

export class PortalStarted extends Schema.Class<PortalStarted>("returns/PortalStarted")({
  /** `R-1042`. */
  number: Schema.String,
  kind: ReturnKind,
  requested: Resolution,
  exchangeTo: Schema.NullOr(Schema.String)
}) {}

/** No store has this handle; also a store whose portal is off, for anything past its page. */
export class PortalNotFound extends Schema.TaggedError<PortalNotFound>()("PortalNotFound", {}) {}

/** No order with this number and address: which of the two was wrong is not said. */
export class OrderNotFound extends Schema.TaggedError<OrderNotFound>()("OrderNotFound", {}) {}

export class PortalRateLimited extends Schema.TaggedError<PortalRateLimited>()("PortalRateLimited", {
  retryAfterSeconds: Schema.Int
}) {}

/** Turnstile did not pass. */
export class HumanCheckFailed extends Schema.TaggedError<HumanCheckFailed>()("HumanCheckFailed", {}) {}

/** The token is past its two hours, or not one of ours: the shopper looks the order up again. */
export class PortalTokenExpired extends Schema.TaggedError<PortalTokenExpired>()("PortalTokenExpired", {}) {}

/** The reason asks for a photo and none came with it. */
export class PhotoRequired extends Schema.TaggedError<PhotoRequired>()("PhotoRequired", {}) {}
