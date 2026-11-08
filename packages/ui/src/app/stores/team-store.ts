import { create } from "zustand";
import {
	DAY,
	HOME_WORKSPACE,
	type Invite,
	isExpired,
	PLAN_SEATS,
	type InviteLink,
	type MemberMeta,
	type PortalAccess,
	type StoreAccess,
	seedInvites,
	seedLink,
	seedMemberMeta,
	seedPortal,
	seedWorkspaceInvites,
	seedWorkspaces,
	token,
	type Workspace,
	type WorkspaceInvite,
} from "../lib/team";
import { useSettings } from "./settings-store";
import { useWorkspace } from "./workspace-store";

/*
 * The team around the workspace: pending invitations, the shareable link, extra seats, what each
 * member may reach, the other workspaces the person belongs to, and the supplier portal.
 *
 * In memory, like the workspace store it sits beside, so a reload puts the demo back. Members
 * themselves stay in `useWorkspace`; accepting an invitation adds one there.
 */

export type Welcome = { name: string; workspace: string; role: string };

export type TeamState = {
	invites: Invite[];
	/** Ids revoked in this session, so their link says so instead of looking new. */
	revoked: string[];
	memberMeta: Record<string, MemberMeta>;
	link: InviteLink;
	extraSeats: number;
	workspaces: Workspace[];
	activeWorkspaceId: string;
	workspaceInvites: WorkspaceInvite[];
	/** The workspace being switched to, while the chrome changes over. */
	switching: Workspace | null;
	portal: Record<string, PortalAccess>;
	/** Set when someone has just joined, so the shell can greet them once. */
	welcome: Welcome | null;
	/** Set while "Nieuwe werkruimte" runs through onboarding, so the new one is added at the end. */
	creatingWorkspace: boolean;

	addInvites: (invites: Invite[]) => void;
	removeInvite: (id: string) => Invite | undefined;
	restoreInvite: (invite: Invite) => void;
	resendInvite: (id: string) => void;
	setInviteRole: (id: string, roleId: string) => void;
	acceptInvite: (id: string, name?: string) => void;

	setLink: (patch: Partial<InviteLink>) => void;
	regenerateLink: () => InviteLink;
	addSeats: (n: number) => void;

	setMemberStores: (id: string, stores: StoreAccess) => void;
	setDeactivated: (id: string, deactivated: boolean) => void;

	switchWorkspace: (id: string) => void;
	finishSwitch: () => void;
	acceptWorkspaceInvite: (id: string) => Workspace | undefined;
	declineWorkspaceInvite: (id: string) => { invite: WorkspaceInvite; index: number } | undefined;
	restoreWorkspaceInvite: (invite: WorkspaceInvite, index: number) => void;
	leaveWorkspace: (id: string) => void;
	addWorkspace: (name: string) => Workspace;

	setPortal: (supplierId: string, access: PortalAccess) => void;
	setWelcome: (w: Welcome | null) => void;
	setCreatingWorkspace: (v: boolean) => void;
};

const replaceOrAppend = (list: Invite[], invite: Invite) =>
	list.some((i) => i.id === invite.id) ? list.map((i) => (i.id === invite.id ? invite : i)) : [...list, invite];

