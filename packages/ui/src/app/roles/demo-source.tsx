import { type ReactNode, useRef } from "react";
import { useDeveloper } from "../stores/developer-store";
import { useAccess, useCurrentRole, useGate } from "../stores/access-store";
import { grantersOf, grantingRoles } from "../access/denial";
import { useSettings } from "../stores/settings-store";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";
import { railItemsForPersona } from "../lib/app-shell-config";
import type { Role } from "../stores/settings-store";
import { createRole, reassignAndRemove, renameRole } from "../lib/role-actions";
import { type RolesSource, RolesSourceProvider } from "./source";

/**
 * Rollen's source in the design app: the demo stores, in memory, as the screens read them before they had a source.
 * What a delete took is kept here for its undo.
 */
export function DemoRolesSource({ children }: { children: ReactNode }) {
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const members = useWorkspace((s) => s.members);
	const invites = useTeam((s) => s.invites);
	const linkRole = useTeam((s) => s.link.roleId);
	const keys = useDeveloper((s) => s.apiKeys);
	const requests = useAccess((s) => s.requests);
	const manage = useGate("team", 3);
	const me = useCurrentRole();
	const removed = useRef(new Map<string, () => void>());
	const done = Promise.resolve(true);

	const source: RolesSource = {
		roles,
		stores,
		holders: (role) => ({
			members: members.filter((m) => m.role === role.label).map((m) => ({ id: m.id, name: m.name })),
			invites: invites.filter((i) => i.roleId === role.id).length,
			link: linkRole === role.id,
			keys: keys.filter((k) => k.status === "active" && k.access.kind === "role" && k.access.roleId === role.id).length,
		}),
		can: { manage },
		// Who may not manage the team does not see who asked, as the server answers.
		requests: !manage.ok
			? null
			: requests
			.filter((r) => r.state === "open")
			.map((r) => ({ id: r.id, memberId: r.memberId, memberName: members.find((m) => m.id === r.memberId)?.name, roleId: r.roleId, area: r.area, level: r.level, path: r.path, at: r.at })),
		requestsDenial: manage.ok
			? undefined
			: (() => {
					const asked = requests.find((r) => r.roleId === me.id && r.area === "team" && r.state !== "granted");
					return {
						perm: "team" as const,
						arg: 3 as const,
						roleLabel: me.label,
						grantingRoles: grantingRoles(roles, "team", 3),
						granters: grantersOf(roles, members.filter((m) => m.status === "active")),
						request: asked === undefined ? ({ state: "none" } as const) : asked.state === "open" ? ({ state: "open", at: asked.at } as const) : ({ state: "declined", at: asked.at } as const),
						action: "Access.list",
					};
				})(),
		askAccess: () => {
			const req = useAccess.getState().request({ roleId: me.id, area: "team", level: 3, path: "/settings/roles", memberId: "" });
			return Promise.resolve(() => useAccess.getState().withdraw(req.id));
		},
		pageName: (path) => railItemsForPersona("admin").find((i) => path === i.to || path.startsWith(`${i.to}/`))?.label ?? path,

		create: (label, from) => Promise.resolve(createRole(label, from).id),
		update: (id, permissions) => {
			useSettings.getState().updateRole(id, permissions);
			return done;
		},
		rename: (id, label) => Promise.resolve(renameRole(id, label) !== undefined),
		reset: (id) => {
			useSettings.getState().resetRole(id);
			return done;
		},
		remove: (id, to) => {
			if (to === null) {
				const gone = useSettings.getState().removeRole(id);
				if (gone) removed.current.set(id, () => useSettings.getState().addRole(gone.role as Role, gone.index));
				return Promise.resolve(gone !== undefined);
			}
			const undo = reassignAndRemove(id, to);
			if (undo) removed.current.set(id, undo);
			return Promise.resolve(undo !== undefined);
		},
		restore: (id) => {
			removed.current.get(id)?.();
			return done;
		},
		grant: (req) => {
			const role = useSettings.getState().roles.find((r) => r.id === req.roleId);
			if (!role) return Promise.resolve(false);
			useSettings.getState().updateRole(role.id, { levels: { ...role.levels, [req.area]: Math.max(role.levels[req.area], req.level) as typeof req.level } });
			useAccess.getState().resolve(req.id, "granted");
			return done;
		},
		decline: (req) => {
			useAccess.getState().resolve(req.id, "declined");
			return done;
		},
		reopen: (req) => {
			useAccess.getState().resolve(req.id, "open");
			return done;
		},
	};

	return <RolesSourceProvider value={source}>{children}</RolesSourceProvider>;
}
