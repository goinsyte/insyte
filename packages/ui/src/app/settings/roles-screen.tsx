import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { CompareDialog, DeleteRoleDialog, NewRoleDialog } from "../roles/role-dialogs";
import { RoleEditor } from "../roles/role-editor";
import { RoleList } from "../roles/role-list";
import type { RoleDef } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { holderCount, useRolesSource } from "../roles/source";

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
export function RolesView({ roleId, verzoek }: { roleId?: string | undefined; verzoek?: string | undefined }) {
	const navigate = useNavigate();
	const source = useRolesSource();
	const roles = source.roles;
	const [creating, setCreating] = useState<{ from?: string } | null>(null);
	const [deleting, setDeleting] = useState<RoleDef | null>(null);
	const [comparing, setComparing] = useState<string[] | null>(null);
	const open = roleId ? roles.find((r) => r.id === roleId) : undefined;

	function create(label: string, from: string | null, rename = false) {
		void source.create(label, from).then((id) => {
			if (id === undefined) return;
			void navigate({ to: "/settings/roles", search: { role: id, nieuw: rename ? "1" : undefined } });
			undoable(`${label} gemaakt`, () => {
				void source.remove(id, null);
				void navigate({ to: "/settings/roles", search: {} });
			});
		});
	}

	function duplicate(r: RoleDef) {
		create(`Kopie van ${r.label}`, r.id, true);
	}

	/** Nobody holds it: it goes at once, with Undo. Somebody does: they are moved first. */
	function remove(r: RoleDef) {
		if (holderCount(source.holders(r)) > 0) return setDeleting(r);
		void source.remove(r.id, null).then((ok) => {
			if (roleId === r.id) void navigate({ to: "/settings/roles", search: {} });
			if (ok) undoable(`${r.label} verwijderd`, () => void source.restore(r.id));
		});
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
					const n = source.holders(r).members.length;
					setDeleting(null);
					void source.remove(r.id, to).then((ok) => {
						if (roleId === r.id) void navigate({ to: "/settings/roles", search: {} });
						if (ok) undoable(`${r.label} verwijderd`, () => void source.restore(r.id), n ? `${n === 1 ? "1 teamlid staat" : `${n} teamleden staan`} nu op ${target?.label}.` : undefined);
					});
				}}
			/>
			<CompareDialog open={comparing !== null} onOpenChange={(v) => !v && setComparing(null)} initial={comparing ?? []} />
			<PageGuide id="settings.roles" title="Rollen" steps={GUIDE} />
		</>
	);
}