export const useTeam = create<TeamState>()((set, get) => ({
	invites: seedInvites(),
	revoked: [],
	memberMeta: seedMemberMeta(),
	link: seedLink(),
	extraSeats: 0,
	workspaces: seedWorkspaces(),
	activeWorkspaceId: HOME_WORKSPACE,
	workspaceInvites: seedWorkspaceInvites(),
	switching: null,
	portal: seedPortal(),
	welcome: null,
	creatingWorkspace: false,

	addInvites: (invites) => set((s) => ({ invites: invites.reduce(replaceOrAppend, s.invites) })),
	removeInvite: (id) => {
		const invite = get().invites.find((i) => i.id === id);
		if (!invite) return undefined;
		set((s) => ({ invites: s.invites.filter((i) => i.id !== id), revoked: [...s.revoked, id] }));
		// The seeded invitation also stands as a row in the workspace's people; it goes with it.
		if (invite.memberId) useWorkspace.getState().removeMember(invite.memberId);
		return invite;
	},
	restoreInvite: (invite) => {
		set((s) => ({ invites: replaceOrAppend(s.invites, invite), revoked: s.revoked.filter((r) => r !== invite.id) }));
		if (invite.memberId && !useWorkspace.getState().members.some((m) => m.id === invite.memberId)) {
			useWorkspace.setState((s) => ({
				members: [...s.members, { id: invite.memberId!, user_id: "", name: "Amber Lewis", email: invite.email, role: "Klantenservice", status: "invited" }],
			}));
		}
	},
	resendInvite: (id) =>
		set((s) => ({
			invites: s.invites.map((i) => (i.id === id ? { ...i, sentAt: Date.now(), expiresAt: Date.now() + 7 * DAY, resent: i.resent + 1 } : i)),
		})),
	setInviteRole: (id, roleId) => set((s) => ({ invites: s.invites.map((i) => (i.id === id ? { ...i, roleId } : i)) })),
	acceptInvite: (id, name) => {
		const invite = get().invites.find((i) => i.id === id);
		if (!invite) return;
		const ws = useWorkspace.getState();
		const memberId = invite.memberId ?? `mem_${invite.id}`;
		const label = useSettings.getState().roles.find((r) => r.id === invite.roleId)?.label ?? invite.roleId;
		const existing = ws.members.find((m) => m.id === memberId);
		const member = {
			id: memberId,
			user_id: `user_${memberId}`,
			name: name ?? existing?.name ?? invite.email,
			email: invite.email,
			role: existing?.role ?? label,
			status: "active" as const,
			last_active_at: new Date().toISOString(),
		};
		useWorkspace.setState((s) => ({ members: existing ? s.members.map((m) => (m.id === memberId ? member : m)) : [...s.members, member] }));
		set((s) => ({
			invites: s.invites.filter((i) => i.id !== id),
			memberMeta: { ...s.memberMeta, [memberId]: { stores: invite.stores, invitedBy: invite.invitedBy, joinedAt: Date.now(), lastSeen: Date.now() } },
		}));
	},

	setLink: (patch) => set((s) => ({ link: { ...s.link, ...patch } })),
	regenerateLink: () => {
		const before = get().link;
		set((s) => ({ link: { ...s.link, enabled: true, token: token(), createdAt: Date.now(), joined: 0 } }));
		return before;
	},
	addSeats: (n) => set((s) => ({ extraSeats: Math.max(0, s.extraSeats + n) })),

	setMemberStores: (id, stores) =>
		set((s) => ({ memberMeta: { ...s.memberMeta, [id]: { ...(s.memberMeta[id] ?? { joinedAt: Date.now() }), stores } } })),
	setDeactivated: (id, deactivated) =>
		set((s) => ({ memberMeta: { ...s.memberMeta, [id]: { ...(s.memberMeta[id] ?? { stores: "all", joinedAt: Date.now() }), deactivated } } })),

	switchWorkspace: (id) => {
		const target = get().workspaces.find((w) => w.id === id);
		if (!target || id === get().activeWorkspaceId) return;
		set({ switching: target });
	},
	finishSwitch: () => {
		const target = get().switching;
		if (!target) return;
		set({ activeWorkspaceId: target.id, switching: null });
		// Every screen that names the workspace reads the account; the demo's data stays the same.
		useWorkspace.setState((s) => ({ account: { ...s.account, workspace: target.name } }));
	},
	acceptWorkspaceInvite: (id) => {
		const invite = get().workspaceInvites.find((i) => i.id === id);
		if (!invite) return undefined;
		const workspace: Workspace = { id: `ws_${invite.id}`, name: invite.workspace, role: invite.role, members: invite.members + 1, plan: invite.plan, own: false };
		set((s) => ({ workspaceInvites: s.workspaceInvites.filter((i) => i.id !== id), workspaces: [...s.workspaces, workspace] }));
		return workspace;
	},
	declineWorkspaceInvite: (id) => {
		const index = get().workspaceInvites.findIndex((i) => i.id === id);
		const invite = get().workspaceInvites[index];
		if (!invite) return undefined;
		set((s) => ({ workspaceInvites: s.workspaceInvites.filter((i) => i.id !== id) }));
		return { invite, index };
	},
	restoreWorkspaceInvite: (invite, index) =>
		set((s) => {
			const next = [...s.workspaceInvites];
			next.splice(index, 0, invite);
			return { workspaceInvites: next };
		}),
	leaveWorkspace: (id) => {
		const wasActive = get().activeWorkspaceId === id;
		set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }));
		if (wasActive) {
			const home = get().workspaces.find((w) => w.home) ?? get().workspaces[0];
			if (home) {
				set({ activeWorkspaceId: home.id });
				useWorkspace.setState((s) => ({ account: { ...s.account, workspace: home.name } }));
			}
		}
	},
	addWorkspace: (name) => {
		const workspace: Workspace = { id: `ws_${token()}`, name, role: "Eigenaar", members: 1, plan: "Proefperiode", own: true };
		set((s) => ({ workspaces: [...s.workspaces, workspace], activeWorkspaceId: workspace.id, creatingWorkspace: false }));
		useWorkspace.setState((s) => ({ account: { ...s.account, workspace: name } }));
		return workspace;
	},

	setPortal: (supplierId, access) => set((s) => ({ portal: { ...s.portal, [supplierId]: access } })),
	setWelcome: (welcome) => set({ welcome }),
	setCreatingWorkspace: (creatingWorkspace) => set({ creatingWorkspace }),
}));

/** Seats on the plan, and how many are taken: active people plus invitations still open. */
export function useSeats() {
	const plan = useSettings((s) => s.plan);
	const extra = useTeam((s) => s.extraSeats);
	const deactivated = useTeam((s) => s.memberMeta);
	const invites = useTeam((s) => s.invites);
	const members = useWorkspace((s) => s.members);
	const total = PLAN_SEATS[plan] + extra;
	const active = members.filter((m) => m.status === "active" && !deactivated[m.id]?.deactivated).length;
	const at = Date.now();
	const pending = invites.filter((i) => !isExpired(i, at)).length;
	const used = active + pending;
	return { total, used, active, pending, extra, free: Math.max(0, total - used), full: used >= total };
}

/** The workspace the chrome is in. */
export function useActiveWorkspace() {
	return useTeam((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? s.workspaces[0]!);
}
