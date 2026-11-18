import { Conflict, Forbidden, Invalid, NotFound, WorkspaceMismatch } from "@insyte/domain/Errors"
import {
  AffiliateDetail,
  AffiliateList,
  AffiliatesChange,
  ApplicationList,
  FlaggedConversion,
  InviteLink,
  InviteRow,
  PayoutsView,
  ProgramView,
  ProposedCode,
  ResourceRow
} from "@insyte/modules/affiliates/domain/Affiliates"
import {
  AffiliateRef,
  ApplicationsInput,
  ApproveInput,
  ApprovePayoutsInput,
  EraseInput,
  InviteInput,
  InviteRef,
  ListInput,
  MarkPaidInput,
  PayoutsInput,
  ProgramInput,
  ProposeCodeInput,
  RejectInput,
  ResourceRef,
  ReviewConversionInput,
  SetCodeInput,
  SetPausedInput,
  SetTierInput
} from "@insyte/modules/affiliates/domain/Inputs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Read = Schema.Union([Forbidden, WorkspaceMismatch])
const Write = Schema.Union([Forbidden, NotFound, Conflict, Invalid, WorkspaceMismatch])

/**
 * Affiliates, the brand's side (M16 step 5; widgets/06 Part C): the programme, its affiliates and applications, the
 * monthly payouts and the material shared. `affiliates` 1 reads, 2 decides applications and changes an affiliate, 3
 * runs the programme and approves payouts. No money moves: a payout is a record the brand approves and marks paid.
 */
export class AffiliatesRpcs extends RpcGroup.make(
  Rpc.make("Affiliates.program", { success: ProgramView, error: Read }),
  Rpc.make("Affiliates.program.update", { payload: ProgramInput, success: ProgramView, error: Write }),
  Rpc.make("Affiliates.list", { payload: ListInput, success: AffiliateList, error: Read }),
  Rpc.make("Affiliates.get", {
    payload: AffiliateRef,
    success: AffiliateDetail,
    error: Schema.Union([Forbidden, NotFound, WorkspaceMismatch])
  }),
  Rpc.make("Affiliates.setTier", { payload: SetTierInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.setPaused", { payload: SetPausedInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.applications.list", { payload: ApplicationsInput, success: ApplicationList, error: Read }),
  Rpc.make("Affiliates.applications.approve", { payload: ApproveInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.applications.reject", { payload: RejectInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.proposeCode", { payload: ProposeCodeInput, success: ProposedCode, error: Write }),
  Rpc.make("Affiliates.retryDiscount", { payload: AffiliateRef, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.setCode", { payload: SetCodeInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.conversions.flagged", { success: Schema.Array(FlaggedConversion), error: Read }),
  Rpc.make("Affiliates.conversions.review", {
    payload: ReviewConversionInput,
    success: AffiliatesChange,
    error: Write
  }),
  Rpc.make("Affiliates.erase", { payload: EraseInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.payouts.list", { payload: PayoutsInput, success: PayoutsView, error: Read }),
  Rpc.make("Affiliates.approvePayouts", { payload: ApprovePayoutsInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.markPaid", { payload: MarkPaidInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.invites", { success: Schema.Array(InviteRow), error: Read }),
  Rpc.make("Affiliates.invite", { payload: InviteInput, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.invites.resend", { payload: InviteRef, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.invites.revoke", { payload: InviteRef, success: AffiliatesChange, error: Write }),
  Rpc.make("Affiliates.inviteLink", { success: InviteLink, error: Read }),
  Rpc.make("Affiliates.resources.list", { success: Schema.Array(ResourceRow), error: Read }),
  Rpc.make("Affiliates.resources.remove", { payload: ResourceRef, success: AffiliatesChange, error: Write })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
