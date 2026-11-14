import { AccessRpcs } from "@insyte/api/rpc/AccessRpcs"
import { AgentRpcs } from "@insyte/api/rpc/AgentRpcs"
import { AnalyticsRpcs } from "@insyte/api/rpc/AnalyticsRpcs"
import { AuditRpcs } from "@insyte/api/rpc/AuditRpcs"
import { AutomationsRpcs } from "@insyte/api/rpc/AutomationsRpcs"
import { ChargebacksRpcs } from "@insyte/api/rpc/ChargebacksRpcs"
import { ChatsRpcs } from "@insyte/api/rpc/ChatsRpcs"
import { CommerceRpcs } from "@insyte/api/rpc/CommerceRpcs"
import { CostsRpcs } from "@insyte/api/rpc/CostsRpcs"
import { CoursesRpcs } from "@insyte/api/rpc/CoursesRpcs"
import { DataRpcs } from "@insyte/api/rpc/DataRpcs"
import { DeveloperRpcs } from "@insyte/api/rpc/DeveloperRpcs"
import { FirstAnalysisRpcs } from "@insyte/api/rpc/FirstAnalysisRpcs"
import { ForwardingRpcs } from "@insyte/api/rpc/ForwardingRpcs"
import { HomeRpcs } from "@insyte/api/rpc/HomeRpcs"
import { LiveRpcs } from "@insyte/api/rpc/LiveRpcs"
import { MarketingRpcs } from "@insyte/api/rpc/MarketingRpcs"
import { MarketplaceRpcs } from "@insyte/api/rpc/MarketplaceRpcs"
import { MembersRpcs } from "@insyte/api/rpc/MembersRpcs"
import { NotificationsRpcs } from "@insyte/api/rpc/NotificationsRpcs"
import { PrivacyRpcs } from "@insyte/api/rpc/PrivacyRpcs"
import { ProposalsRpcs } from "@insyte/api/rpc/ProposalsRpcs"
import { QualityRpcs } from "@insyte/api/rpc/QualityRpcs"
import { QueueRpcs } from "@insyte/api/rpc/QueueRpcs"
import { ReturnsRpcs } from "@insyte/api/rpc/ReturnsRpcs"
import { RolesRpcs } from "@insyte/api/rpc/RolesRpcs"
import { RunsRpcs } from "@insyte/api/rpc/RunsRpcs"
import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { SettingsDepthRpcs } from "@insyte/api/rpc/SettingsDepthRpcs"
import { SharedRpcs } from "@insyte/api/rpc/SharedRpcs"
import { SheetsRpcs } from "@insyte/api/rpc/SheetsRpcs"
import { ShellRpcs } from "@insyte/api/rpc/ShellRpcs"
import { StoresRpcs } from "@insyte/api/rpc/StoresRpcs"
import { SuppliersRpcs } from "@insyte/api/rpc/SuppliersRpcs"
import { ThreadsRpcs } from "@insyte/api/rpc/ThreadsRpcs"
import { TicketsRpcs } from "@insyte/api/rpc/TicketsRpcs"
import { TrackingRpcs } from "@insyte/api/rpc/TrackingRpcs"
import { TrashRpcs } from "@insyte/api/rpc/TrashRpcs"
import { WorkspacesRpcs } from "@insyte/api/rpc/WorkspacesRpcs"
import { recordedPixelSettings } from "@insyte/integrations-shopify/ShopifyRecorded"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Exit, Redacted } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import expected from "./authz.expected.json" with { type: "json" }
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

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
const COURSE = {
  title: "Authz",
  description: "",
  chapterId: "cch_none",
  moduleId: "cmd_none",
  blocks: [],
  order: "free",
  audience: { kind: "all" },
  suppliers: { kind: "none" },
  deadline: "",
  badge: "star",
  passMark: 80,
  questions: true
}

