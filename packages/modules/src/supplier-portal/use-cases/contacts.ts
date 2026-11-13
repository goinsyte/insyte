import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { AREA_IDS, type AreaId, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import type { Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { PortalScope, type SupplierContact } from "../domain/Portal.ts"

/*
 * The supplier contacts a person holds (M16 step 1), newest first, read through `supplier_principals()` (0075) before
 * any workspace is chosen: a contact reads no member table, so the lookup is a definer that answers only the caller's
 * own. Each comes as its principal (`supplier_contact`, the supplier as `partnerId`) with no area of the console: the
 * portal's reads and writes are held by the supplier policies, not by a role.
 */

export interface HeldContact {
  readonly principal: Principal
  readonly contact: SupplierContact
}

const KNOWN = new Set<string>(PortalScope.literals)
const LEVELS_OFF = Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, 0>
const SPECIALS_OFF = Object.fromEntries(SPECIAL_IDS.map((s) => [s, false])) as Record<SpecialId, boolean>

interface Row {
  readonly contactId: string
  readonly workspaceId: WorkspaceId
  readonly workspaceName: string
  readonly supplierId: string
  readonly supplierName: string
  readonly contactName: string
  readonly role: "owner" | "staff"
  readonly scopes: ReadonlyArray<string>
}

export const held = Effect.fn("SupplierPortal.held")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const rows = yield* db.forUser((sql) =>
    sql<Row>`
      select contact_id, workspace_id, workspace_name, supplier_id, supplier_name, contact_name, role, scopes
      from supplier_principals()`
  )
  return rows.map((r): HeldContact => ({
    principal: {
      kind: "supplier_contact",
      id: r.contactId,
      userId: user.id,
      workspaceId: r.workspaceId,
      partnerId: r.supplierId,
      role: {
        id: "supplier_contact",
        label: "Leverancier",
        version: 0,
        levels: LEVELS_OFF,
        specials: SPECIALS_OFF,
        refundLimit: null,
        stores: []
      },
      storeScope: []
    },
    contact: {
      contactId: r.contactId,
      contactName: r.contactName,
      role: r.role,
      scopes: ["orders", ...r.scopes.filter((s): s is PortalScope => s !== "orders" && KNOWN.has(s))],
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      workspaceName: r.workspaceName
    }
  }))
})
