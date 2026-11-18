import { NotFound, Unauthenticated } from "@insyte/domain/Errors"
import {
  AffiliateDashboard,
  AffiliateMe,
  AffiliatePayment,
  AffiliatePayout,
  AffiliatePayouts,
  AffiliateProfile,
  AffiliateResources,
  ConversionList,
  Destination,
  LinkDetail,
  LinkList,
  NotAffiliate,
  ProgramLanding
} from "@insyte/modules/affiliates/domain/Affiliates"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The affiliate portal (M16 steps 3–5): what an affiliate reads of its own work for one brand, primed by the routes'
 * loaders and carried in the document. Every portal write names `AFFILIATE_PORTAL`; what the brand changes shows on
 * the next read (the portal has no socket of its own yet).
 */

export const AFFILIATE_PORTAL = ["affiliate-portal"] as const

const errors = Schema.Union([NotAffiliate, Unauthenticated, RpcClientError.RpcClientError])
const orGone = Schema.Union([NotFound, errors])
const keys = { reactivityKeys: AFFILIATE_PORTAL }

/** Where the signed-in person stands with the programme: approved, waiting, or turned down with the reason. */
export const affiliateMeAtom = Atom.serializable(ConsoleClient.query("AffiliateApply.me", undefined, keys), {
  key: "affiliate-portal:me",
  schema: AsyncResult.Schema({ success: AffiliateMe, error: errors }),
  skipInitialRun: true
})

export const affiliateDashboardAtom = Atom.serializable(
  ConsoleClient.query("AffiliatePortal.dashboard", undefined, keys),
  {
    key: "affiliate-portal:dashboard",
    schema: AsyncResult.Schema({ success: AffiliateDashboard, error: errors }),
    skipInitialRun: true
  }
)

export const affiliateLinksAtom = Atom.serializable(
  ConsoleClient.query("AffiliatePortal.links.list", undefined, keys),
  {
    key: "affiliate-portal:links",
    schema: AsyncResult.Schema({ success: LinkList, error: errors }),
    skipInitialRun: true
  }
)

export const affiliateLinkAtom = Atom.family((linkId: string) =>
  Atom.serializable(ConsoleClient.query("AffiliatePortal.links.get", { linkId }, keys), {
    key: `affiliate-portal:link:${linkId}`,
    schema: AsyncResult.Schema({ success: LinkDetail, error: orGone }),
    skipInitialRun: true
  })
)

/** One link's orders, for its page. */
export const affiliateLinkConversionsAtom = Atom.family((linkId: string) =>
  Atom.serializable(ConsoleClient.query("AffiliatePortal.conversions.list", { linkId, limit: 200 }, keys), {
    key: `affiliate-portal:conversions:${linkId}`,
    schema: AsyncResult.Schema({ success: ConversionList, error: errors }),
    skipInitialRun: true
  })
)

export const affiliateDestinationsAtom = Atom.serializable(
  ConsoleClient.query("AffiliatePortal.links.destinations", undefined, keys),
  {
    key: "affiliate-portal:destinations",
    schema: AsyncResult.Schema({ success: Schema.Array(Destination), error: errors }),
    skipInitialRun: true
  }
)

export const affiliatePayoutsAtom = Atom.serializable(
  ConsoleClient.query("AffiliatePortal.payouts.list", undefined, keys),
  {
    key: "affiliate-portal:payouts",
    schema: AsyncResult.Schema({ success: AffiliatePayouts, error: errors }),
    skipInitialRun: true
  }
)

export const affiliatePayoutAtom = Atom.family((month: string) =>
  Atom.serializable(ConsoleClient.query("AffiliatePortal.payouts.get", { month }, keys), {
    key: `affiliate-portal:payout:${month}`,
    schema: AsyncResult.Schema({ success: AffiliatePayout, error: orGone }),
    skipInitialRun: true
  })
)

export const affiliateResourcesAtom = Atom.serializable(
  ConsoleClient.query("AffiliatePortal.resources", undefined, keys),
  {
    key: "affiliate-portal:resources",
    schema: AsyncResult.Schema({ success: AffiliateResources, error: errors }),
    skipInitialRun: true
  }
)

export const affiliateProfileAtom = Atom.serializable(ConsoleClient.query("AffiliatePortal.profile", undefined, keys), {
  key: "affiliate-portal:profile",
  schema: AsyncResult.Schema({ success: AffiliateProfile, error: errors }),
  skipInitialRun: true
})

export const affiliatePaymentAtom = Atom.serializable(ConsoleClient.query("AffiliatePortal.payment", undefined, keys), {
  key: "affiliate-portal:payment",
  schema: AsyncResult.Schema({ success: AffiliatePayment, error: errors }),
  skipInitialRun: true
})

/** A brand's public partner page, by its slug. */
export const programLandingAtom = Atom.family((program: string) =>
  Atom.serializable(ConsoleClient.query("AffiliateApply.landing", { program }, keys), {
    key: `affiliate-portal:landing:${program}`,
    schema: AsyncResult.Schema({
      success: ProgramLanding,
      error: Schema.Union([NotFound, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  })
)

export const affiliatePortalWrites = {
  createLink: ConsoleClient.mutation("AffiliatePortal.links.create"),
  archiveLink: ConsoleClient.mutation("AffiliatePortal.links.archive"),
  saveProfile: ConsoleClient.mutation("AffiliatePortal.profile.update"),
  savePayment: ConsoleClient.mutation("AffiliatePortal.payment.update"),
  undo: ConsoleClient.mutation("AffiliatePortal.undo"),
  apply: ConsoleClient.mutation("AffiliateApply.apply"),
  reapply: ConsoleClient.mutation("AffiliateApply.reapply")
} as const
