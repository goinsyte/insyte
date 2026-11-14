import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser } from "@insyte/domain/Session"
import { type CurrentSupplierContact, NotSupplierContact } from "@insyte/modules/supplier-portal/domain/Portal"
import { RpcMiddleware } from "effect/rpc"

/**
 * The signed-in person → their supplier contact for one brand (M16 step 2): the principal (`supplier_contact`, its
 * supplier as `partnerId`) and the contact beside it. The newest contact the person holds, until the session names
 * another. `NotSupplierContact` when they hold none, or it was revoked: the portal's pages are then not there.
 */
export class SupplierContact extends RpcMiddleware.Service<SupplierContact, {
  provides: CurrentPrincipal | CurrentSupplierContact
  requires: CurrentUser | Db
}>()("api/SupplierContact", { error: NotSupplierContact }) {}
