import { AccessRpcs } from "@insyte/api/rpc/AccessRpcs"
import { CommerceRpcs } from "@insyte/api/rpc/CommerceRpcs"
import { DeveloperRpcs } from "@insyte/api/rpc/DeveloperRpcs"
import { FirstAnalysisRpcs } from "@insyte/api/rpc/FirstAnalysisRpcs"
import { MarketingRpcs } from "@insyte/api/rpc/MarketingRpcs"
import { MembersRpcs } from "@insyte/api/rpc/MembersRpcs"
import { RolesRpcs } from "@insyte/api/rpc/RolesRpcs"
import { SharedRpcs } from "@insyte/api/rpc/SharedRpcs"
import { StoresRpcs } from "@insyte/api/rpc/StoresRpcs"
import { Exit } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import expected from "./authz.expected.json" with { type: "json" }
import { join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * The authorisation matrix (07 §3.4, step 5.4): every team, invitation, access, roles and API-key RPC as each of the five system
 * roles, against the committed table (`authz.expected.json`). A call is denied when the server answers `Forbidden`;
 * anything else (an answer, `NotFound`, `Invalid`) is allowed. Payloads name records that do not exist where a write
 * would change the workspace, so the run leaves it as it found it. A permission change is a reviewed diff of that table,
 * and an RPC added to these groups without a row fails here.
 */

type Role = "owner" | "admin" | "service" | "finance" | "view"
const ROLES: ReadonlyArray<Role> = ["owner", "admin", "service", "finance", "view"]
const table = expected as Record<string, Record<Role, "allow" | "deny">>

const NONE = { id: "inv_00000000000000000000000000" }
const PAYLOADS: Record<string, unknown> = {
  "Team.get": undefined,
  "Invitations.send": { rows: [{ email: "geen-adres", roleId: "view", stores: "all" }] },
  "Invitations.revoke": { ids: [NONE.id] },
  "Invitations.restore": NONE,
  "Invitations.resend": NONE,
  "Invitations.undoResend": NONE,
  "Invitations.setRole": { id: NONE.id, roleId: "view" },
  "InviteLink.set": { days: 7 },
  "InviteLink.regenerate": undefined,
  "InviteLink.undoRegenerate": undefined,
  "Members.setRole": { id: "mem_none", roleId: "view" },
  "Members.deactivate": { id: "mem_none" },
  "Members.reactivate": { id: "mem_none" },
  "Members.remove": { id: "mem_none" },
  "Members.restore": { id: "mem_none" },
  "Access.mine": undefined,
  "Access.request": { area: "team", level: 3 },
  "Access.withdraw": { id: "acr_none" },
  "Access.list": undefined,
  "Access.grant": { id: "acr_none" },
  "Access.decline": { id: "acr_none" },
  "Roles.list": undefined,
  "Roles.create": { label: "", from: null },
  "Roles.update": { id: "rol_none", levels: {}, specials: {}, refundLimit: null, stores: "all" },
  "Roles.rename": { id: "rol_none", label: "Iets" },
  "Roles.reset": { id: "rol_none" },
  "Roles.remove": { id: "rol_none", to: "view" },
  "Roles.restore": { id: "rol_none" },
  "ApiKeys.list": undefined,
  "ApiKeys.activity": { id: "key_none" },
  "ApiKeys.create": {
    label: "",
    access: { kind: "role", roleId: "view" },
    stores: "all",
    expiresInDays: 30,
    ips: [],
    agent: false
  },
  "ApiKeys.update": { id: "key_none", label: "Iets" },
  "ApiKeys.rotate": { id: "key_none", graceMs: 0 },
  "ApiKeys.endGrace": { id: "key_none" },
  "ApiKeys.revoke": { id: "key_none" },
  "ApiKeys.restore": { id: "key_none" },
  "ApiKeys.endpoints": undefined,
  "Stores.list": undefined,
  "Stores.syncStatus": { id: "sto_none" },
  "Stores.beginConnect": { shopDomain: "missing-shop", returnPath: "/" },
  "Stores.disconnect": { id: "sto_none" },
  "Orders.list": {},
  "Orders.get": { id: "ord_none" },
  "Orders.tags": undefined,
  "Orders.tag": { ids: ["ord_none"], add: ["x"], remove: [] },
  "Orders.markFulfilled": { ids: ["ord_none"] },
  "Orders.updateShipping": {
    id: "ord_none",
    address: { line1: "Straat 1", line2: null, city: "Stad", postcode: "1000 AA", region: "", country: "NL" }
  },
  "Orders.cancel": { ids: ["ord_none"], restock: true, notify: false },
  "Orders.setNote": { id: "ord_none", body: "x" },
  "Orders.refund": { id: "ord_none", refundId: "rfd_00000000000000000000000000", amountMinor: 100 },
  "Products.list": {},
  "Products.get": { id: "prd_none" },
  "Products.edit": { id: "prd_none", title: "x" },
  "Products.setStatus": { ids: ["prd_none"], status: "draft" },
  "Products.reprice": { ids: ["prd_none"], targetMargin: 0.5, apply: false },
  "Products.sync": { id: "prd_none" },
  "Customers.list": {},
  "Customers.get": { id: "cus_none" },
  "Customers.tag": { ids: ["cus_none"], add: ["x"], remove: [] },
  // A workspace without a store: `Conflict` for every role that may, never a customer made.
  "Customers.create": { name: "Iemand", email: "iemand@example.com", phone: "", country: "", tags: [] },
  "Customers.merge": { survivorId: "cus_none", ids: ["cus_other"] },
  "Customers.duplicates": undefined,
  "Customers.markNotDuplicate": { key: "cus_none,cus_other" },
  "FirstAnalysis.get": undefined,
  "FirstAnalysis.start": undefined,
  "FirstAnalysis.prepare": { ids: ["agent"], answers: { fulfilment: "one", reply: "ask" } },
  // A token nobody holds: `NotFound` for every role; the compensation's own permission is the command's.
  "Shared.undo": { token: "und_none" },
  // No Klaviyo in this workspace: `Conflict` for every role that may; connecting needs the app (the twin has it).
  "Marketing.status": undefined,
  "Marketing.beginConnect": { returnPath: "/customers" },
  "Marketing.disconnect": undefined,
  "Customers.marketingLists": undefined,
  "Customers.syncToMarketing": { ids: ["cus_none"], listId: "LIST_VIP", listName: "VIP", withTags: false, dryRun: true }
}

const manifest = [
  ...MembersRpcs.requests.keys(),
  ...AccessRpcs.requests.keys(),
  ...RolesRpcs.requests.keys(),
  ...DeveloperRpcs.requests.keys(),
  ...StoresRpcs.requests.keys(),
  ...CommerceRpcs.requests.keys(),
  ...FirstAnalysisRpcs.requests.keys(),
  ...SharedRpcs.requests.keys(),
  ...MarketingRpcs.requests.keys()
]

describe("the authorisation matrix", () => {
  const cookies = {} as Record<Role, string>

  beforeAll(async () => {
    const owner = await person("authz-owner", "Authz Co.")
    cookies.owner = owner.cookie
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const colleagues = (["admin", "service", "finance", "view"] as const).map((role) => ({
      role,
      email: `authz-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const c of colleagues) cookies[c.role] = await join(c.email)
  }, 120_000)

  it("has a row for every RPC in the team, access, roles and API-key groups, and a payload for each", () => {
    expect([...manifest].sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(PAYLOADS).sort()).toEqual(Object.keys(table).sort())
  })

  for (const name of Object.keys(table)) {
    it.each(ROLES)(`${name} as %s`, async (role) => {
      const exit = await rpc(name as never, PAYLOADS[name] as never, cookies[role])
      const forbidden = Exit.isFailure(exit) &&
        exit.cause.reasons.some((r) => r._tag === "Fail" && (r.error as { _tag?: string })._tag === "Forbidden")
      expect(forbidden ? "deny" : "allow").toBe(table[name]![role])
    })
  }
})
