import { members as seedMembers, presenceById } from "../../data-source";
import { byScenario, longEmail, longName } from "../../data-source";
import { suppliers } from "../../data-source";
import type { PlanTier } from "../stores/settings-store";
import { appHref } from "../../data-source/hrefs";
import { DAY, type Invite, type InviteLink, type MemberMeta, PORTAL_SCOPES, type StoreAccess } from "./team-core";

/**
 * The people around a workspace who are not yet in it, and the workspaces around the person.
 *
 * A pending invitation is its own record here, not a member with a flag: it holds the role it will
 * grant, the stores it opens, who sent it and when it lapses, and it takes a seat until it is
 * accepted or lapses. Members keep living in the workspace store, where every other screen reads
 * them; what the team page adds to a member (which stores, who brought them in, deactivated) sits
 * beside it in `memberMeta`, keyed by the member's id.
 */

export { DAY, EMAIL, PORTAL_SCOPES, type Invite, type InviteLink, isExpired, LINK_DAYS, type MemberMeta, nameFromEmail, type StoreAccess, token } from "./team-core";
/** Seats per plan, as Billing prices them. */
export const PLAN_SEATS: Record<PlanTier, number> = { starter: 3, growth: 6, scale: 12 };

export const inviteUrl = (id: string) => `${typeof window === "undefined" ? "https://app.insyte.nl" : window.location.origin}${appHref(`/invitations/${id}`)}`;

/* ── seeds ───────────────────────────────────────────────────────────────────────────────────── */

const now = Date.now();

/** When each seeded member came in and through whom, so every row can say it. */
const JOINED: Record<string, { at: string; by?: string; stores?: StoreAccess }> = {
	mem_elena: { at: "2024-08-12T10:00:00Z" },
	mem_sofia: { at: "2024-09-02T09:00:00Z", by: "mem_elena" },
	mem_ethan: { at: "2024-10-14T09:00:00Z", by: "mem_elena", stores: ["store_us", "store_eu"] },
	mem_liam: { at: "2025-01-20T09:00:00Z", by: "mem_ethan" },
	mem_maya: { at: "2025-04-07T09:00:00Z", by: "mem_sofia", stores: ["store_eu"] },
};

export function seedMemberMeta(): Record<string, MemberMeta> {
	const out: Record<string, MemberMeta> = {};
	for (const [i, m] of seedMembers.entries()) {
		if (m.status !== "active") continue;
		const j = JOINED[m.id];
		out[m.id] = {
			stores: j?.stores ?? "all",
			invitedBy: j?.by ?? (i === 0 ? undefined : "mem_elena"),
			joinedAt: j ? Date.parse(j.at) : now - (40 + i * 9) * DAY,
			lastSeen: now - ({ online: 2, away: 18, offline: 20 * 60 }[presenceById[m.id] ?? "offline"] + i * 37) * 60_000,
		};
	}
	return out;
}

const SETTLED_INVITES: Invite[] = [
	{
		id: "inv_nieuw",
		memberId: "mem_amber",
		email: "amber@northwindclothing.co",
		roleId: "service",
		stores: ["store_us", "store_eu"],
		message: "Begin met de tickets die aan jou zijn toegewezen, Sofía loopt de eerste week met je mee.",
		invitedBy: "mem_sofia",
		sentAt: now - 2 * DAY,
		expiresAt: now + 5 * DAY,
		resent: 0,
	},
	{
		id: "inv_jonas",
		email: "jonas.vermeulen@northwindclothing.co",
		roleId: "finance",
		stores: "all",
		invitedBy: "mem_elena",
		sentAt: now - 10 * DAY,
		expiresAt: now - 3 * DAY,
		resent: 1,
	},
];

function busyInvites(): Invite[] {
	return [
		SETTLED_INVITES[0]!,
		...Array.from({ length: 6 }, (_, i): Invite => ({
			id: `inv_busy_${i}`,
			email: longEmail(i + 40),
			roleId: (["service", "view", "finance", "admin"] as const)[i % 4]!,
			stores: i % 3 === 0 ? "all" : ["store_eu"],
			invitedBy: i % 2 ? "mem_sofia" : "mem_elena",
			sentAt: now - (i + 1) * DAY,
			// The plan is full in this week: one more is waiting and the rest have lapsed unanswered.
			expiresAt: i === 0 ? now + 6 * DAY : now - i * DAY,
			resent: i % 2,
		})),
	];
}

