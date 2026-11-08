import { createContext, useContext } from "react";
import type { Denial } from "../access/denial";
import type { Level, Permission } from "../lib/permissions";
import type { Invite, InviteLink, StoreAccess } from "../lib/team-core";
import type { RoleDef as Role } from "@insyte/domain/Permissions";

/**
 * What the team screens read and do, from whoever hosts them (16 §6's seam for one screen): the design app answers
 * from its demo stores (`demo-source.tsx`), the console from the server. The screens hold no data of their own, so
 * each host can be checked against the same markup.
 *
 * Every write resolves `true` once it took; a host that refuses says why itself and resolves `false`, and the screen
 * then offers no undo.
 */

/** A person in the workspace, as the member table and dialog show them. */
export type TeamPerson = {
	id: string;
	name: string;
	email: string;
	/** The role's label (seeded people may carry a label that is no longer a role). */
	role: string;
	stores: StoreAccess;
	invitedBy?: string;
	joinedAt?: number;
	/** When they were last here, as an ISO time or epoch ms. */
	lastSeen?: string | number;
	deactivated: boolean;
};

export type TeamSeats = { total: number; used: number; active: number; pending: number; extra: number; free: number; full: boolean };

/** Whether the signed-in person may, and if not the sentence that says what their role misses. */
export type TeamGate = { ok: boolean; reason: string };

/** Where on the page a refused action happened, so the refusal is said there. */
export type RefusalScope = "members" | "invitations" | "link" | "invite";

/** A write the server refused for want of a permission, and where it was asked. */
export type TeamRefusal = { scope: RefusalScope; denial: Denial; retry: () => void };

export type InviteRow = { email: string; roleId: string; stores: StoreAccess; message?: string };

export interface TeamSource {
	/** The signed-in person's member id. */
	me: string;
	people: ReadonlyArray<TeamPerson>;
	invites: ReadonlyArray<Invite>;
	seats: TeamSeats;
	link: InviteLink & { url: string };
	/** Every role in the workspace, the owner's included. */
	roles: ReadonlyArray<Role>;
	stores: ReadonlyArray<{ id: string; name: string }>;
	can: { invite: TeamGate; manage: TeamGate };
	/** Why a permission is missing, in the denied states' words, from this workspace's roles and people. */
	denialFor: (perm: Permission, arg?: Level | number) => Denial;
	/** Asks the people who can grant it, answering how to take the request back; absent where the host cannot take one yet. */
	askAccess?: ((perm: Permission, arg?: Level | number) => Promise<(() => void) | undefined>) | undefined;
	/** The last write refused for a missing permission, until it is dismissed or retried. */
	refusal: TeamRefusal | null;
	dismissRefusal: () => void;
	/** A pending invitation's own link, when the host can give it. */
	inviteUrl: (id: string) => string | undefined;
	/** Opens the landing as the invitee sees it; absent where the host has no such view. */
	preview?: (id: string) => void;
	buySeats: () => void;
	/** Hands the workspace over, answering how to take it back; absent where the host cannot yet. */
	transfer?: (memberId: string) => Promise<{ undo: () => void } | undefined>;

	send: (rows: ReadonlyArray<InviteRow>) => Promise<ReadonlyArray<Invite> | undefined>;
	/** Undo of a send, inside its window: the invitations go, and so does their mail. */
	unsend: (ids: ReadonlyArray<string>) => Promise<boolean>;
	revoke: (id: string) => Promise<boolean>;
	restoreInvite: (id: string) => Promise<boolean>;
	resend: (id: string) => Promise<boolean>;
	undoResend: (id: string) => Promise<boolean>;
	setInviteRole: (id: string, roleId: string) => Promise<boolean>;
	setMemberRole: (id: string, roleId: string) => Promise<boolean>;
	setMemberStores: (id: string, stores: StoreAccess) => Promise<boolean>;
	setDeactivated: (id: string, deactivated: boolean) => Promise<boolean>;
	remove: (id: string) => Promise<boolean>;
	restoreMember: (id: string) => Promise<boolean>;
	setLink: (patch: Partial<Pick<InviteLink, "enabled" | "roleId" | "days">>) => Promise<boolean>;
	regenerateLink: () => Promise<boolean>;
	undoRegenerateLink: () => Promise<boolean>;
}

const TeamSourceContext = createContext<TeamSource | null>(null);

export const TeamSourceProvider = TeamSourceContext.Provider;

export function useTeamSource(): TeamSource {
	const source = useContext(TeamSourceContext);
	if (source === null) throw new Error("A team screen needs a TeamSourceProvider around it.");
	return source;
}

/** The roles an invitation can grant: every role but the owner, of whom there is one. */
export function useSourceInviteRoles(): ReadonlyArray<Role> {
	return useTeamSource().roles.filter((r) => r.id !== "owner");
}
