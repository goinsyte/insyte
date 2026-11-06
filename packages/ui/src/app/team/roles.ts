import { useWorkspace } from "../stores/workspace-store";
import { describe } from "../lib/permissions";
import { type Role, useSettings } from "../stores/settings-store";
import type { StoreAccess } from "../lib/team";

/** The roles an invitation can grant: every role in Settings → Rollen but the owner, of whom there is one. */
export function useInviteRoles(): Role[] {
	return useSettings((s) => s.roles).filter((r) => r.id !== "owner");
}

export function roleLabel(roles: ReadonlyArray<Role>, id: string) {
	return roles.find((r) => r.id === id)?.label ?? id;
}

/** What a role may do, in the sentences Rollen writes for it. */
export function useAbilities(roleId: string): string[] {
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	return abilitiesOf(roles, stores, roleId);
}

export function abilitiesOf(roles: ReadonlyArray<Role>, stores: ReadonlyArray<{ id: string; name: string }>, roleId: string) {
	const role = roles.find((r) => r.id === roleId);
	return role ? describe(role, stores) : [];
}

/** A member's role is a label (seeded people carry older role names); this finds its settings role. */
export function roleIdForLabel(roles: ReadonlyArray<Role>, label: string) {
	return roles.find((r) => r.label === label)?.id;
}

/** "Alle winkels", or the stores by name. */
export function useStoreAccessLabel(access: StoreAccess | undefined) {
	const stores = useWorkspace((s) => s.stores);
	return storeAccessLabel(stores, access);
}

export function storeAccessLabel(stores: ReadonlyArray<{ id: string; name: string }>, access: StoreAccess | undefined) {
	if (!access || access === "all") return "Alle winkels";
	const names = access.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean);
	return names.length === 0 ? "Geen winkels" : names.join(", ");
}
