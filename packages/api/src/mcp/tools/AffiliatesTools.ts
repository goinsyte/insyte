import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ScopeMissingV1 } from "../../http/Errors.ts"
import { AffiliateMonthV1, AffiliatePageV1, AffiliatePayoutsV1 } from "../../http/groups/AffiliatesGroup.ts"
import { asKey, Needs, read } from "../Shared.ts"

/* Affiliates (M16 steps 3–5), to read: the affiliates, and a month's payouts. No tool approves or pays. */

export const ListAffiliates = Tool.make("list_affiliates", {
  description:
    "The affiliate programme's affiliates: code, tier and rate, status active or paused, conversions and commission to date, and whether the code exists as a Shopify discount; with counts and what ended months have to approve. Needs affiliates.read.",
  parameters: Schema.Struct({
    status: Schema.optional(Schema.Literals(["active", "paused"])),
    tier: Schema.optional(Schema.Literals(["bronze", "silver", "gold"]))
  }),
  success: AffiliatePageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true).annotate(Needs, [read("affiliates")])

export const ListAffiliatePayouts = Tool.make("list_affiliate_payouts", {
  description:
    "One month's affiliate payouts (YYYY-MM; the last ended month by default): per affiliate what is past its return window, what is still in it, reversals, and the status. A running month is not closed and has none. Needs affiliates.read.",
  parameters: Schema.Struct({ month: Schema.optional(AffiliateMonthV1) }),
  success: AffiliatePayoutsV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true).annotate(Needs, [read("affiliates")])

export const AffiliatesTools = Toolkit.make(ListAffiliates, ListAffiliatePayouts)
