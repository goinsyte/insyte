import { Eye, Lock } from "../../icons";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NoAccess } from "./no-access";
import { areaForPath, canRole, editLevelForPath, permissionName } from "../lib/permissions";
import type { Persona } from "../lib/types/persona";
import { useAccess, useCurrentRole } from "../stores/access-store";

/**
 * The console's one door check. A page the current role may not open renders the no-access page in
 * its place, under the same chrome, so the trail and the rail still say where you are. Only the
 * brand's own console is gated by role; a supplier and an affiliate have their own surfaces.
 */
export function RouteGate({ persona, children }: { persona: Persona; children: ReactNode }) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const role = useCurrentRole();
	if (persona !== "admin") return children;
	const need = areaForPath(path);
	if (need && !canRole(role, need.area, need.level)) return <NoAccess area={need.area} level={need.level} />;
	return children;
}

/** While looking through a role: one `abyss` line across the top of the work, with the way back. */
export function ViewAsBanner() {
	const role = useCurrentRole();
	if (!role.viewing) return null;
	return (
		<div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-abyss px-3 text-mesh-ink text-sm" role="status">
			<Eye className="size-3.5 shrink-0 text-mesh-ink-2" strokeWidth={1.75} />
			<span className="truncate">
				Je bekijkt Insyte als <span className="font-medium">{role.label}</span>
			</span>
			<span className="text-mesh-ink-3">·</span>
			<button type="button" onClick={() => useAccess.getState().setViewAs(null)} className="rounded-sm font-medium text-mesh-ink underline decoration-mesh-ink/35 underline-offset-2 hover:decoration-mesh-ink">
				Terug
			</button>
		</div>
	);
}

/**
 * On a page the role may open but not change: one quiet line saying so and what is missing. The
 * fields under it are read-only (the settings layout disables them).
 */
export function useReadOnly(path: string): string | null {
	const role = useCurrentRole();
	const edit = editLevelForPath(path);
	if (!edit || canRole(role, edit.area, edit.level)) return null;
	return `Je rol ${role.label} mist ${permissionName(edit.area, edit.level)}`;
}

export function ReadOnlyNotice({ reason }: { reason: string }) {
	return (
		<p className="flex items-start gap-2 rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm leading-normal">
			<Lock className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			<span>
				<span className="font-medium text-ink">Alleen lezen.</span> {reason}, dus je kunt hier kijken maar niets wijzigen.
			</span>
		</p>
	);
}
