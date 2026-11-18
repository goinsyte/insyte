import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AffiliateDashboard,
  AffiliateNotes,
  AffiliatePayment,
  AffiliatePayout,
  AffiliatePayouts,
  AffiliateProfile,
  AffiliateResources,
  ConversionList,
  Destination,
  LinkDetail,
  LinkList,
  LinkMade
} from "@insyte/modules/affiliates/domain/Affiliates"
import {
  ConversionsInput,
  CreateLinkInput,
  LinkRef,
  NotesReadInput,
  PaymentInput,
  PayoutRef,
  ProfileInput,
  UndoInput
} from "@insyte/modules/affiliates/domain/Inputs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AffiliateMember } from "./AffiliateMember.ts"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The affiliate portal (M16 step 3; widgets/06 Part B), for an approved affiliate of one brand: its own links, clicks,
 * conversions and payouts, the brand's material, its profile and where its money goes. Never a shopper's name or
 * address: an order is its number, amount, status and day. What is not its own is `NotFound`.
 */
export class AffiliatePortalRpcs extends RpcGroup.make(
  Rpc.make("AffiliatePortal.dashboard", { success: AffiliateDashboard }),
  Rpc.make("AffiliatePortal.links.list", { success: LinkList }),
  Rpc.make("AffiliatePortal.links.get", { payload: LinkRef, success: LinkDetail, error: NotFound }),
  Rpc.make("AffiliatePortal.links.destinations", { success: Schema.Array(Destination) }),
  Rpc.make("AffiliatePortal.links.create", {
    payload: CreateLinkInput,
    success: LinkMade,
    error: Schema.Union([Invalid, Conflict])
  }),
  Rpc.make("AffiliatePortal.links.archive", { payload: LinkRef, success: LinkMade, error: NotFound }),
  Rpc.make("AffiliatePortal.conversions.list", { payload: ConversionsInput, success: ConversionList }),
  Rpc.make("AffiliatePortal.payouts.list", { success: AffiliatePayouts }),
  Rpc.make("AffiliatePortal.payouts.get", { payload: PayoutRef, success: AffiliatePayout, error: NotFound }),
  Rpc.make("AffiliatePortal.resources", { success: AffiliateResources }),
  Rpc.make("AffiliatePortal.notifications", { success: AffiliateNotes }),
  Rpc.make("AffiliatePortal.notifications.read", { payload: NotesReadInput, success: AffiliateNotes }),
  Rpc.make("AffiliatePortal.profile", { success: AffiliateProfile }),
  Rpc.make("AffiliatePortal.profile.update", { payload: ProfileInput, success: AffiliateProfile, error: Invalid }),
  Rpc.make("AffiliatePortal.payment", { success: AffiliatePayment }),
  Rpc.make("AffiliatePortal.payment.update", { payload: PaymentInput, success: AffiliatePayment, error: Invalid }),
  Rpc.make("AffiliatePortal.undo", { payload: UndoInput, error: Schema.Union([Forbidden, NotFound, Conflict]) })
)
  .middleware(AffiliateMember)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