export const seedInvites = (): Invite[] => byScenario({ empty: [], settled: SETTLED_INVITES, busy: busyInvites });

export const seedLink = (): InviteLink => ({
	enabled: byScenario({ empty: false, settled: true }),
	token: "nw7k2q9d",
	roleId: "view",
	days: 7,
	createdAt: now - 2 * DAY,
	joined: byScenario({ empty: 0, settled: 1, busy: () => 14 }),
});

/* ── workspaces around the person ────────────────────────────────────────────────────────────── */

export type Workspace = {
	id: string;
	name: string;
	/** Your role in it. */
	role: string;
	members: number;
	plan: string;
	/** You own it, so you cannot leave it without handing it over first. */
	own: boolean;
	/** The demo only has one workspace's data: every other one shows it under its own name. */
	home?: boolean;
};

export type WorkspaceInvite = {
	id: string;
	workspace: string;
	invitedBy: string;
	role: string;
	members: number;
	plan: string;
	sentAt: number;
};

export const HOME_WORKSPACE = "ws_northwind";

const HOME: Workspace = { id: HOME_WORKSPACE, name: "Northwind Clothing Co.", role: "Eigenaar", members: 6, plan: "Scale", own: true, home: true };

export const seedWorkspaces = (): Workspace[] =>
	byScenario({
		empty: [HOME],
		settled: [HOME, { id: "ws_hart", name: "Hart & Co. Agency", role: "Beheerder", members: 4, plan: "Growth", own: false }],
		busy: () => [
			HOME,
			{ id: "ws_hart", name: "Hart & Co. Agency", role: "Beheerder", members: 4, plan: "Growth", own: false },
			{ id: "ws_busy_1", name: `Studio ${longName(3)} Collectief`, role: "Alleen lezen", members: 27, plan: "Scale", own: false },
			{ id: "ws_busy_2", name: "Brinkman-Hoogendoorn Retail Group Benelux", role: "Financiën", members: 41, plan: "Scale", own: false },
		],
	});

export const seedWorkspaceInvites = (): WorkspaceInvite[] =>
	byScenario({
		empty: [],
		settled: [{ id: "winv_kestrel", workspace: "Kestrel Goods", invitedBy: "Noor Visser", role: "Beheerder", members: 3, plan: "Starter", sentAt: now - 5 * 3_600_000 }],
		busy: () => [
			{ id: "winv_kestrel", workspace: "Kestrel Goods", invitedBy: "Noor Visser", role: "Beheerder", members: 3, plan: "Starter", sentAt: now - 5 * 3_600_000 },
			{ id: "winv_busy", workspace: "Vanderhaeghen-Moerman Webwinkels en Fulfilment", invitedBy: longName(5), role: "Klantenservice", members: 18, plan: "Growth", sentAt: now - 2 * DAY },
		],
	});

/* ── the supplier portal ─────────────────────────────────────────────────────────────────────── */

export type PortalStatus = "active" | "invited" | "none";

export type PortalAccess = {
	status: PortalStatus;
	email: string;
	contact?: string;
	scopes: string[];
	sentAt?: number;
	invitedBy?: string;
	/** Which invitation link the portal invite opens. */
	inviteId?: string;
};


const PORTAL_SEED: Record<string, PortalStatus> = { sup_allure: "active", sup_dpc: "none", sup_kestrel: "active", sup_blackcedar: "invited" };

export function seedPortal(): Record<string, PortalAccess> {
	const out: Record<string, PortalAccess> = {};
	for (const s of suppliers) {
		const status = PORTAL_SEED[s.id] ?? "none";
		out[s.id] = {
			status,
			email: s.contact_email,
			scopes: PORTAL_SCOPES.map((x) => x.id),
			sentAt: status === "invited" ? now - 3 * DAY : status === "active" ? Date.parse(s.created_at) : undefined,
			invitedBy: status === "none" ? undefined : "mem_elena",
			inviteId: s.id === "sup_blackcedar" ? "inv_leverancier" : undefined,
		};
	}
	return out;
}
