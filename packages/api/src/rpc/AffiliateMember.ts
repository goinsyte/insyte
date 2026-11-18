import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser } from "@insyte/domain/Session"
import { type CurrentAffiliate, NotAffiliate } from "@insyte/modules/affiliates/domain/Affiliates"
import { RpcMiddleware } from "effect/rpc"

/**
 * The signed-in person → their affiliate for one brand (M16 step 3): the principal (`affiliate`, its own row as
 * `partnerId`) and the affiliate beside it. The newest the person holds. `NotAffiliate` when they hold none: an
 * applicant who waits or was turned down reads only `AffiliateApply`.
 */
export class AffiliateMember extends RpcMiddleware.Service<AffiliateMember, {
  provides: CurrentPrincipal | CurrentAffiliate
  requires: CurrentUser | Db
}>()("api/AffiliateMember", { error: NotAffiliate }) {}
