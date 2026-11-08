import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { type Denial, grantersOf, grantingRoles } from "../access/denial";
import { isSpecial, type Level, type Permission } from "../lib/permissions";
import { type Invite, type InviteLink, inviteUrl, token } from "../lib/team";
import type { Member } from "../lib/types/domain";
import { useAccess, useCurrentRole, useGate } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { useSeats, useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";
import { ME } from "./invite-dialog";
import { type RefusalScope, type TeamPerson, type TeamRefusal, type TeamSource, TeamSourceProvider } from "./source";

/**
 * The team screens' source in the design app: the demo stores, in memory, as the screens read them before they had a
 * source. What a write did is kept here for its undo (the invitation a revoke took, the member a removal took), so
 * every undo puts back exactly what was there.
 */
export function DemoTeamSource({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const members = useWorkspace((s) => s.members);
	const stores = useWorkspace((s) => s.stores);
	const meta = useTeam((s) => s.memberMeta);
	const invites = useTeam((s) => s.invites);
	const link = useTeam((s) => s.link);
	const seats = useSeats();
	const roles = useSettings((s) => s.roles);
	const invite = useGate("team", 2);
	const manage = useGate("team", 3);
	const role = useCurrentRole();
	const requests = useAccess((s) => s.requests);
	const path = useRouterState({ select: (s) => s.location.pathname });
	const [refusal, setRefusal] = useState<TeamRefusal | null>(null);

	const lapsedBy = useRef(new Map<string, Invite>());
	const revoked = useRef(new Map<string, Invite>());
	const beforeResend = useRef(new Map<string, Invite>());
	const removed = useRef(new Map<string, { member: Member; index: number }>());
	const beforeLink = useRef<InviteLink | null>(null);

	const people = useMemo<TeamPerson[]>(
		() =>
			members
				.filter((m) => m.status === "active")
				.map((m) => ({
					id: m.id,
					name: m.name,
					email: m.email,
					role: m.role,
					stores: meta[m.id]?.stores ?? "all",
					invitedBy: meta[m.id]?.invitedBy,
					joinedAt: meta[m.id]?.joinedAt,
					lastSeen: meta[m.id]?.lastSeen ?? m.last_active_at,
					deactivated: meta[m.id]?.deactivated === true,
				})),
		[members, meta],
	);

	const done = Promise.resolve(true);
	const labelOf = (roleId: string) => roles.find((r) => r.id === roleId)?.label ?? roleId;

	const denialFor = (perm: Permission, arg?: Level | number): Denial => {
		const asked = isSpecial(perm) ? undefined : requests.find((r) => r.roleId === role.id && r.area === perm && r.state !== "granted");
		return {
			perm,
			...(arg === undefined ? {} : { arg }),
			roleLabel: role.label,
			grantingRoles: grantingRoles(roles, perm, arg),
			granters: grantersOf(roles, people),
			request: asked === undefined ? { state: "none" } : asked.state === "open" ? { state: "open", at: asked.at } : { state: "declined", at: asked.at },
		};
	};

	/**
	 * The demo refuses as the server does: a write whose permission the role lacks does not happen,
	 * and the refusal is said where it was asked. (The member table's menu offers its actions to every
	 * role, so a role that may only read the team meets this there.)
	 */
	const guarded = <A,>(scope: RefusalScope, level: Level, action: string, write: () => Promise<A>, retry: () => void, refused: A): Promise<A> => {
		if ((level === 2 ? invite : manage).ok) {
			setRefusal(null);
			return write();
		}
		setRefusal({ scope, denial: { ...denialFor("team", level), action, at: Date.now() }, retry });
		return Promise.resolve(refused);
	};

	const source: TeamSource = {
		me: ME,
		people,
		invites,
		seats,
		link: { ...link, url: inviteUrl(`link_${link.token}`) },
		roles,
		stores,
		can: { invite, manage },
		denialFor,
		askAccess: (perm, arg) => {
			if (isSpecial(perm)) return undefined;
			const req = useAccess.getState().request({ roleId: role.id, area: perm, level: ((arg as Level | undefined) ?? 1) as Level, path, memberId: "" });
			return () => useAccess.getState().withdraw(req.id);
		},
		refusal,
		dismissRefusal: () => setRefusal(null),
		inviteUrl,
		preview: (id) => void navigate({ to: "/invitations/$invitationId", params: { invitationId: id } }),
		buySeats: () => void navigate({ to: "/settings/billing", hash: "plekken" }),
		transfer: (memberId) => {
			const ws = useWorkspace.getState();
			const previous = ws.members.find((m) => m.id === memberId)?.role ?? "";
			ws.setMemberRole(memberId, "Eigenaar");
			ws.setMemberRole(ME, "Beheerder");
			return Promise.resolve({
				undo: () => {
					useWorkspace.getState().setMemberRole(memberId, previous);
					useWorkspace.getState().setMemberRole(ME, "Eigenaar");
				},
			});
		},

		send: (rows) =>
			guarded("invite", 2, "Invitations.send", () => {
			const team = useTeam.getState();
			const now = Date.now();
			const made: Invite[] = rows.map((r) => {
				const lapsed = team.invites.find((i) => i.email.toLowerCase() === r.email.toLowerCase());
				const id = lapsed?.id ?? `inv_${token()}`;
				if (lapsed) lapsedBy.current.set(id, lapsed);
				return { id, email: r.email, roleId: r.roleId, stores: r.stores, message: r.message, invitedBy: ME, sentAt: now, expiresAt: now + 7 * 86_400_000, resent: 0 };
			});
			team.addInvites(made);
			return Promise.resolve(made);
		}, () => void source.send(rows), undefined),
		unsend: (ids) =>
			guarded("invitations", 2, "Invitations.revoke", () => {
			useTeam.setState((s) => ({ invites: s.invites.filter((i) => !ids.includes(i.id)) }));
			const lapsed = ids.flatMap((id) => lapsedBy.current.get(id) ?? []);
			if (lapsed.length > 0) useTeam.getState().addInvites(lapsed);
			return done;
		}, () => void source.unsend(ids), false),
		revoke: (id) =>
			guarded("invitations", 2, "Invitations.revoke", () => {
			const gone = useTeam.getState().removeInvite(id);
			if (gone) revoked.current.set(id, gone);
			return Promise.resolve(gone !== undefined);
		}, () => void source.revoke(id), false),
		restoreInvite: (id) =>
			guarded("invitations", 2, "Invitations.restore", () => {
			const gone = revoked.current.get(id);
			if (gone) useTeam.getState().restoreInvite(gone);
			return done;
		}, () => void source.restoreInvite(id), false),
		resend: (id) =>
			guarded("invitations", 2, "Invitations.resend", () => {
			const before = useTeam.getState().invites.find((i) => i.id === id);
			if (before) beforeResend.current.set(id, before);
			useTeam.getState().resendInvite(id);
			return done;
		}, () => void source.resend(id), false),
		undoResend: (id) =>
			guarded("invitations", 2, "Invitations.undoResend", () => {
			const before = beforeResend.current.get(id);
			if (before) useTeam.getState().addInvites([before]);
			return done;
		}, () => void source.undoResend(id), false),
		setInviteRole: (id, roleId) =>
			guarded("invitations", 2, "Invitations.setRole", () => {
			useTeam.getState().setInviteRole(id, roleId);
			return done;
		}, () => void source.setInviteRole(id, roleId), false),
		setMemberRole: (id, roleId) =>
			guarded("members", 3, "Members.setRole", () => {
			useWorkspace.getState().setMemberRole(id, labelOf(roleId));
			return done;
		}, () => void source.setMemberRole(id, roleId), false),
		setMemberStores: (id, next) =>
			guarded("members", 3, "Members.setStores", () => {
			useTeam.getState().setMemberStores(id, next);
			return done;
		}, () => void source.setMemberStores(id, next), false),
		setDeactivated: (id, deactivated) =>
			guarded("members", 3, "Members.deactivate", () => {
			useTeam.getState().setDeactivated(id, deactivated);
			return done;
		}, () => void source.setDeactivated(id, deactivated), false),
		remove: (id) =>
			guarded("members", 3, "Members.remove", () => {
			const gone = useWorkspace.getState().removeMember(id);
			if (gone) removed.current.set(id, gone);
			return Promise.resolve(gone !== undefined);
		}, () => void source.remove(id), false),
		restoreMember: (id) =>
			guarded("members", 3, "Members.restore", () => {
			const gone = removed.current.get(id);
			if (gone) useWorkspace.getState().restoreMember(gone.member, gone.index);
			return done;
		}, () => void source.restoreMember(id), false),
		setLink: (patch) =>
			guarded("link", 2, "InviteLink.set", () => {
			useTeam.getState().setLink(patch);
			return done;
		}, () => void source.setLink(patch), false),
		regenerateLink: () =>
			guarded("link", 2, "InviteLink.regenerate", () => {
			beforeLink.current = useTeam.getState().regenerateLink();
			return done;
		}, () => void source.regenerateLink(), false),
		undoRegenerateLink: () =>
			guarded("link", 2, "InviteLink.undoRegenerate", () => {
			if (beforeLink.current) useTeam.getState().setLink(beforeLink.current);
			return done;
		}, () => void source.undoRegenerateLink(), false),
	};

	return <TeamSourceProvider value={source}>{children}</TeamSourceProvider>;
}
