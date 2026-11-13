import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { ChargebackDetailV1, ChargebackPageV1, ChargebackTabV1 } from "../../http/groups/ChargebacksGroup.ts"
import { asKey } from "../Shared.ts"

/* Chargebacks (M13), to read: the cases, and one with its evidence pack and timeline. */

const ChargebackId = Schema.String.annotate({
  description: "The chargeback's id (cb_…), as list_chargebacks gives it."
})

export const ListChargebacks = Tool.make("list_chargebacks", {
  description:
    "Chargebacks, nearest evidence deadline first, with each tab's count and the workspace's record (won out of decided, what the won cases kept): tab action_required (open or waiting for evidence), submitted, won or lost; provider stripe, klarna or paypal. Needs chargebacks.read.",
  parameters: Schema.Struct({
    tab: Schema.optional(ChargebackTabV1),
    provider: Schema.optional(Schema.Literals(["stripe", "klarna", "paypal"]))
  }),
  success: ChargebackPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetChargeback = Tool.make("get_chargeback", {
  description:
    "One chargeback with its evidence pack, in its order, and its timeline (opened, evidence added or removed, reminders, the outcome). Needs chargebacks.read.",
  parameters: Schema.Struct({ chargeback_id: ChargebackId }),
  success: ChargebackDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ChargebacksTools = Toolkit.make(
  ListChargebacks,
  GetChargeback
)
