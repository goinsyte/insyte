import { makePermissions, type RoleDef } from "./permissions";
import { useDeveloper } from "../stores/developer-store";
import { useSettings } from "../stores/settings-store";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * The changes to roles that reach past the roles themselves. A member holds a role by its NAME (the
 * seeded people carry labels), an invitation and the share link by its id, so renaming has to carry
 * the people with it and deleting has to put everyone who held it somewhere first. Each returns the
 * way back, for the undo.
 */

export type Holders = { members: Array<{ id: string; name: string }>; invites: number; link: boolean; keys: number };

const keysOf = (roleId: string) =>
	useDeveloper
		.getState()
		.apiKeys.filter((k) => k.status === "active" && k.access.kind === "role" && k.access.roleId === roleId)
		.map((k) => k.id);

export function holdersOf(role: Pick<RoleDef, "id" | "label">): Holders {
	const members = useWorkspace
		.getState()
		.members.filter((m) => m.role === role.label)
		.map((m) => ({ id: m.id, name: m.name }));
	const team = useTeam.getState();
	return { members, invites: team.invites.filter((i) => i.roleId === role.id).length, link: team.link.roleId === role.id, keys: keysOf(role.id).length };
}

export const holderCount = (h: Holders) => h.members.length + h.invites + (h.link ? 1 : 0) + h.keys;

export function newRoleId() {
	return `rol_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A fresh custom role, copied from another or from nothing. */
export function createRole(label: string, fromId: string | null): RoleDef {
	const from = fromId ? useSettings.getState().roles.find((r) => r.id === fromId) : undefined;
	const base = from ?? { ...makePermissions({}), id: "", label: "" };
	const role: RoleDef = {
		levels: { ...base.levels },
		specials: { ...base.specials },
		refundLimit: base.refundLimit,
		stores: base.stores === "all" ? "all" : [...base.stores],
		id: newRoleId(),
		label,
		custom: true,
		basedOn: from && from.id !== "owner" ? from.id : undefined,
		createdAt: Date.now(),
	};
	useSettings.getState().addRole(role);
	return role;
}

export function renameRole(id: string, label: string): (() => void) | undefined {
	const role = useSettings.getState().roles.find((r) => r.id === id);
	if (!role?.custom) return undefined;
	const before = role.label;
	const moved = useWorkspace
		.getState()
		.members.filter((m) => m.role === before)
		.map((m) => m.id);
	useSettings.getState().updateRole(id, { label });
	for (const m of moved) useWorkspace.getState().setMemberRole(m, label);
	return () => {
		useSettings.getState().updateRole(id, { label: before });
		for (const m of moved) useWorkspace.getState().setMemberRole(m, before);
	};
}

/** Moves everyone who holds `id` onto `toId`, then removes the role. */
export function reassignAndRemove(id: string, toId: string): (() => void) | undefined {
	const settings = useSettings.getState();
	const role = settings.roles.find((r) => r.id === id);
	const to = settings.roles.find((r) => r.id === toId);
	if (!role?.custom || !to) return undefined;
	const team = useTeam.getState();
	const members = useWorkspace
		.getState()
		.members.filter((m) => m.role === role.label)
		.map((m) => m.id);
	const invites = team.invites.filter((i) => i.roleId === id).map((i) => i.id);
	const link = team.link.roleId === id;
	// A key that speaks as this role keeps working, as the role everyone else moves to.
	const keys = keysOf(id);
	const setKeyRole = (roleId: string) => {
		for (const k of keys) useDeveloper.getState().updateKey(k, { access: { kind: "role", roleId } });
	};
	setKeyRole(toId);
	for (const m of members) useWorkspace.getState().setMemberRole(m, to.label);
	for (const i of invites) useTeam.getState().setInviteRole(i, toId);
	if (link) useTeam.getState().setLink({ roleId: toId });
	const gone = useSettings.getState().removeRole(id);
	return () => {
		if (gone) useSettings.getState().addRole(gone.role, gone.index);
		for (const m of members) useWorkspace.getState().setMemberRole(m, role.label);
		for (const i of invites) useTeam.getState().setInviteRole(i, id);
		if (link) useTeam.getState().setLink({ roleId: id });
		setKeyRole(id);
	};
}
