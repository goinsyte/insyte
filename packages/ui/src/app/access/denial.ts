import type { RoleDef } from "@insyte/domain/Permissions";
import { AREA_BY_ID, canRole, isSpecial, type Level, levelLabel, type Permission, SPECIAL_BY_ID } from "../lib/permissions";

/**
 * Why something is withheld, in the words every denied state uses: the permission that is missing,
 * the role the person holds, which of the workspace's roles do have it, who can grant it, and
 * whether the person already asked. Built from the role catalogue and the people, never invented: a
 * host passes its own roles and members (the design's stores, the console's server answer).
 */
export type Denial = {
	perm: Permission;
	/** The area level it takes, or the amount for a limited special (`refunds.write`). */
	arg?: Level | number;
	/** The person's role. */
	roleLabel: string;
	/** The workspace's roles that have it, owner last. */
	grantingRoles: ReadonlyArray<string>;
	/** The people who can grant it: whoever may manage the team. */
	granters: ReadonlyArray<{ id: string; name: string; role: string }>;
	request: { state: "none" } | { state: "open"; at: number } | { state: "declined"; at: number };
	/** What was refused, for support: the server action and when. */
	action?: string;
	at?: number;
};

const VERB: Record<Level, string> = { 0: "none", 1: "read", 2: "write", 3: "manage" };

/** The permission as one label: "Team en rollen · Beheren", or a special action's own name. */
export function permissionLabel(perm: Permission, arg?: Level | number): string {
	if (isSpecial(perm)) return SPECIAL_BY_ID[perm].label;
	return `${AREA_BY_ID[perm].label} · ${levelLabel(((arg as Level | undefined) ?? 1) as Level)}`;
}

/** The permission as support reads it: `team.manage`, or a special's id. */
export function permissionId(perm: Permission, arg?: Level | number): string {
	if (isSpecial(perm)) return perm;
	return `${perm}.${VERB[((arg as Level | undefined) ?? 1) as Level]}`;
}

/** The roles of the workspace that have this permission, the owner last (it has everything). */
export function grantingRoles(roles: ReadonlyArray<RoleDef>, perm: Permission, arg?: Level | number): string[] {
	const having = roles.filter((r) => canRole(r, perm, arg));
	return [...having.filter((r) => r.id !== "owner"), ...having.filter((r) => r.id === "owner")].map((r) => r.label);
}

/** The people who can grant access: active members whose role may manage the team. */
export function grantersOf(
	roles: ReadonlyArray<RoleDef>,
	people: ReadonlyArray<{ id: string; name: string; role: string }>,
): Array<{ id: string; name: string; role: string }> {
	return people.filter((p) => {
		const role = roles.find((r) => r.label === p.role);
		return role !== undefined && canRole(role, "team", 3);
	});
}
