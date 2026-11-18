import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ScopeMissingV1 } from "../Errors.ts"

/* Affiliates (M16 steps 3–5): the programme's affiliates, and a month's payouts. To read only. */

const Tier = Schema.Literals(["bronze", "silver", "gold"])
const Money = Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String })

export const AffiliateV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  code: Schema.String.annotate({ description: "The affiliate's discount code at the store." }),
  tier: Tier,
  rate: Schema.Finite.annotate({ description: "Commission in percent of an order's subtotal." }),
  status: Schema.Literals(["active", "paused"]),
  conversions: Schema.Int.annotate({ description: "Orders attributed and not reversed." }),
  earned: Money.annotate({ description: "Commission to date, reversals taken off, pending included." }),
  discount: Schema.Literals(["pending", "made", "failed", "off"]).annotate({
    description: "Whether the code exists as a Shopify discount: made, pending (being made), failed or off (no store)."
  }),
  joined_at: Schema.String
}).annotate({ identifier: "Affiliate" })

export const AffiliatePageV1 = Schema.Struct({
  data: Schema.Array(AffiliateV1),
  counts: Schema.Struct({ active: Schema.Int, paused: Schema.Int, pending_applications: Schema.Int }),
  to_approve: Money.annotate({ description: "Ended months' payouts past their return window, not approved yet." })
}).annotate({ identifier: "AffiliatePage" })

export const AffiliatePayoutsV1 = Schema.Struct({
  month: Schema.String.annotate({ description: "YYYY-MM, UTC." }),
  closed: Schema.Boolean.annotate({ description: "The month ended and was closed; a running month has no payouts." }),
  pay_day: Schema.String,
  data: Schema.Array(Schema.Struct({
    affiliate_id: Schema.String,
    name: Schema.String,
    payout_id: Schema.NullOr(Schema.String),
    orders: Schema.Int,
    approvable: Money,
    in_window: Money,
    reversed: Money,
    total: Money,
    status: Schema.Literals(["open", "approvable", "approved", "paid", "nothing"])
  })),
  months: Schema.Array(Schema.String)
}).annotate({ identifier: "AffiliatePayouts" })

export const AffiliateMonthV1 = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))

export class AffiliatesGroup extends HttpApiGroup.make("affiliates")
  .add(
    HttpApiEndpoint.get("affiliates", "/affiliates", {
      query: Schema.Struct({
        status: Schema.optional(Schema.Literals(["active", "paused"])),
        tier: Schema.optional(Tier)
      }),
      success: AffiliatePageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The programme's affiliates, with their codes, tiers, conversions and commission to date. Needs `affiliates.read`; a key held to some stores reads no money (only a key over every store does)."
    ),
    HttpApiEndpoint.get("affiliatePayouts", "/affiliate-payouts", {
      query: Schema.Struct({ month: Schema.optional(AffiliateMonthV1) }),
      success: AffiliatePayoutsV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "One month's payouts (the last ended month by default): per affiliate what is past its return window, what is still in it, reversals and the status. Nothing moves money here. Needs `affiliates.read`."
    )
  )
  .annotate(OpenApi.Title, "Affiliates")
{}
