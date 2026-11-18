import { AffiliateApplyRpcs } from "@insyte/api/rpc/AffiliateApplyRpcs"
import { AffiliatePortalRpcs } from "@insyte/api/rpc/AffiliatePortalRpcs"
import { AffiliatesRpcs } from "@insyte/api/rpc/AffiliatesRpcs"
import { PORTAL_RESTORE, withAffiliates } from "@insyte/modules/affiliates/lazy"
import { UndoService } from "@insyte/modules/undo/Undo"
import { env } from "cloudflare:workers"
import { Effect } from "effect"

/*
 * Affiliates (M16 steps 3–5): the brand's side, the affiliate's portal and applying. The slice's use cases load with
 * the first call in an isolate, not with the RPC layer (ADR-0041 §3, as `billing.ts`).
 */

type M = Parameters<Parameters<typeof withAffiliates>[0]>[0]
const op = <A, E, R>(f: (o: M["operator"]) => Effect.Effect<A, E, R>) => withAffiliates((m) => f(m.operator))
const ap = <A, E, R>(f: (o: M["applicant"]) => Effect.Effect<A, E, R>) => withAffiliates((m) => f(m.applicant))

/** Where the short links point: the public Worker's host (`/r/:slug`); a local run has none. */
const origin = () => {
  const host = (env as { readonly PUBLIC_API_HOST?: string }).PUBLIC_API_HOST
  return host === undefined || host === "" ? "" : `https://${host}`
}
const po = <A, E, R>(f: (o: M["portal"]) => Effect.Effect<A, E, R>) =>
  withAffiliates((m) => f(m.portal).pipe(Effect.provideService(m.RedirectOrigin, origin())))

export const AffiliatesHandlers = AffiliatesRpcs.toLayer(Effect.succeed(AffiliatesRpcs.of({
  "Affiliates.program": () => op((o) => o.program()),
  "Affiliates.program.update": (input) => op((o) => o.updateProgram(input)),
  "Affiliates.list": (input) => op((o) => o.list(input)),
  "Affiliates.get": ({ affiliateId }) => op((o) => o.get(affiliateId)),
  "Affiliates.setTier": (input) => op((o) => o.setTier(input)),
  "Affiliates.setPaused": (input) => op((o) => o.setPaused(input)),
  "Affiliates.applications.list": (input) => op((o) => o.applications(input)),
  "Affiliates.applications.approve": (input) => op((o) => o.approve(input)),
  "Affiliates.applications.reject": (input) => op((o) => o.reject(input)),
  "Affiliates.proposeCode": ({ name }) => op((o) => o.proposeCode(name)),
  "Affiliates.retryDiscount": ({ affiliateId }) => op((o) => o.retryDiscount(affiliateId)),
  "Affiliates.payouts.list": (input) => op((o) => o.payouts(input)),
  "Affiliates.approvePayouts": (input) => op((o) => o.approvePayouts(input)),
  "Affiliates.markPaid": (input) => op((o) => o.markPaid(input)),
  "Affiliates.invites": () => op((o) => o.invites()),
  "Affiliates.invite": (input) => op((o) => o.invite(input)),
  "Affiliates.invites.resend": ({ invitationId }) => op((o) => o.resendInvite(invitationId)),
  "Affiliates.invites.revoke": ({ invitationId }) => op((o) => o.revokeInvite(invitationId)),
  "Affiliates.inviteLink": () => op((o) => o.inviteLink()),
  "Affiliates.resources.list": () => op((o) => o.resources()),
  "Affiliates.resources.remove": ({ resourceId }) => op((o) => o.removeResource(resourceId))
})))

export const AffiliatePortalHandlers = AffiliatePortalRpcs.toLayer(Effect.gen(function*() {
  const undo = yield* UndoService
  return AffiliatePortalRpcs.of({
    "AffiliatePortal.dashboard": () => po((p) => p.dashboard()),
    "AffiliatePortal.links.list": () => po((p) => p.listLinks()),
    "AffiliatePortal.links.get": ({ linkId }) => po((p) => p.getLink(linkId)),
    "AffiliatePortal.links.destinations": () => po((p) => p.destinations()),
    "AffiliatePortal.links.create": (input) => po((p) => p.createLink(input)),
    "AffiliatePortal.links.archive": ({ linkId }) => po((p) => p.archiveLink(linkId)),
    "AffiliatePortal.conversions.list": (input) => po((p) => p.listConversions(input)),
    "AffiliatePortal.payouts.list": () => po((p) => p.listPayouts()),
    "AffiliatePortal.payouts.get": ({ month }) => po((p) => p.getPayout(month)),
    "AffiliatePortal.resources": () => po((p) => p.resources()),
    "AffiliatePortal.notifications": () => po((p) => p.notifications()),
    "AffiliatePortal.notifications.read": ({ ids }) => po((p) => p.readNotifications(ids)),
    "AffiliatePortal.profile": () => po((p) => p.profile()),
    "AffiliatePortal.profile.update": (input) => po((p) => p.updateProfile(input)),
    "AffiliatePortal.payment": () => po((p) => p.payment()),
    "AffiliatePortal.payment.update": (input) => po((p) => p.updatePayment(input)),
    // Only the portal's own compensation: an affiliate undoes nothing else, whatever token it holds.
    "AffiliatePortal.undo": ({ token }) => undo.undo(token, [PORTAL_RESTORE])
  })
}))

export const AffiliateApplyHandlers = AffiliateApplyRpcs.toLayer(Effect.succeed(AffiliateApplyRpcs.of({
  "AffiliateApply.landing": ({ program }) => ap((a) => a.landing(program)),
  "AffiliateApply.me": () => ap((a) => a.me()),
  "AffiliateApply.apply": (input) => ap((a) => a.apply(input)),
  "AffiliateApply.reapply": (input) => ap((a) => a.reapply(input))
})))
