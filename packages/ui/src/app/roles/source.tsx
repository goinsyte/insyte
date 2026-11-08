import type { RoleDef } from "@insyte/domain/Permissions";
import { createContext, useContext } from "react";
import type { Denial } from "../access/denial";
import type { AreaId, Level, Permissions } from "../lib/permissions";
import type { TeamGate } from "../team/source";

/**
 * What Rollen reads and does, from whoever hosts it (as `team/source.tsx` for Team): the design app answers from its
 * demo stores, the console from the server. The screens keep only their own drafts and dialogs.
 *
 * Every write resolves `true` once it took; a host that refuses says why itself and resolves `false`, and the screen
 * offers no undo.
 */

export type Holders = { members: ReadonlyArray<{ id: string; name: string }>; invites: number; link: boolean; keys: number };

/** One access request, as the list on Rollen shows it. */
export type RoleRequest = {
	id: string;
	memberId: string;
	/** Who asked, when the host knows them. */
	memberName?: string | undefined;
	roleId: string;
	area: AreaId;
	level: Level;
	path: string;
	at: number;
};

export interface RolesSource {
	roles: ReadonlyArray<RoleDef>;
	stores: ReadonlyArray<{ id: string; name: string }>;
	holders: (role: Pick<RoleDef, "id" | "label">) => Holders;
	can: { manage: TeamGate };
	/** Open requests, or `null` where the role may not see them (`requestsDenial` says why). */
	requests: ReadonlyArray<RoleRequest> | null;
	requestsDenial?: Denial | undefined;
	/** Asks for what the denial names, answering how to take it back; absent where the host cannot take a request. */
	askAccess?: (() => Promise<(() => void) | undefined>) | undefined;
	/** The rail's name for the page a request was made from. */
	pageName: (path: string) => string;

	/** A new custom role from another (or from nothing); answers its id. */
	create: (label: string, from: string | null) => Promise<string | undefined>;
	update: (id: string, permissions: Permissions) => Promise<boolean>;
	rename: (id: string, label: string) => Promise<boolean>;
	reset: (id: string) => Promise<boolean>;
	/** Deletes a custom role; whoever holds it goes to `to` first. */
	remove: (id: string, to: string | null) => Promise<boolean>;
	/** Undo of a delete: the role, and everyone it moved, back. */
	restore: (id: string) => Promise<boolean>;
	grant: (request: RoleRequest) => Promise<boolean>;
	decline: (request: RoleRequest) => Promise<boolean>;
	/** Undo of a decline, where the host can reopen a request. */
	reopen?: ((request: RoleRequest) => Promise<boolean>) | undefined;
}

const RolesSourceContext = createContext<RolesSource | null>(null);

export const RolesSourceProvider = RolesSourceContext.Provider;

export function useRolesSource(): RolesSource {
	const source = useContext(RolesSourceContext);
	if (source === null) throw new Error("A roles screen needs a RolesSourceProvider around it.");
	return source;
}

/** Who holds a role right now. */
export function useHolders(role: Pick<RoleDef, "id" | "label">): Holders {
	return useRolesSource().holders(role);
}

export const holderCount = (h: Holders) => h.members.length + h.invites + (h.link ? 1 : 0) + h.keys;
