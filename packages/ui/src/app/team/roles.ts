import { useWorkspace } from "../stores/workspace-store";
import { type Role, useSettings } from "../stores/settings-store";
import type { StoreAccess } from "../lib/team-core";
import { abilitiesOf, storeAccessLabel } from "./role-text";

export { abilitiesOf, roleIdForLabel, roleLabel, storeAccessLabel } from "./role-text";

/** The roles an invitation can grant: every role in Settings → Rollen but the owner, of whom there is one. */
export function useInviteRoles(): Role[] {
	return useSettings((s) => s.roles).filter((r) => r.id !== "owner");
}

/** What a role may do, in the sentences Rollen writes for it. */
export function useAbilities(roleId: string): string[] {
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	return abilitiesOf(roles, stores, roleId);
}

/** "Alle winkels", or the stores by name. */
export function useStoreAccessLabel(access: StoreAccess | undefined) {
	const stores = useWorkspace((s) => s.stores);
	return storeAccessLabel(stores, access);
}

