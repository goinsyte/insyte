import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { CompareDialog, DeleteRoleDialog, NewRoleDialog } from "../roles/role-dialogs";
import { RoleEditor } from "../roles/role-editor";
import { RoleList } from "../roles/role-list";
import type { RoleDef } from "../lib/permissions";
import { createRole, holderCount, holdersOf, reassignAndRemove } from "../lib/role-actions";
import { undoable } from "../lib/undo";
import { useSettings } from "../stores/settings-store";

const Route = getRouteApi("/_admin/settings/roles");

export type Search = { role?: string; verzoek?: string; nieuw?: string };

const GUIDE = [
	{ title: "Een niveau per onderdeel", body: "Niets, bekijken, bewerken of beheren. Bewerken omvat bekijken, beheren omvat bewerken. Klik op een kolomkop om alles op dat niveau te zetten.", art: "roles" },
	{ title: "Bijzondere acties", body: "Wat geld of vertrouwen de deur uit laat gaan, zoals terugbetalen, staat los van het niveau en moet apart aan.", art: "lock" },
	{ title: "Winkels", body: "Een rol ziet alleen de bestellingen, klanten en tickets van zijn winkels. Wat je per persoon kiest, beperkt het verder.", art: "parcel" },
	{ title: "Toegangsverzoeken", body: "Toekennen zet het gevraagde niveau op de rol, dus voor iedereen die hem heeft.", art: "handover" },
	{ title: "Eigen rollen", body: "Maak er een als een systeemrol net niet past. De eigenaar kan altijd alles; wil je iemand bijna alles geven, kies dan Beheerder.", art: "people" },
] as const;

/**
 * Rollen: the list of roles, and one role opened in its editor (`?role=`), on the same page so the
 * link to a role is a link. Creating, duplicating and deleting are kept here because they move
 * people between roles; the editor keeps its own draft.
 */
export function RolesPage() {
	const { role: roleId, verzoek } = Route.useSearch();
	const navigate = useNavigate();
	const roles = useSettings((s) => s.roles);
	const [creating, setCreating] = useState<{ from?: string } | null>(null);
	const [deleting, setDeleting] = useState<RoleDef | null>(null);
	const [comparing, setComparing] = useState<string[] | null>(null);
	const open = roleId ? roles.find((r) => r.id === roleId) : undefined;

	function create(label: string, from: string | null, rename = false) {
		const role = createRole(label, from);
		void navigate({ to: "/settings/roles", search: { role: role.id, nieuw: rename ? "1" : undefined } });
		undoable(`${label} gemaakt`, () => {
			useSettings.getState().removeRole(role.id);
			void navigate({ to: "/settings/roles", search: {} });
		});
	}

	function duplicate(r: RoleDef) {
		create(`Kopie van ${r.label}`, r.id, true);
	}

	/** Nobody holds it: it goes at once, with Undo. Somebody does: they are moved first. */
	function remove(r: RoleDef) {
		if (holderCount(holdersOf(r)) > 0) return setDeleting(r);
		const gone = useSettings.getState().removeRole(r.id);
		if (roleId === r.id) void navigate({ to: "/settings/roles", search: {} });
		if (gone) undoable(`${r.label} verwijderd`, () => useSettings.getState().addRole(gone.role, gone.index));
	}

	return (
		<>
			{roleId && !open ? (
				<EmptyState
					kind="people"
					title="Deze rol bestaat niet meer"
					body="Hij is verwijderd of hernoemd."
					action={{ label: "Alle rollen", onClick: () => void navigate({ to: "/settings/roles", search: {} }) }}
				/>
			) : open ? (
				<RoleEditor key={open.id} role={open} onDelete={remove} onCompare={(ids) => setComparing(ids)} />
			) : (
				<RoleList onNew={(from) => setCreating({ from })} onDuplicate={duplicate} onDelete={remove} onCompare={(ids) => setComparing(ids)} highlight={verzoek} />
			)}

			<NewRoleDialog open={creating !== null} onOpenChange={(v) => !v && setCreating(null)} initialFrom={creating?.from} onCreate={create} />
			<DeleteRoleDialog
				role={deleting}
				onClose={() => setDeleting(null)}
				onConfirm={(r, to) => {
					const target = roles.find((x) => x.id === to);
					const n = holdersOf(r).members.length;
					const undo = reassignAndRemove(r.id, to);
					setDeleting(null);
					if (roleId === r.id) void navigate({ to: "/settings/roles", search: {} });
					if (undo) undoable(`${r.label} verwijderd`, undo, n ? `${n === 1 ? "1 teamlid staat" : `${n} teamleden staan`} nu op ${target?.label}.` : undefined);
				}}
			/>
			<CompareDialog open={comparing !== null} onOpenChange={(v) => !v && setComparing(null)} initial={comparing ?? []} />
			<PageGuide id="settings.roles" title="Rollen" steps={GUIDE} />
		</>
	);
}