const PAYLOADS: Record<string, unknown> = {
  "Team.get": undefined,
  "Invitations.send": { rows: [{ email: "geen-adres", roleId: "view", stores: "all" }] },
  "Invitations.sendSupplier": { rows: [{ supplierId: "sup_none", email: "geen-adres", scopes: [] }] },
  "Invitations.supplierAccess": { supplierId: "sup_none" },
  "Invitations.revokeSupplier": { ids: [NONE.id] },
  "Invitations.restoreSupplier": NONE,
  "Invitations.revokeContact": { id: "sct_none" },
  "Invitations.restoreContact": { id: "sct_none" },
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
  // Records that do not exist, or a URL refused after the permission check: nothing is made or sent.
  "Webhooks.list": undefined,
  "Webhooks.deliveries": { endpointId: "whe_none" },
  "Webhooks.delivery": { id: "whd_none" },
  "Webhooks.create": {
    url: "http://plain.example.com/hook",
    description: "",
    events: ["order.cancelled"],
    apiVersion: "2026-10-01",
    stores: "all",
    headers: [],
    retry: 5,
    active: true
  },
  "Webhooks.update": {
    id: "whe_none",
    url: "https://hooks.example.com/x",
    description: "",
    events: ["order.cancelled"],
    apiVersion: "2026-10-01",
    stores: "all",
    headers: [],
    retry: 5,
    active: true
  },
  "Webhooks.setActive": { id: "whe_none", active: false },
  "Webhooks.remove": { id: "whe_none" },
  "Webhooks.revealSecret": { id: "whe_none" },
  "Webhooks.rotateSecret": { id: "whe_none" },
  "Webhooks.sendTest": { id: "whe_none", event: "order.cancelled" },
  "Webhooks.redeliver": { id: "whd_none" },
  "Stores.list": undefined,
  "Stores.syncStatus": { id: "sto_none" },
  "Connections.health": undefined,
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
  "Orders.flagDelayed": { ids: ["ord_none"] },
  "Orders.clearDelay": { ids: ["ord_none"] },
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
  "Suppliers.statements": { supplierId: "sup_none" },
  "Suppliers.statement": { supplierId: "sup_none", month: "2026-01" },
  "Suppliers.markStatementPaid": { id: "sst_none" },
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
  // Analyse (M14 step 2): Analyse · Bekijken; the service role has none. A month far back reads zeros.
  "Analytics.periods": undefined,
  "Analytics.overview": { a: "2026-01", b: "2025-12" },
  "Analytics.charts": { a: "2026-01", b: "2025-12" },
  "Analytics.findings": { a: "2026-01", b: "2025-12" },
  "Analytics.explain": { a: "2026-01", b: "2025-12", key: { _tag: "paid_orders" } },
  "Analytics.records": { explainKey: { a: "2026-01", b: "2025-12", key: { _tag: "paid_orders" } } },
  // Rekenbladen (M14 step 4): Data · Bekijken; the service role has none. Ids that do not exist, so nothing changes;
  // the export also needs Data · Exporteren, which Alleen lezen lacks.
  "Analytics.figures": { requests: [{ metric: "omzet", month: "2026-01" }] },
  "Sheets.list": {},
  "Sheets.counts": undefined,
  "Sheets.folders": undefined,
  "Sheets.get": { id: "sh_none" },
  "Sheets.create": { template: "blank", folderId: "fld_none" },
  "Sheets.saveTabs": { id: "sh_none", baseVersion: 1, tabs: [{ id: "tab_1", name: "Blad1", cells: {}, widths: {} }] },
  "Sheets.update": { ids: ["sh_none"], pinned: true },
  "Sheets.share": { id: "sh_none", memberId: "mem_none", on: true },
  "Sheets.duplicate": { id: "sh_none" },
  "Sheets.remove": { ids: ["sh_none"] },
  "Sheets.restore": { ids: ["sh_none"] },
  "Sheets.markOpened": { id: "sh_none" },
  "Sheets.createFolder": { name: "" },
  "Sheets.export": { id: "sh_none", format: "csv" },
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
  // Settings depth (20.1b): each write is refused after the permission (a link without https, a text file as the
  // logo, erasing on before the saved periods were counted); the count is of other periods than the saved ones.
  "WorkspaceSettings.get": { section: "shipping" },
  "WorkspaceSettings.save": {
    section: "links",
    value: { review: "geen-link", unsubscribe: "", restock: "" },
    baseVersion: 0
  },
  "Shipping.statusCounts": undefined,
  "Templates.linkUsage": undefined,
  "Brand.uploadLogo": { name: "logo.txt", mime: "text/plain", data: "eA==" },
  "Retention.count": { classes: [{ id: "contact", months: 3 }] },
  "Retention.setErasing": { on: true },
  // E-mail en domein (20.1c): a sender that is no address is refused after the permission.
  "SendingDomain.get": undefined,
  "SendingDomain.verify": undefined,
  "SendingDomain.setUp": { name: "geen domein" },
  "SendingDomain.remove": undefined,
  "SendingDomain.saveSenders": { from: "geen-adres", replyTo: "", baseVersion: 0 },
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
  // Courses (M17 step 4): authoring at Cursussen · Bewerken, deleting and wiping progress at Beheren; reading the
  // catalogue and taking a course need no level (a course that is not open is CourseNotOpen, past no gate).
  "Courses.list": undefined,
  "CourseChapters.add": { title: "Authz" },
  "CourseChapters.rename": { id: "cch_none", title: "Authz" },
  "CourseChapters.addModule": { chapterId: "cch_none", title: "Authz" },
  "CourseChapters.renameModule": { id: "cmd_none", title: "Authz" },
  "CourseChapters.reorder": { ids: ["cch_none"] },
  "Courses.create": { title: "Authz", chapterId: "cch_none", moduleId: "cmd_none" },
  "Courses.save": { id: "crs_none", course: COURSE },
  "Courses.publish": { id: "crs_none", course: COURSE },
  "Courses.setStatus": { ids: ["crs_none"], status: "archived" },
  "Courses.duplicate": { id: "crs_none" },
  "Courses.remove": { ids: ["crs_none"] },
  "Courses.restore": { ids: ["crs_none"] },
  "Courses.reorder": { moduleId: "cmd_none", ids: ["crs_none"] },
  "Courses.remind": { courseId: "crs_none", memberId: "mem_none" },
  "CourseProgress.step": { courseId: "crs_none", blockId: "blk_none" },
  "CourseProgress.finish": { courseId: "crs_none" },
  "CourseProgress.retake": { courseId: "crs_none" },
  "CourseProgress.reset": { courseId: "crs_none", memberId: "mem_none" },
  "CourseQuestions.ask": { courseId: "crs_none", text: "Waarom?" },
  "CourseQuestions.answer": { id: "cqs_none", text: "Daarom." },
  // The person's own sessions (M3.3): every role reads and ends its own; an unknown one is NotFound, past no gate.
  "Session.me": undefined,
  "Session.listSessions": undefined,
  "Session.revoke": { id: "ses_none" },
  // The frame and the one search (M5, M11 step 6): every member; a kind or area the role cannot open answers nothing.
  "Shell.frame": { path: "/inbox" },
  "Shell.health": undefined,
  "Nav.counts": { area: "tickets" },
  "Search.records": {
    q: "zeeland",
    kinds: ["order", "customer", "product", "ticket", "thread", "message", "chargeback"]
  },
  // Chargebacks (M13): Bekijken reads, Bewerken changes a case, Beheren accepts. Unknown cases, and a case opened by hand
  // without a customer, are refused past the permission check, so nothing is made.
  "Chargebacks.list": {},
  "Chargebacks.get": { id: "cb_none" },
  "Chargebacks.stats": undefined,
  "Chargebacks.nextCaseNumber": undefined,
  "Chargebacks.createManual": {
    provider: "stripe",
    customer: { name: " " },
    amountMinor: 1000,
    reasonCode: "not_received"
  },
  "Chargebacks.setNote": { id: "cb_none", note: "Iets" },
  "Chargebacks.accept": { ids: ["cb_none"] },
  "Chargebacks.addEvidence": { chargebackId: "cb_none", fileIds: ["fil_none"] },
  "Chargebacks.removeEvidence": { chargebackId: "cb_none", itemId: "evi_none" },
  "Chargebacks.reorderEvidence": { chargebackId: "cb_none", itemIds: ["evi_none"] },
  "Chargebacks.assemblePack": { ids: ["cb_none"] },
  // Kosten (M13 step 5): Analyse · Bekijken to read, `costs.write` to change; a blank name or a line that is not there.
  "Costs.list": {},
  "Costs.figures": { months: ["2026-01"] },
  "Costs.create": { name: "   ", kind: "fixed" },
  "Costs.update": { id: "cost_none", name: "Iets", kind: "fixed" },
  "Costs.setAmount": { lineId: "cost_none", month: "2026-01", amountMinor: 100 },
  "Costs.readFromSource": { id: "cost_none" },
  "Costs.remove": { id: "cost_none" },
  // The Logboek and the Prullenbak (M17 step 20.1a): reading the log at Instellingen · Bekijken, its CSV also with
  // Exporteren; the trash at Bewerken. The ids are in no trash, so nothing is put back or purged; the trash is empty.
  "Audit.list": { category: "settings" },
  "Audit.facets": undefined,
  "Audit.export": { category: "settings" },
  "Trash.list": undefined,
  "Trash.restore": { ids: ["tkt_none"] },
  "Trash.purge": { ids: ["tkt_none"] },
  "Trash.empty": undefined,
  // The Marketplace (M17 step 3): browsing, opening and feedback are every member's; installing, uninstalling and
  // scopes are Koppelingen at Bewerken. A Binnenkort app and an app not installed are refused after the gate.
  "Marketplace.catalog": undefined,
  "Marketplace.installs": undefined,
  "Marketplace.get": { appId: "ext_none" },
  "Marketplace.recommended": undefined,
  "Marketplace.install": { appId: "ext_yotpo" },
  "Marketplace.uninstall": { appId: "ext_zapier" },
  "Marketplace.setScopes": { appId: "ext_zapier", revoked: [] },
  "Marketplace.open": { appId: "ext_zapier" },
  "Marketplace.feedback": { category: "other", message: " " },
  // Live (M14 step 3): the room at Analyse Bekijken; a store's pixel at Instellingen, installed at Beheren (a store
  // that does not exist, so nothing is installed).
  "Live.snapshot": undefined,
  "Live.subscribe": { tab: "authz-tab-0001" },
  "Live.unsubscribe": { tab: "authz-tab-0001" },
  "Live.pixels": undefined,
  "Live.installPixel": { storeId: "store_none" },
  // Insyte AI (M15 step 6): read by every member; a save on a version that is not current is refused as stale (or,
  // for budgets, a person not in the team), and taking back an action that does not exist is `NotFound`.
  "Autonomy.get": {},
  "Autonomy.set": { levels: {}, baseVersion: -1 },
  "Autonomy.resetDefaults": { baseVersion: -1 },
  "AiBudget.get": undefined,
  "AiBudget.setMany": { entries: [{ scope: "mem_none", limit: 10 }] },
  "AgentLog.list": {},
  "AgentLog.counts": undefined,
  "AgentLog.get": { id: "aga_none" },
  "AgentLog.undo": { id: "aga_none" },
  "AgentLog.redo": { id: "aga_none" },
  "AgentLog.compensate": { id: "aga_none" },
  // Je gegevens (M17 step 5): reading at Instellingen · Bewerken; a shopper's package at Exporteren with Klanten ·
  // Bekijken, erasing at Klanten · Beheren, both for an address no shopper has; the export, its schedule and the
  // deletion the owner's alone, the deletion with a name that is not the workspace's and nothing waiting to stop.
  "Privacy.inventory": undefined,
  "Privacy.requests": undefined,
  "Privacy.setExportSchedule": { schedule: "off" },
  "Privacy.requestAccess": { email: "niemand@authz.test" },
  "Privacy.requestErasure": { email: "niemand@authz.test" },
  "Workspaces.requestExport": undefined,
  "Workspaces.requestDeletion": { confirmName: "Niet deze werkruimte" },
  "Workspaces.cancelDeletion": undefined,
  // The Data hub (M14 step 5): Bekijken reads, Importeren (level 2) brings files in and out, an export needs
  // Exporteren (`data.export`); an import that does not exist answers `ImportNotFound`, after the check.
  "Data.overview": undefined,
  "Data.imports.list": undefined,
  "Data.imports.upload": { fileId: "fil_none" },
  "Data.imports.preview": { importId: "imp_none" },
  "Data.imports.rows": { importId: "imp_none" },
  "Data.imports.commit": { importId: "imp_none" },
  "Data.imports.remove": { importId: "imp_none" },
  "Data.imports.restore": { importId: "imp_none" },
  "Data.export": { source: { import: "imp_none" }, columns: ["0"] },
  "Data.exports.list": {},
  "Data.exports.get": { exportId: "exp_none" }
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
  ...AnalyticsRpcs.requests.keys(),
  ...ProposalsRpcs.requests.keys(),
  ...WorkspacesRpcs.requests.keys(),
  ...ChatsRpcs.requests.keys(),
  ...CoursesRpcs.requests.keys(),
  ...SheetsRpcs.requests.keys(),
  ...NotificationsRpcs.requests.keys(),
  ...SessionRpcs.requests.keys(),
  ...ShellRpcs.requests.keys(),
  ...ChargebacksRpcs.requests.keys(),
  ...CostsRpcs.requests.keys(),
  ...AuditRpcs.requests.keys(),
  ...TrashRpcs.requests.keys(),
  ...SettingsDepthRpcs.requests.keys(),
  ...MarketplaceRpcs.requests.keys(),
  ...LiveRpcs.requests.keys(),
  ...AgentRpcs.requests.keys(),
  ...PrivacyRpcs.requests.keys(),
  ...DataRpcs.requests.keys()
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

describe("a member held to some stores", () => {
  // The fence is the principal's `storeScope`: the role's stores narrowed by the member's own. An admin role reaches
  // every store; a member invited for another store only reaches none of this one's orders, in the list, in the hub's
  // counts and in an export, and does not see an export of every store.
  it("reads and exports none of another store's orders", async () => {
    const store = await importedStore("authz-stores")
    const email = `authz-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: ["sto_elsewhere"] }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const held = await join(email)

    expect(ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.length).toBeGreaterThan(0)
    expect(ok(await rpc("Orders.list", { limit: 50 }, held)).rows).toEqual([])
    expect(ok(await rpc("Data.overview", undefined, held)).orders).toBe(0)

    const exportFor = async (cookie: string) => {
      await using runs = await introspectWorkflow(env.EXPORT)
      const asked = ok(await rpc("Data.export", { source: "orders", columns: ["number"] }, cookie))
      await relay(store.workspace)
      const [instance] = await runs.get()
      await instance!.waitForStatus("complete")
      return ok(await rpc("Data.exports.get", { exportId: asked.id }, cookie))
    }
    const theirs = await exportFor(held)
    expect(theirs).toMatchObject({ state: "ready", rowsWritten: 0 })
    const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(
      await (await call(`http://api.test${theirs.fileUrl}`, { headers: { cookie: held } })).arrayBuffer()
    )
    expect(text).toBe("\uFEFFBestelling\r\n")

    // The owner's export of every store is not even listed to them.
    const owners = await exportFor(store.cookie)
    expect(owners.rowsWritten).toBeGreaterThan(0)
    expect(failure(await rpc("Data.exports.get", { exportId: owners.id }, held))).toMatchObject({
      _tag: "ExportNotFound"
    })
    expect(ok(await rpc("Data.exports.list", { mine: false }, held)).rows.map((r) => r.id)).toEqual([theirs.id])

    // A key held to this store sees neither: one export is every store's, the other another store's.
    const token = ok(
      await rpc("ApiKeys.create", {
        label: "Eén winkel",
        access: { kind: "role", roleId: "view" } as never,
        stores: [store.storeId],
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const listed = await call("http://api.public.test/v1/exports", { headers: { authorization: `Bearer ${token}` } })
    expect(listed.status).toBe(200)
    expect((await listed.json() as { data: Array<unknown> }).data).toEqual([])
  }, 240_000)
})

const PUBLIC = "http://api.public.test"
const MCP_VERSION = "2026-07-28"
let mcpId = 0

/** A `/v1` read as a key: the status and the body. */
const v1 = async (token: string, path: string) => {
  const response = await call(`${PUBLIC}/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  // eslint-disable-next-line typescript/no-explicit-any
  return { status: response.status, body: await response.json() as any }
}

/** One MCP tool call as a key: whether it is an error, and the tool's answer. */
const tool = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${PUBLIC}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": MCP_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++mcpId,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MCP_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  // eslint-disable-next-line typescript/no-explicit-any
  const message: any = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  // eslint-disable-next-line typescript/no-explicit-any
  return { isError: message.result.isError as boolean, body: JSON.parse(message.result.content[0].text) as any }
}

/** Asks until `read` answers something, for up to five seconds (a relay's own kick may still be delivering). */
const eventually = async <A>(read: () => Promise<A | undefined>): Promise<A> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const found = await read()
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("never came")
}

const socketFor = async (cookie: string, tab: string) => {
  const response = await call(`http://api.test/api/realtime?tab=${tab}`, { headers: { upgrade: "websocket", cookie } })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const frames: Array<{ type: string; [field: string]: unknown }> = []
  socket.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
  socket.accept()
  return { socket, frames }
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date())

const ADDRESS = {
  country: "NL",
  label: "Nederland",
  address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam",
  carrier: "PostNL" as const,
  name: "Northwind Retouren",
  line1: "Distributieweg 12",
  postcode: "3045 AB",
  city: "Rotterdam"
}

/** A supplier's webhook signature (`t=…,v1=…`), as the supplier signs it. */
const sign = async (secret: string, body: string) => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const t = Math.floor(Date.now() / 1000)
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${body}`))
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

describe("the store fence on every surface", () => {
  // Every read that narrows to stores takes the principal's `storeScope`, never the role's stores alone. Two admins,
  // whose role reaches every store: one invited for another store only (`held`) sees none of this store's rows on
  // Start, in the queue, on a plate, in Live's frames, in Insyte's log, in a record's file, in their notifications, on
  // a supplier's statement or in the store list; one invited for every store (`whole`) sees what the owner sees. A key
  // reaches what its role and its own stores both name, and nobody makes a key, an invitation, a link or a role that
  // reaches past their own stores, or touches one that does.
  let store: Awaited<ReturnType<typeof importedStore>>
  let held = ""
  let whole = ""
  let returnId = ""

  const queueRow = async (cookie: string) =>
    ok(await rpc("Queue.list", { tab: "all" }, cookie)).rows.find((r) => r.subjectId === returnId)

  beforeAll(async () => {
    store = await importedStore("authz-fence")
    const heldEmail = `authz-${run}-fence-held@invited.test`
    const wholeEmail = `authz-${run}-fence-whole@invited.test`
    ok(
      await rpc("Invitations.send", {
        rows: [
          { email: heldEmail, roleId: "admin", stores: ["sto_elsewhere"] },
          { email: wholeEmail, roleId: "admin", stores: "all" }
        ]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    held = await join(heldEmail)
    whole = await join(wholeEmail)

    // A return in review (the twin's orders were delivered on 7 October; 60 days keeps #1002 inside the policy): a
    // queue row and a plate in this store.
    const settings = ok(await rpc("Returns.settings", undefined, store.cookie))
    ok(await rpc("Returns.setSettings", { ...settings, returnDays: 60 }, store.cookie))
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    returnId = ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "too_small",
        requested: "refund"
      }, store.cookie)
    ).returns[0]!.id
    await relay(store.workspace)
  }, 240_000)

  it("keeps the queue's row and its plate from a member held to another store, over RPC", async () => {
    const owners = await eventually(async () => {
      const row = await queueRow(store.cookie)
      return row?.proposal === null ? undefined : row
    })
    const plate = owners.proposal!.id
    expect((await queueRow(whole))?.proposal?.id).toBe(plate)
    expect(ok(await rpc("Proposals.get", { id: plate }, whole)).id).toBe(plate)

    expect(await queueRow(held)).toBeUndefined()
    expect(ok(await rpc("Queue.list", { tab: "drawn" }, held)).rows.map((r) => r.id)).not.toContain(owners.id)
    expect(failure(await rpc("Proposals.get", { id: plate }, held))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Proposals.file", { id: plate }, held))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Queue.markSeen", { id: owners.id }, held))).toMatchObject({ _tag: "NotFound" })
  })

  it("keeps Start's agenda and feed to the member's stores", async () => {
    const agenda = async (cookie: string) =>
      ok(await rpc("Home.agenda", { from: today(), span: "week" }, cookie)).rows.filter((r) => r.kind === "queue")
    const owners = await agenda(store.cookie)
    expect(owners.length).toBeGreaterThan(0)
    expect((await agenda(whole)).map((r) => r.id)).toEqual(owners.map((r) => r.id))
    expect(await agenda(held)).toEqual([])

    const placed = async (cookie: string) =>
      ok(await rpc("Home.activity", { source: "order", limit: 200 }, cookie)).rows.filter((r) =>
        r.action === "order.placed"
      )
    expect(await placed(store.cookie)).toHaveLength(5)
    expect(await placed(whole)).toHaveLength(5)
    expect(await placed(held)).toEqual([])
    const theirs = ok(await rpc("Home.activity", { limit: 200 }, held)).rows
    expect(theirs.some((r) => r.subjectId === returnId || r.subjectType === "order")).toBe(false)
  })

  it("keeps a queue row and a plate from a key whose role or stores reach elsewhere, over /v1 and MCP", async () => {
    const plate = (await queueRow(store.cookie))!.proposal!.id
    // A role that reaches another store only, held by a key for every store: the role narrows the key.
    const role = ok(await rpc("Roles.create", { label: `Elders ${run}`, from: "view" }, store.cookie)).id
    const base = ok(await rpc("Roles.list", undefined, store.cookie)).roles.find((r) => r.id === role)!
    ok(
      await rpc("Roles.update", {
        id: role,
        levels: base.levels,
        specials: base.specials,
        refundLimit: base.refundLimit,
        stores: ["sto_elsewhere"]
      }, store.cookie)
    )
    const keyFor = async (access: { kind: "role"; roleId: string }, stores: "all" | Array<string>, cookie: string) =>
      ok(
        await rpc("ApiKeys.create", {
          label: "Winkelhek",
          access: access as never,
          stores,
          expiresInDays: 30,
          ips: [],
          agent: false
        }, cookie)
      ).secret
    const every = await keyFor({ kind: "role", roleId: "view" }, "all", store.cookie)
    const elsewhere = await keyFor({ kind: "role", roleId: role }, "all", store.cookie)

    const listed = async (token: string) =>
      ((await v1(token, "/queue?tab=all")).body.data as Array<{ subject_id: string }>).map((r) => r.subject_id)
    expect(await listed(every)).toContain(returnId)
    expect(await listed(elsewhere)).not.toContain(returnId)
    expect((await v1(every, `/proposals/${plate}`)).status).toBe(200)
    expect((await v1(elsewhere, `/proposals/${plate}`)).status).toBe(404)

    const mcpListed = async (token: string) => {
      const answer = await tool(token, "list_queue", { tab: "all" })
      expect(answer.isError).toBe(false)
      return (answer.body.data as Array<{ subject_id: string }>).map((r) => r.subject_id)
    }
    expect(await mcpListed(every)).toContain(returnId)
    expect(await mcpListed(elsewhere)).not.toContain(returnId)
    expect((await tool(every, "get_proposal", { proposal_id: plate })).isError).toBe(false)
    expect((await tool(elsewhere, "get_proposal", { proposal_id: plate })).isError).toBe(true)

    // Nobody makes a key past their own stores: the held member's for every store is refused, theirs is not.
    const asHeld = (stores: "all" | Array<string>) =>
      rpc("ApiKeys.create", {
        label: "Te ruim",
        access: { kind: "role", roleId: "view" } as never,
        stores,
        expiresInDays: 30,
        ips: [],
        agent: false
      }, held)
    expect(failure(await asHeld("all"))).toMatchObject({ _tag: "Invalid", fields: { stores: "forbidden" } })
    expect(failure(await asHeld([store.storeId]))).toMatchObject({ _tag: "Invalid", fields: { stores: "forbidden" } })
    const theirs = ok(await asHeld(["sto_elsewhere"])).secret
    expect(await listed(theirs)).not.toContain(returnId)
    expect(await listed(await keyFor({ kind: "role", roleId: "view" }, "all", whole))).toContain(returnId)
  })

  it("sends Live's frames only to the tabs whose member reaches the store", async () => {
    ok(await rpc("Live.installPixel", { storeId: store.storeId }, store.cookie))
    const { ingestKey } = JSON.parse(recordedPixelSettings.get(store.shop)!) as { ingestKey: string }
    const tabs = {
      whole: await socketFor(whole, `tab-fence-whole-${run}`),
      held: await socketFor(held, `tab-fence-held-${run}`)
    }
    for (const t of Object.values(tabs)) {
      for (let i = 0; i < 60 && !t.frames.some((f) => f.type === "hello"); i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    ok(await rpc("Live.subscribe", { tab: `tab-fence-whole-${run}` }, whole))
    ok(await rpc("Live.subscribe", { tab: `tab-fence-held-${run}` }, held))
    const posted = await call(`https://api.public.test/api/public/pixel/${store.storeId}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({
        key: ingestKey,
        type: "page_viewed",
        clientId: "client-fence-1",
        page: "Regenjassen – Winkel",
        source: { utmSource: "facebook", utmMedium: "paid_social" },
        device: "mobiel",
        returning: false
      })
    })
    expect(posted.status).toBe(204)
    await eventually(async () => tabs.whole.frames.find((f) => f.type === "live.visitors"))
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(tabs.held.frames.some((f) => f.type === "live.visitors")).toBe(false)
    expect(ok(await rpc("Live.snapshot", undefined, held)).stores).toEqual([])
    for (const t of Object.values(tabs)) t.socket.close(1000, "done")
  })

  it("keeps Insyte's log of an order in this store from the held member", async () => {
    const policy = ok(await rpc("Autonomy.get", {}, store.cookie))
    ok(await rpc("Autonomy.set", { levels: { AddNote: "auto" }, baseVersion: policy.version }, store.cookie))
    const agent = ok(
      await rpc("ApiKeys.create", {
        label: "Claude",
        access: { kind: "role", roleId: "service" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, store.cookie)
    ).secret
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1003")!
    expect((await tool(agent, "set_order_note", { order_id: order.id, body: "Bel de klant" })).isError).toBe(false)

    const noted = async (cookie: string) =>
      ok(await rpc("AgentLog.list", { action: "AddNote" }, cookie)).rows.filter((r) => r.subject?.id === order.id)
    const [row] = await noted(store.cookie)
    expect(row).toBeDefined()
    expect((await noted(whole)).map((r) => r.id)).toEqual([row!.id])
    expect(await noted(held)).toEqual([])
    expect(ok(await rpc("AgentLog.counts", undefined, held)).total).toBe(0)
    expect(failure(await rpc("AgentLog.get", { id: row!.id }, held))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("AgentLog.get", { id: row!.id }, whole)).id).toBe(row!.id)
  })

  it("serves a leg's packing slip only to who reaches its store", async () => {
    // #1001 is paid and unfulfilled: one leg, to Atelier Noord, which gets an address so the slip is written.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const address = `authz-atelier-${run}@supplier.example`
    ok(await rpc("Suppliers.update", { id: atelier.id, contactEmail: address, forwardEmail: address }, store.cookie))
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await sends.get()
    await instance!.waitForStatus("complete")
    const slip = ok(await rpc("Forwarding.list", { view: "awaiting" }, store.cookie)).rows[0]!.slipFileId!
    const fetched = (cookie: string) => call(`http://api.test/api/files/${slip}`, { headers: { cookie } })
    expect((await fetched(store.cookie)).status).toBe(200)
    expect((await fetched(whole)).status).toBe(200)
    expect((await fetched(held)).status).toBe(404)
  })

  it("fences keys by both their stores and their role's, and keeps keys past the member's stores from them", async () => {
    // A role for this store only, held by a key for every store, reaches it; a key for another store does not.
    const role = ok(await rpc("Roles.create", { label: `Hier ${run}`, from: "view" }, store.cookie)).id
    const base = ok(await rpc("Roles.list", undefined, store.cookie)).roles.find((r) => r.id === role)!
    ok(
      await rpc("Roles.update", {
        id: role,
        levels: base.levels,
        specials: base.specials,
        refundLimit: base.refundLimit,
        stores: [store.storeId]
      }, store.cookie)
    )
    const made = async (access: unknown, stores: "all" | Array<string>) =>
      ok(
        await rpc("ApiKeys.create", {
          label: "Winkelhek",
          access: access as never,
          stores,
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      )
    const queued = async (token: string) =>
      ((await v1(token, "/queue?tab=all")).body.data as Array<{ subject_id: string }>).map((r) => r.subject_id)
    const here = await made({ kind: "role", roleId: role }, "all")
    expect(await queued(here.secret)).toContain(returnId)
    expect(await queued((await made({ kind: "role", roleId: "view" }, ["sto_elsewhere"])).secret)).not.toContain(
      returnId
    )
    const orders = async (token: string) => (await v1(token, "/orders")).body.data as Array<unknown>
    expect(await orders((await made({ kind: "custom", scopes: { orders: 1 } }, [store.storeId])).secret)).toHaveLength(
      5
    )
    expect(await orders((await made({ kind: "custom", scopes: { orders: 1 } }, ["sto_elsewhere"])).secret)).toEqual([])

    // The owner's key for every store is not the held member's to list, rotate, change or revoke.
    const id = here.key.id
    const listed = async (cookie: string) => ok(await rpc("ApiKeys.list", undefined, cookie)).map((k) => k.id)
    expect(await listed(whole)).toContain(id)
    expect(await listed(held)).not.toContain(id)
    const gone = { _tag: "NotFound" }
    expect(failure(await rpc("ApiKeys.rotate", { id, graceMs: 0 }, held))).toMatchObject(gone)
    expect(failure(await rpc("ApiKeys.update", { id, label: "Overgenomen" }, held))).toMatchObject(gone)
    expect(failure(await rpc("ApiKeys.activity", { id }, held))).toMatchObject(gone)
    expect(failure(await rpc("ApiKeys.revoke", { id }, held))).toMatchObject(gone)
    expect(await queued(here.secret)).toContain(returnId)
  })

  it("lets the held member bring in, move or open the way for nobody who reaches past their stores", async () => {
    const forbidden = { _tag: "Invalid", fields: { stores: "forbidden" } }
    const wide = `authz-${run}-fence-wide@invited.test`
    const narrow = `authz-${run}-fence-narrow@invited.test`
    for (const stores of ["all" as const, [store.storeId]]) {
      expect(failure(await rpc("Invitations.send", { rows: [{ email: wide, roleId: "view", stores }] }, held)))
        .toMatchObject({ _tag: "Invalid", fields: { "rows.0.stores": "forbidden" } })
    }
    ok(await rpc("Invitations.send", { rows: [{ email: narrow, roleId: "view", stores: ["sto_elsewhere"] }] }, held))
    const sent = ok(
      await rpc("Invitations.send", { rows: [{ email: wide, roleId: "view", stores: "all" }] }, store.cookie)
    )
    const invitation = sent.invitations.find((i) => i.email === wide)!

    // The wide invitation and the link are shown, but no way in through them.
    const team = ok(await rpc("Team.get", undefined, held))
    expect(team.invitations.find((i) => i.email === wide)!.url).toBeNull()
    expect(team.invitations.find((i) => i.email === narrow)!.url).not.toBeNull()
    expect(team.link.url).toBeNull()
    expect(ok(await rpc("Team.get", undefined, whole)).invitations.find((i) => i.email === wide)!.url).not.toBeNull()
    expect(failure(await rpc("Invitations.setRole", { id: invitation.id, roleId: "service" }, held)))
      .toMatchObject(forbidden)
    const wholeId = ok(await sessionMe(whole)).principals[0]!.id
    expect(failure(await rpc("Members.setRole", { id: wholeId, roleId: "service" }, held))).toMatchObject(forbidden)
    const linkRefused = { _tag: "Invalid", fields: { roleId: "forbidden" } }
    expect(failure(await rpc("InviteLink.set", { enabled: true }, held))).toMatchObject(linkRefused)
    expect(failure(await rpc("InviteLink.regenerate", undefined, held))).toMatchObject(linkRefused)

    // A role they make is held to their stores; one reaching further is not theirs to change, reset or empty.
    const copy = ok(await rpc("Roles.create", { label: `Kopie ${run}`, from: "admin" }, held))
    const mine = copy.roles.roles.find((r) => r.id === copy.id)!
    expect(mine.stores).toEqual(["sto_elsewhere"])
    const draft = (id: string, stores: "all" | Array<string>) => ({
      id,
      levels: mine.levels,
      specials: mine.specials,
      refundLimit: mine.refundLimit,
      stores
    })
    expect(failure(await rpc("Roles.update", draft(copy.id, "all"), held))).toMatchObject(forbidden)
    ok(await rpc("Roles.update", draft(copy.id, ["sto_elsewhere"]), held))
    expect(failure(await rpc("Roles.update", draft("admin", ["sto_elsewhere"]), held))).toMatchObject(forbidden)
    expect(failure(await rpc("Roles.reset", { id: "admin" }, held))).toMatchObject(forbidden)
    expect(failure(await rpc("Roles.remove", { id: copy.id, to: "view" }, held))).toMatchObject(forbidden)

    // What names no store stays theirs: the workspace's roles on Start's feed.
    const feed = ok(await rpc("Home.activity", { limit: 200 }, held)).rows
    expect(feed.some((r) => r.subjectType === "role")).toBe(true)
  })

  it("keeps a ticket's assignment and Insyte's plate on it to who reaches its store; a ticket of no store is everyone's", async () => {
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1004")!
    const ticket = ok(
      await rpc("Tickets.create", { title: "Pakket kwijt", related: { type: "order", id: order.id } }, store.cookie)
    ).tickets[0]!.id
    const loose = ok(await rpc("Tickets.create", { title: "Algemene vraag" }, store.cookie)).tickets[0]!.id
    for (const cookie of [held, whole]) {
      const memberId = ok(await sessionMe(cookie)).principals[0]!.id
      ok(await rpc("Tickets.assign", { id: ticket, memberId }, store.cookie))
    }
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const assigned = async (cookie: string) =>
      ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items.filter((n) =>
        n.kind === "ticket.assigned" && n.subjectId === ticket
      )
    expect(await assigned(whole)).toHaveLength(1)
    expect(await assigned(held)).toEqual([])

    // An agent's call names the ticket only: its plate is the ticket's store's all the same.
    const agent = ok(
      await rpc("ApiKeys.create", {
        label: "Claude tickets",
        access: { kind: "role", roleId: "service" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, store.cookie)
    ).secret
    const ask = async (id: string) => {
      const asked = await tool(agent, "set_ticket_status", { ticket_id: id, status: "in_progress" })
      expect(asked.body).toMatchObject({ object: "agent_proposal" })
      return asked.body.proposal_id as string
    }
    const plate = await ask(ticket)
    expect(ok(await rpc("Proposals.get", { id: plate }, whole)).id).toBe(plate)
    expect(failure(await rpc("Proposals.get", { id: plate }, held))).toMatchObject({ _tag: "NotFound" })
    const open = await ask(loose)
    expect(ok(await rpc("Proposals.get", { id: open }, held)).id).toBe(open)
  })

  it("serves a return's label and a quality photo only to who reaches their store", async () => {
    const settings = ok(await rpc("Returns.settings", undefined, store.cookie))
    ok(await rpc("Returns.setSettings", { ...settings, addresses: [ADDRESS] }, store.cookie))
    ok(await rpc("Returns.approve", { ids: [returnId] }, store.cookie))
    await using labels = await introspectWorkflow(env.RETURN_LABEL)
    ok(await rpc("Returns.sendLabel", { ids: [returnId] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await labels.get()
    await instance!.waitForStatus("complete")
    const label = ok(await rpc("Returns.get", { id: returnId }, store.cookie)).record.label!.fileId!
    const fetched = (file: string, cookie: string) => call(`http://api.test/api/files/${file}`, { headers: { cookie } })
    expect((await fetched(label, whole)).status).toBe(200)
    expect((await fetched(label, held)).status).toBe(404)

    const linen = ok(await rpc("Products.list", {}, store.cookie)).rows.find((p) => p.title === "Linnen overhemd")!
    const { checkId } = ok(
      await rpc("Quality.request", {
        productId: linen.id,
        kind: "batch",
        variants: ["M"],
        deliverables: ["photos"],
        dueAt: Date.now() + 4 * 86_400_000,
        note: "Foto's van de nieuwe batch"
      }, store.cookie)
    )
    const { path } = ok(await rpc("Quality.link", { id: checkId! }, store.cookie))
    const token = decodeURIComponent(new URL(path, "http://console").searchParams.get("k")!)
    const uploaded = await call("http://api.test/api/quality/media", {
      method: "PUT",
      headers: { "content-type": "image/png", "x-check-token": token, "x-file-name": encodeURIComponent("naad.png") },
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    })
    const { id: photo } = await uploaded.json() as { id: string }
    ok(await rpc("QualityLink.submit", { token, fileIds: [photo], by: "Marco" }))
    expect((await fetched(photo, whole)).status).toBe(200)
    expect((await fetched(photo, held)).status).toBe(404)
    await relay(store.workspace)
    const answered = async (cookie: string) =>
      ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items.filter((n) =>
        n.subjectId === checkId
      )
    expect((await answered(whole)).length).toBeGreaterThan(0)
    expect(await answered(held)).toEqual([])
  })

  it("keeps a supplier's statement of this store's lines, and its PDF, from the held member", async () => {
    // #1001's leg (forwarded above) ships, by Atelier Noord's own word, at 18,00 a piece.
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const leg = ok(await rpc("Forwarding.list", { view: "awaiting" }, store.cookie)).rows[0]!
    const { secret } = ok(
      await rpc("Suppliers.connectApi", { id: atelier.id, url: "https://echo.supplier.example/orders" }, store.cookie)
    )
    const body = JSON.stringify({ type: "order.shipped", leg_id: leg.id, carrier: "PostNL", tracking_number: "3SFNC1" })
    const shipped = await call(`http://api.public.test/hooks/supplier/${atelier.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "insyte-signature": await sign(Redacted.value(secret), body) },
      body
    })
    expect(shipped.status).toBe(200)
    ok(await rpc("Products.edit", { id: leg.lines[0]!.productId!, costMinor: 1800 }, store.cookie))
    const rows = async (cookie: string) =>
      ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, cookie)).rows
    expect(await rows(whole)).toHaveLength(1)
    expect(await rows(held)).toEqual([])

    const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" })
      .format(new Date())
    const closed = await call(`http://api.test/api/__dev/statements/close?workspace=${store.workspace}&month=${now}`, {
      method: "POST"
    })
    expect(closed.status).toBe(200)
    const [statement] = await rows(whole)
    expect(statement).toMatchObject({ status: "processing", shippedLines: 1 })
    expect(await rows(held)).toEqual([])
    expect(failure(await rpc("Suppliers.statement", { supplierId: atelier.id, month: now }, held)))
      .toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Suppliers.markStatementPaid", { id: statement!.id! }, held)))
      .toMatchObject({ _tag: "NotFound" })
    const pdf = (cookie: string) =>
      call(`http://api.test/api/files/${statement!.invoiceFileId}`, { headers: { cookie } })
    expect((await pdf(whole)).status).toBe(200)
    expect((await pdf(held)).status).toBe(404)
  })

  it("keeps the store itself, and its shipping counts, from the held member", async () => {
    const ids = async (cookie: string) => ok(await rpc("Stores.list", undefined, cookie)).map((s) => s.id)
    expect(await ids(whole)).toContain(store.storeId)
    expect(await ids(held)).toEqual([])
    ok(await rpc("Stores.syncStatus", { id: store.storeId }, whole))
    expect(failure(await rpc("Stores.syncStatus", { id: store.storeId }, held))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Stores.disconnect", { id: store.storeId }, held))).toMatchObject({ _tag: "NotFound" })
    const counted = async (cookie: string) =>
      Object.values(ok(await rpc("Shipping.statusCounts", undefined, cookie))).reduce((n, c) => n + c, 0)
    expect(await counted(whole)).toBeGreaterThan(0)
    expect(await counted(held)).toBe(0)
  })

  it("keeps a lost store's red row off Start for the held member", async () => {
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    await call(`http://api.test/api/__dev/queue/refresh?workspace=${store.workspace}`, { method: "POST" })
    const lost = async (cookie: string) =>
      ok(await rpc("Home.work", undefined, cookie)).rows.filter((r) => r.kind === "queue")
    expect((await lost(store.cookie)).length).toBeGreaterThan(0)
    expect((await lost(whole)).length).toBeGreaterThan(0)
    expect(await lost(held)).toEqual([])
    expect(ok(await rpc("Home.brief", undefined, whole)).needsYou).toBeGreaterThan(0)
    expect(ok(await rpc("Home.brief", undefined, held)).needsYou).toBe(0)
  })
})
