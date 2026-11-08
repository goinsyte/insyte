import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useNotifications } from "./notifications-store";
import {
	AREA_BY_ID,
	type AreaId,
	canOpen,
	canRole,
	euro,
	type Level,
	levelLabel,
	type Permission,
	permissionName,
	type RoleDef,
	SYSTEM_DEFAULTS,
} from "../lib/permissions";
import { useSettings } from "./settings-store";
import { useWorkspace } from "./workspace-store";

/*
 * Who the console thinks you are, for what you may do: your own role, or — in development — the
 * role you asked to look through with "Bekijk als rol" in the persona chip. Everything that gates a
 * screen or a button asks `useCan()` here, so looking through a role shows exactly what someone in
 * it would see.
 *
 * The look-through role persists (under a key the design-state switch keeps), so a reload stays in
 * it. Access requests made from a no-access page live in memory beside it, and each one also lands
 * as a notification for the owner and the admins.
 */

/** The person at the desk in this demo (the same id the team pages call ME). */
const ME = "mem_elena";

export type AccessRequest = {
	id: string;
	roleId: string;
	area: AreaId;
	level: Level;
	/** The page it was asked from. */
	path: string;
	/** Who asked: a member holding the role, or the person looking through it. */
	memberId: string;
	at: number;
	state: "open" | "granted" | "declined";
};

export type AccessState = {
	viewAs: string | null;
	requests: AccessRequest[];
	setViewAs: (roleId: string | null) => void;
	request: (r: Omit<AccessRequest, "id" | "at" | "state">) => AccessRequest;
	resolve: (id: string, state: AccessRequest["state"]) => void;
	/** Takes a request back, and its notification with it. */
	withdraw: (id: string) => void;
};

export const useAccess = create<AccessState>()(
	persist(
		(set) => ({
			viewAs: null,
			requests: [],
			setViewAs: (viewAs) => set({ viewAs }),
			request: (r) => {
				const req: AccessRequest = { ...r, id: `acc_${Date.now().toString(36)}`, at: Date.now(), state: "open" };
				set((s) => ({ requests: [req, ...s.requests] }));
				const ws = useWorkspace.getState();
				const member = ws.members.find((m) => m.id === r.memberId);
				const role = useSettings.getState().roles.find((x) => x.id === r.roleId);
				const area = AREA_BY_ID[r.area];
				// Heard by the owner and the admins: in this demo that is the inbox of the person at the desk.
				useNotifications.setState((s) => ({
					notes: [
						{
							id: `n_${req.id}`,
							persona: "admin",
							source: "team",
							event: "team.invite",
							actor: member ? { kind: "member", id: member.id, name: member.name } : { kind: "person", name: `Iemand met de rol ${role?.label ?? r.roleId}` },
							reason: "assign",
							title: "vraagt toegang tot",
							record: area.label,
							detail: `${area.label} · ${levelLabel(r.level)} voor de rol ${role?.label ?? r.roleId}. Je kunt het toekennen onder Rollen.`,
							to: "/settings/roles",
							search: { role: r.roleId, verzoek: req.id },
							at: new Date(req.at).toISOString(),
							read: false,
							state: "inbox",
						},
						...s.notes,
					],
				}));
				return req;
			},
			resolve: (id, state) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, state } : r)) })),
			withdraw: (id) => {
				set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }));
				useNotifications.setState((s) => ({ notes: s.notes.filter((n) => n.id !== `n_${id}`) }));
			},
		}),
		{
			// "persona" in the key keeps it through a design-state switch, like the persona itself.
			name: "insyte:persona-role",
			version: 1,
			partialize: (s) => ({ viewAs: s.viewAs, requests: s.requests }),
		},
	),
);

/** The role of the person at the desk: the one being looked through, else their own, else the owner. */
export function useCurrentRole(): RoleDef & { viewing: boolean } {
	const viewAs = useAccess((s) => s.viewAs);
	const roles = useSettings((s) => s.roles);
	const myLabel = useWorkspace((s) => s.members.find((m) => m.id === ME)?.role);
	const looked = viewAs ? roles.find((r) => r.id === viewAs) : undefined;
	if (looked) return { ...looked, viewing: true };
	const own = roles.find((r) => r.label === myLabel) ?? roles.find((r) => r.id === "owner") ?? SYSTEM_DEFAULTS.owner!;
	return { ...own, viewing: false };
}

/** `can("orders", 2)`, `can("refunds.write", 180)`: whether the current role may. */
export function useCan() {
	const role = useCurrentRole();
	return (perm: Permission, arg?: Level | number) => canRole(role, perm, arg);
}

export function useCanOpen() {
	const role = useCurrentRole();
	return (path: string) => canOpen(role, path);
}

/**
 * One gate: whether the current role may, and if not, the sentence a disabled control says about
 * it — the missing permission by name and the role that lacks it.
 */
export function useGate(perm: Permission, arg?: Level | number): { ok: boolean; reason: string } {
	const role = useCurrentRole();
	const ok = canRole(role, perm, arg);
	if (ok) return { ok, reason: "" };
	// Over the limit is not the same as not at all: say the limit.
	if (perm === "refunds.write" && typeof arg === "number" && canRole(role, perm) && role.refundLimit !== null) {
		return { ok, reason: `Je rol ${role.label} mag tot ${euro(role.refundLimit)} per bestelling terugbetalen` };
	}
	return { ok, reason: `Je rol ${role.label} mist ${permissionName(perm, arg)}` };
}

/** The store ids the current role reaches, or `null` when it reaches all of them. */
export function useStoreScope(): string[] | null {
	const role = useCurrentRole();
	return role.id === "owner" || role.stores === "all" ? null : role.stores;
}
