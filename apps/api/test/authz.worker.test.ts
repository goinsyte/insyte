import { AccessRpcs } from "@insyte/api/rpc/AccessRpcs"
import { AutomationsRpcs } from "@insyte/api/rpc/AutomationsRpcs"
import { ChatsRpcs } from "@insyte/api/rpc/ChatsRpcs"
import { CommerceRpcs } from "@insyte/api/rpc/CommerceRpcs"
import { DeveloperRpcs } from "@insyte/api/rpc/DeveloperRpcs"
import { FirstAnalysisRpcs } from "@insyte/api/rpc/FirstAnalysisRpcs"
import { ForwardingRpcs } from "@insyte/api/rpc/ForwardingRpcs"
import { HomeRpcs } from "@insyte/api/rpc/HomeRpcs"
import { MarketingRpcs } from "@insyte/api/rpc/MarketingRpcs"
import { MembersRpcs } from "@insyte/api/rpc/MembersRpcs"
import { NotificationsRpcs } from "@insyte/api/rpc/NotificationsRpcs"
import { ProposalsRpcs } from "@insyte/api/rpc/ProposalsRpcs"
import { QualityRpcs } from "@insyte/api/rpc/QualityRpcs"
import { QueueRpcs } from "@insyte/api/rpc/QueueRpcs"
import { ReturnsRpcs } from "@insyte/api/rpc/ReturnsRpcs"
import { RolesRpcs } from "@insyte/api/rpc/RolesRpcs"
import { RunsRpcs } from "@insyte/api/rpc/RunsRpcs"
import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { SharedRpcs } from "@insyte/api/rpc/SharedRpcs"
import { ShellRpcs } from "@insyte/api/rpc/ShellRpcs"
import { StoresRpcs } from "@insyte/api/rpc/StoresRpcs"
import { SuppliersRpcs } from "@insyte/api/rpc/SuppliersRpcs"
import { ThreadsRpcs } from "@insyte/api/rpc/ThreadsRpcs"
import { TicketsRpcs } from "@insyte/api/rpc/TicketsRpcs"
import { TrackingRpcs } from "@insyte/api/rpc/TrackingRpcs"
import { WorkspacesRpcs } from "@insyte/api/rpc/WorkspacesRpcs"
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
  "Customers.syncToMarketing": {
    ids: ["cus_none"],
    listId: "LIST_VIP",
    listName: "VIP",
    withTags: false,
    dryRun: true
  },
  "Suppliers.list": {},
  "Suppliers.get": { id: "sup_none" },
  // An invalid name: refused after the permission check, so nothing is made.
  "Suppliers.create": { name: " ", contactEmail: "", contactPhone: "", description: "" },
  "Suppliers.update": { id: "sup_none", name: "Iets" },
  "Suppliers.setPaused": { ids: ["sup_none"], paused: true },
  "Suppliers.assignProducts": { supplierId: "sup_none", productIds: ["prd_none"] },
  "Suppliers.remove": { id: "sup_none" },
  "Suppliers.connectApi": { id: "sup_none", url: "https://echo.supplier.example" },
  "Suppliers.disconnectApi": { id: "sup_none" },
  "Suppliers.testConnection": { id: "sup_none" },
  "Forwarding.list": { view: "to_forward" },
  "Forwarding.forOrder": { orderId: "ord_none" },
  "Forwarding.forward": { ids: ["fwd_none"] },
  "Forwarding.markConfirmed": { ids: ["fwd_none"] },
  "Forwarding.reroute": { id: "fwd_none", toSupplierId: "sup_none" },
  "Forwarding.cancel": { ids: ["fwd_none"] },
  "Returns.list": {},
  "Returns.get": { id: "ret_none" },
  "Returns.returnable": { orderId: "ord_none" },
  "Returns.start": {
    orderId: "ord_none",
    lines: [{ lineId: "oli_none", qty: 1 }],
    reasonId: "too_small",
    requested: "refund"
  },
  "Returns.approve": { ids: ["ret_none"] },
  "Returns.reject": { ids: ["ret_none"], reason: "Buiten de termijn" },
  "Returns.reopen": { id: "ret_none" },
  "Returns.assign": { ids: ["ret_none"], memberId: null },
  "Returns.sendLabel": { ids: ["ret_none"] },
  "Returns.addTracking": { id: "ret_none", carrier: "PostNL", tracking: "3S123456" },
  "Returns.markReceived": { id: "ret_none" },
  "Returns.inspect": { id: "ret_none" },
  "Returns.resolve": { id: "ret_none", resolution: "refund", refundId: "rfd_00000000000000000000000000" },
  "Returns.retryResolution": { id: "ret_none" },
  "Returns.settings": undefined,
  // Two reasons under one id: refused after the permission check, so the policy stays as it is.
  "Returns.setSettings": {
    returnDays: 30,
    claimDays: 60,
    specialWindows: [],
    reasons: [
      { id: "too_small", label: "Te klein", claim: false, photoRequired: false, quality: false, windowDays: null },
      { id: "too_small", label: "Te klein", claim: false, photoRequired: false, quality: false, windowDays: null }
    ],
    rules: [],
    offered: ["refund"],
    giftCardBonusPct: 10,
    exchangeFeeMinor: 0,
    addresses: [],
    claimSteps: [],
    rejectReasons: [],
    portal: { on: false, handle: "x", intro: "", done: "" }
  },
  "Orders.tracking": { orderId: "ord_none" },
  // Automations (M12 step 1): Bekijken reads, Bewerken drafts, Beheren pauses and removes; publishing is its own right.
  "Automations.list": {},
  "Automations.get": { id: "auto_none" },
  "Automations.versions": { id: "auto_none" },
  "Automations.fields": { triggerVariant: "trigger.order_placed" },
  "Automations.recommended": undefined,
  "Automations.create": { templateId: "tpl_none" },
  "Automations.saveDraft": { id: "auto_none", nodes: [] },
  "Automations.duplicate": { id: "auto_none" },
  "Automations.remove": { id: "auto_none" },
  "Automations.restore": { id: "auto_none" },
  "Automations.publish": { id: "auto_none", note: "" },
  "Automations.setStatus": { id: "auto_none", status: "paused" },
  "Automations.updateSettings": { id: "auto_none" },
  "Automations.test": { id: "auto_none" },
  "Runs.list": {},
  "Runs.get": { id: "run_none" },
  "Runs.stats": { automationId: "auto_none", days: 30 },
  "Runs.records": { automationId: "auto_none" },
  "Runs.rerun": { id: "run_none" },
  "Runs.cancel": { id: "run_none" },
  "Runs.approve": { id: "run_none", stepId: "n1" },
  "Runs.decline": { id: "run_none", stepId: "n1" },
  "Tickets.list": {},
  "Tickets.get": { id: "tkt_none" },
  "Tickets.options": undefined,
  // An empty title: refused after the permission check, so no ticket is made and no number spent.
  "Tickets.create": { title: "   " },
  "Tickets.duplicate": { id: "tkt_none" },
  "Tickets.update": { ids: ["tkt_none"], priority: "high" },
  "Tickets.setStatus": { ids: ["tkt_none"], status: "done" },
  "Tickets.assign": { id: "tkt_none", memberId: "mem_none" },
  "Tickets.unassign": { id: "tkt_none", memberId: "mem_none" },
  "Tickets.archive": { ids: ["tkt_none"] },
  "Tickets.spam": { ids: ["tkt_none"] },
  // Klantenservice · Beheren: the service role has it.
  "Tickets.trash": { ids: ["tkt_none"] },
  "Tickets.snooze": { ids: ["tkt_none"], until: 4_102_444_800_000 },
  "Tickets.putBack": { ids: ["tkt_none"] },
  "Tickets.reorder": { ids: ["tkt_none"] },
  "Tickets.watch": { id: "tkt_none" },
  "Tickets.unwatch": { id: "tkt_none" },
  "Tickets.comment": { id: "tkt_none", body: "x" },
  "Threads.list": {},
  "Threads.get": { id: "thr_none" },
  "Threads.markRead": { ids: ["thr_none"], read: true },
  "Threads.star": { id: "thr_none", starred: true },
  "Threads.label": { id: "thr_none", label: "x", on: true },
  "Threads.archive": { ids: ["thr_none"] },
  "Threads.spam": { ids: ["thr_none"] },
  "Threads.trash": { ids: ["thr_none"] },
  "Threads.snooze": { ids: ["thr_none"], until: 4_102_444_800_000 },
  "Threads.putBack": { ids: ["thr_none"] },
  "Threads.assign": { id: "thr_none", memberId: "mem_none" },
  "Threads.unassign": { id: "thr_none" },
  "Threads.linkTicket": { threadId: "thr_none" },
  "Threads.reply": { threadId: "thr_none", body: "   " },
  "Threads.forward": { threadId: "thr_none", to: "iemand@voorbeeld.nl" },
  "Threads.compose": { to: "iemand@voorbeeld.nl", subject: "x", body: "   " },
  "Mailboxes.list": undefined,
  "Mailboxes.connect": { provider: "gmail", address: "support@voorbeeld.nl", label: "Support" },
  "Mailboxes.disconnect": { id: "mbx_none" },
  "Mailboxes.setDefault": { id: "mbx_none" },
  "Mailboxes.setSignature": { id: "mbx_none", signature: "" },
  "Quality.list": { productId: "prd_none" },
  "Quality.request": {
    productId: "prd_none",
    kind: "batch",
    variants: [],
    deliverables: ["photos"],
    dueAt: Date.now() + 86_400_000
  },
  "Quality.approve": { id: "qc_none" },
  "Quality.reject": { id: "qc_none", note: "Naad", watch: false },
  "Quality.setPhase": { productId: "prd_none", phase: "watch" },
  "Quality.link": { id: "qc_none" },
  "Queue.list": {},
  "Queue.markSeen": { id: "qi_none" },
  "Queue.reopen": { id: "qi_none" },
  "Home.brief": {},
  "Home.widgets": { ids: ["orders"], range: 30 },
  "Home.revenueBreakdown": { range: 30 },
  "Home.work": {},
  "Home.agenda": { from: "2026-11-11", span: "week" },
  "Home.activity": {},
  "Proposals.get": { id: "prp_none" },
  "Proposals.file": { id: "prp_none" },
  "Proposals.discard": { id: "prp_none" },
  "Proposals.redraw": { id: "prp_none" },
  "Workspaces.getAccount": undefined,
  // Each write is refused after the permission check (an empty name, no hours, an unknown period or language), so the
  // workspace keeps its settings.
  "Workspaces.saveAccount": { name: " ", legalEntity: "", vatNumber: "", billingEmail: "", country: "NL" },
  "Workspaces.setAlerts": { delayHours: 0, disputeAmountMinor: 0 },
  "Workspaces.setRetention": { days: 7 },
  "Workspaces.getRegional": undefined,
  "Workspaces.getSecurity": undefined,
  "Workspaces.saveRegional": {
    language: "xx",
    currencyDisplay: "EUR",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
    weekStart: "mon",
    timezone: "Europe/Amsterdam"
  },
  "Chats.list": undefined,
  "Chats.messages": { conversationId: "cnv_none" },
  "Chats.thread": { messageId: "msg_none" },
  "Chats.pinnedMessages": { conversationId: "cnv_none" },
  "Chats.members": { conversationId: "cnv_none" },
  "Chats.send": { conversationId: "cnv_none", body: "x" },
  "Chats.editMessage": { messageId: "msg_none", body: "x" },
  "Chats.deleteMessage": { messageId: "msg_none" },
  "Chats.react": { messageId: "msg_none", emoji: "👍", on: true },
  "Chats.pinMessage": { messageId: "msg_none", pinned: true },
  "Chats.pin": { conversationId: "cnv_none", pinned: true },
  "Chats.mute": { conversationId: "cnv_none", muted: true },
  "Chats.markRead": { conversationId: "cnv_none" },
  "Chats.typing": { conversationId: "cnv_none" },
  // A blank name: Invalid past the permission check, so nothing is made.
  "Chats.createChannel": { name: "   " },
  "Chats.openDm": { memberId: "mem_none" },
  "Chats.openSupplierChannel": { supplierId: "sup_none" },
  "Chats.runCommand": { conversationId: "cnv_none", command: "note", arg: "x" },
  "Chats.confirmAction": { actionId: "cha_none" },
  "Chats.declineAction": { actionId: "cha_none" },
  "Chats.undoAction": { actionId: "cha_none" },
  // Each member's own notifications (M5.2, M11 step 13.5): every role, nobody else's rows; unknown kinds are refused.
  "Notifications.list": { tab: "inbox", cursor: null },
  "Notifications.counts": undefined,
  "Notifications.setRead": { ids: ["note_none"], read: true },
  "Notifications.markAllRead": undefined,
  "Notifications.clear": { ids: ["note_none"] },
  "Notifications.restore": { ids: ["note_none"] },
  "Notifications.snooze": { ids: ["note_none"], until: Date.now() + 3_600_000 },
  "Notifications.prefs": undefined,
  "Notifications.setPref": { kind: "geen.soort", app: true },
  "Notifications.setPrefs": {
    events: { "geen.soort": { app: true, email: false, push: false, slack: false, onlyMine: false } },
    quiet: { on: true, from: "22:00", to: "07:00", weekend: false },
    digest: { on: true, at: "08:00" },
    follow: { assigned: true, mentioned: true, created: true },
    slackChannel: null
  },
  // Push and Slack (M11 step 13.5b): every role keeps its own browsers and picks its own channel; connecting the
  // workspace's Slack, and letting it go, is a manager's (settings level 3).
  "Notifications.pushDevices": undefined,
  "Notifications.subscribePush": {
    endpoint: "https://push.test/authz",
    keys: { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) },
    label: "Authz"
  },
  "Notifications.unsubscribePush": { id: "psub_none" },
  "Notifications.testPush": undefined,
  "Notifications.slackChannels": undefined,
  "Notifications.beginSlackConnect": { returnPath: "/settings/notifications" },
  "Notifications.disconnectSlack": undefined,
  // The person's own sessions (M3.3): every role reads and ends its own; an unknown one is NotFound, past no gate.
  "Session.me": undefined,
  "Session.listSessions": undefined,
  "Session.revoke": { id: "ses_none" },
  // The frame and the one search (M5, M11 step 6): every member; a kind or area the role cannot open answers nothing.
  "Shell.frame": { path: "/inbox" },
  "Nav.counts": { area: "tickets" },
  "Search.records": { q: "zeeland", kinds: ["order", "customer", "product", "ticket", "thread", "message"] }
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
  ...MarketingRpcs.requests.keys(),
  ...SuppliersRpcs.requests.keys(),
  ...ForwardingRpcs.requests.keys(),
  ...TrackingRpcs.requests.keys(),
  ...ReturnsRpcs.requests.keys(),
  ...TicketsRpcs.requests.keys(),
  ...AutomationsRpcs.requests.keys(),
  ...RunsRpcs.requests.keys(),
  ...ThreadsRpcs.requests.keys(),
  ...QualityRpcs.requests.keys(),
  ...QueueRpcs.requests.keys(),
  ...HomeRpcs.requests.keys(),
  ...ProposalsRpcs.requests.keys(),
  ...WorkspacesRpcs.requests.keys(),
  ...ChatsRpcs.requests.keys(),
  ...NotificationsRpcs.requests.keys(),
  ...SessionRpcs.requests.keys(),
  ...ShellRpcs.requests.keys()
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
