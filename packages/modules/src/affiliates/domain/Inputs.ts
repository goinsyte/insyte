import { Schema } from "effect"
import { Medium, PaymentMethod, Tier } from "./Affiliates.ts"

/*
 * What the programme's forms send (widgets/06 Parts B and C). The console checks the same shape before it calls; the
 * server checks it again and answers the rules only it can know (a code taken, a month still running).
 */

const Text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max))
const Optional = (max: number) => Schema.optional(Schema.String.check(Schema.isMaxLength(max)))
const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
export const Month = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
/** A discount code as Shopify takes it: capitals and digits. */
export const Code = Schema.String.check(Schema.isPattern(/^[A-Z0-9]{3,20}$/))

export const AffiliateRef = Schema.Struct({ affiliateId: Schema.String })
export const ApplicationRef = Schema.Struct({ applicationId: Schema.String })

export const ListInput = Schema.Struct({
  status: Schema.optional(Schema.Literals(["active", "paused"])),
  tier: Schema.optional(Tier),
  q: Optional(200)
})
export type ListInput = typeof ListInput.Type

export const SetTierInput = Schema.Struct({ affiliateId: Schema.String, tier: Tier })
export type SetTierInput = typeof SetTierInput.Type

export const SetPausedInput = Schema.Struct({ affiliateId: Schema.String, paused: Schema.Boolean })
export type SetPausedInput = typeof SetPausedInput.Type

export const ApplicationsInput = Schema.Struct({ status: Schema.optional(Schema.Literals(["pending", "decided"])) })
export type ApplicationsInput = typeof ApplicationsInput.Type

export const ApproveInput = Schema.Struct({ applicationId: Schema.String, tier: Tier, code: Code })
export type ApproveInput = typeof ApproveInput.Type

export const RejectInput = Schema.Struct({ applicationId: Schema.String, reason: Text(1000) })
export type RejectInput = typeof RejectInput.Type

/** The brand's change of an affiliate's code, before its Shopify discount is made (or after it failed). */
export const SetCodeInput = Schema.Struct({ affiliateId: Schema.String, code: Code })
export type SetCodeInput = typeof SetCodeInput.Type

/** The brand's answer on a flagged conversion: it earns (\`accept\`), or it is the affiliate's own. */
export const ReviewConversionInput = Schema.Struct({ conversionId: Schema.String, accept: Schema.Boolean })
export type ReviewConversionInput = typeof ReviewConversionInput.Type

/** Erasing a person on request: an affiliate, or someone who only applied. */
export const EraseInput = Schema.Union([
  Schema.Struct({ affiliateId: Schema.String }),
  Schema.Struct({ applicationId: Schema.String })
])
export type EraseInput = typeof EraseInput.Type

export const ProposeCodeInput = Schema.Struct({ name: Text(200) })

export const PayoutsInput = Schema.Struct({ month: Schema.optional(Month) })
export type PayoutsInput = typeof PayoutsInput.Type

export const ApprovePayoutsInput = Schema.Struct({ month: Month, affiliateIds: Ids })
export type ApprovePayoutsInput = typeof ApprovePayoutsInput.Type

export const MarkPaidInput = Schema.Struct({
  month: Month,
  affiliateIds: Ids,
  reference: Optional(200)
})
export type MarkPaidInput = typeof MarkPaidInput.Type

export const InviteInput = Schema.Struct({
  name: Optional(200),
  /** Checked by the use case, after the permission (as `Invitations.send`). */
  email: Schema.String.check(Schema.isMaxLength(254)),
  tier: Tier,
  message: Optional(1000)
})
export type InviteInput = typeof InviteInput.Type

export const InviteRef = Schema.Struct({ invitationId: Schema.String })

export const ProgramInput = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  returnDays: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 365 }))),
  payoutDay: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 28 }))),
  discountPercent: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 90 })))
})
export type ProgramInput = typeof ProgramInput.Type

export const ResourceRef = Schema.Struct({ resourceId: Schema.String })

export const UndoInput = Schema.Struct({ token: Schema.String })

// ─── The affiliate's own ─────────────────────────────────────────────────────────────────────────────────────────────

export const LinkRef = Schema.Struct({ linkId: Schema.String })
export const PayoutRef = Schema.Struct({ month: Month })

export const CreateLinkInput = Schema.Struct({
  label: Text(80),
  /** A product from `destinations`, or `home` for the store's front page. */
  destinationId: Schema.String.check(Schema.isMaxLength(120)),
  medium: Medium,
  campaign: Schema.String.check(Schema.isPattern(/^[a-z0-9-]{1,60}$/))
})
export type CreateLinkInput = typeof CreateLinkInput.Type

export const ConversionsInput = Schema.Struct({
  status: Schema.optional(Schema.Literals(["pending", "approved", "paid", "reversed"])),
  linkId: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })))
})
export type ConversionsInput = typeof ConversionsInput.Type

export const ProfileInput = Schema.Struct({ name: Text(200) })
export type ProfileInput = typeof ProfileInput.Type

export const PaymentInput = Schema.Struct({
  method: PaymentMethod,
  /** The IBAN or the address; sealed at once, never read back whole. */
  account: Text(120),
  taxId: Optional(40)
})
export type PaymentInput = typeof PaymentInput.Type

export const NotesReadInput = Schema.Struct({ ids: Schema.optional(Schema.Array(Schema.String)) })

export const ApplyInput = Schema.Struct({
  /** The programme's apply slug (its public page). */
  program: Schema.String.check(Schema.isPattern(/^[a-z0-9]{10,32}$/)),
  name: Text(200),
  businessName: Optional(200),
  country: Optional(80),
  channel: Optional(80),
  audience: Optional(2000),
  motivation: Optional(4000),
  url: Optional(500),
  payout: Schema.optional(PaymentMethod)
})
export type ApplyInput = typeof ApplyInput.Type

export const ReapplyInput = Schema.Struct({
  applicationId: Schema.String,
  motivation: Optional(4000),
  audience: Optional(2000),
  url: Optional(500)
})
export type ReapplyInput = typeof ReapplyInput.Type

export const LandingInput = Schema.Struct({ program: Schema.String.check(Schema.isMaxLength(32)) })
