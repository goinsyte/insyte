import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { AffiliateMe, Applied, NotAffiliate, ProgramLanding } from "@insyte/modules/affiliates/domain/Affiliates"
import { ApplyInput, LandingInput, ReapplyInput } from "@insyte/modules/affiliates/domain/Inputs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Applying to a brand's affiliate programme (M16 step 3; PLAN item 22), for the signed-in person before they are an
 * affiliate: the programme's public page, applying, where the application stands (approved, waiting, turned down
 * with the reason) and applying again. Only the person's own, through definers (0105). `Conflict` names why an
 * application is refused: `closed`, `member`, `open`, `not_rejected`.
 */
export class AffiliateApplyRpcs extends RpcGroup.make(
  Rpc.make("AffiliateApply.landing", { payload: LandingInput, success: ProgramLanding, error: NotFound }),
  Rpc.make("AffiliateApply.me", { success: AffiliateMe, error: NotAffiliate }),
  Rpc.make("AffiliateApply.apply", { payload: ApplyInput, success: Applied, error: Schema.Union([Conflict, Invalid]) }),
  Rpc.make("AffiliateApply.reapply", {
    payload: ReapplyInput,
    success: Applied,
    error: Schema.Union([Conflict, Invalid, NotFound])
  })
).middleware(Authenticated).middleware(WithDb) {}
