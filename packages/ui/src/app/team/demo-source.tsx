import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useRef } from "react";
import { type Invite, type InviteLink, inviteUrl, token } from "../lib/team";
import type { Member } from "../lib/types/domain";
import { useGate } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { useSeats, useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";
import { ME } from "./invite-dialog";
import { type TeamPerson, type TeamSource, TeamSourceProvider } from "./source";

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

	const source: TeamSource = {
		me: ME,
		people,
		invites,
		seats,
		link: { ...link, url: inviteUrl(`link_${link.token}`) },
		roles,
		stores,
		can: { invite, manage },
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

		send: (rows) => {
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
		},
		unsend: (ids) => {
			useTeam.setState((s) => ({ invites: s.invites.filter((i) => !ids.includes(i.id)) }));
			const lapsed = ids.flatMap((id) => lapsedBy.current.get(id) ?? []);
			if (lapsed.length > 0) useTeam.getState().addInvites(lapsed);
			return done;
		},
		revoke: (id) => {
			const gone = useTeam.getState().removeInvite(id);
			if (gone) revoked.current.set(id, gone);
			return Promise.resolve(gone !== undefined);
		},
		restoreInvite: (id) => {
			const gone = revoked.current.get(id);
			if (gone) useTeam.getState().restoreInvite(gone);
			return done;
		},
		resend: (id) => {
			const before = useTeam.getState().invites.find((i) => i.id === id);
			if (before) beforeResend.current.set(id, before);
			useTeam.getState().resendInvite(id);
			return done;
		},
		undoResend: (id) => {
			const before = beforeResend.current.get(id);
			if (before) useTeam.getState().addInvites([before]);
			return done;
		},
		setInviteRole: (id, roleId) => {
			useTeam.getState().setInviteRole(id, roleId);
			return done;
		},
		setMemberRole: (id, roleId) => {
			useWorkspace.getState().setMemberRole(id, labelOf(roleId));
			return done;
		},
		setMemberStores: (id, next) => {
			useTeam.getState().setMemberStores(id, next);
			return done;
		},
		setDeactivated: (id, deactivated) => {
			useTeam.getState().setDeactivated(id, deactivated);
			return done;
		},
		remove: (id) => {
			const gone = useWorkspace.getState().removeMember(id);
			if (gone) removed.current.set(id, gone);
			return Promise.resolve(gone !== undefined);
		},
		restoreMember: (id) => {
			const gone = removed.current.get(id);
			if (gone) useWorkspace.getState().restoreMember(gone.member, gone.index);
			return done;
		},
		setLink: (patch) => {
			useTeam.getState().setLink(patch);
			return done;
		},
		regenerateLink: () => {
			beforeLink.current = useTeam.getState().regenerateLink();
			return done;
		},
		undoRegenerateLink: () => {
			if (beforeLink.current) useTeam.getState().setLink(beforeLink.current);
			return done;
		},
	};

	return <TeamSourceProvider value={source}>{children}</TeamSourceProvider>;
}
