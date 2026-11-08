import { describe } from "../lib/permissions";
import type { StoreAccess } from "../lib/team-core";
import type { RoleDef as Role } from "@insyte/domain/Permissions";

/*
 * The words for roles and stores on the team screens, from whatever roles and stores the screen's source has: pure, so
 * the console reads them without the demo stores (`roles.ts` keeps the store-backed hooks other screens use).
 */

export function roleLabel(roles: ReadonlyArray<Role>, id: string) {
	return roles.find((r) => r.id === id)?.label ?? id;
}

export function abilitiesOf(roles: ReadonlyArray<Role>, stores: ReadonlyArray<{ id: string; name: string }>, roleId: string) {
	const role = roles.find((r) => r.id === roleId);
	return role ? describe(role, stores) : [];
}

/** A member's role is a label (seeded people carry older role names); this finds its settings role. */
export function roleIdForLabel(roles: ReadonlyArray<Role>, label: string) {
	return roles.find((r) => r.label === label)?.id;
}

export function storeAccessLabel(stores: ReadonlyArray<{ id: string; name: string }>, access: StoreAccess | undefined) {
	if (!access || access === "all") return "Alle winkels";
	const names = access.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean);
	return names.length === 0 ? "Geen winkels" : names.join(", ");
}
