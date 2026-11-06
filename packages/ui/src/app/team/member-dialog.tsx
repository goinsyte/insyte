import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Key } from "../../icons";
import { useState } from "react";
import { ConfirmDialog } from "../common/confirm-dialog";
import { StatusPill } from "../settings/setting-card";
import { GHOST_BTN, PersonDisc, StoreAccessPicker } from "./bits";
import { ME } from "./invite-dialog";
import { abilitiesOf, roleIdForLabel, useInviteRoles } from "./roles";
import { formatDate, formatRelative } from "../lib/format";
import type { Member } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useSettings } from "../stores/settings-store";
import { useGate } from "../stores/access-store";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * One person in the workspace: who brought them in and when, when they were last here, what role
 * they hold and which stores they can open. Every change applies at once with Undo; handing over
 * the workspace is the one thing that asks first, because the person handing it over loses the
 * right to take it back.
 */
export function MemberDialog({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
	const member = useWorkspace((s) => s.members.find((m) => m.id === memberId));
	return (
		<Dialog open={member !== undefined} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">{member ? <Body member={member} onClose={onClose} /> : null}</DialogContent>
		</Dialog>
	);
}

function Body({ member, onClose }: { member: Member; onClose: () => void }) {
	const roles = useInviteRoles();
	const allRoles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const members = useWorkspace((s) => s.members);
	const meta = useTeam((s) => s.memberMeta[member.id]);
	const [transferring, setTransferring] = useState(false);
	const owner = member.role === "Eigenaar";
	const me = member.id === ME;
	const iAmOwner = members.find((m) => m.id === ME)?.role === "Eigenaar";
	const deactivated = meta?.deactivated === true;
	const by = meta?.invitedBy ? members.find((m) => m.id === meta.invitedBy)?.name : undefined;
	const roleId = roleIdForLabel(roles, member.role);
	const abilities = owner ? abilitiesOf(allRoles, stores, "owner") : roleId ? abilitiesOf(allRoles, stores, roleId) : [];
	const first = member.name.split(" ")[0];
	// Changing someone's role, stores or place in the team is managing the team.
	const manage = useGate("team", 3);

	function setRole(label: string) {
		if (label === member.role) return;
		const before = member.role;
		useWorkspace.getState().setMemberRole(member.id, label);
		undoable(`${member.name} is nu ${label}`, () => useWorkspace.getState().setMemberRole(member.id, before));
	}

	function toggleActive() {
		useTeam.getState().setDeactivated(member.id, !deactivated);
		undoable(
			deactivated ? `${member.name} kan weer inloggen` : `${member.name} gedeactiveerd`,
			() => useTeam.getState().setDeactivated(member.id, deactivated),
			deactivated ? undefined : "Toewijzingen en geschiedenis blijven staan. De plek is weer vrij.",
		);
	}

	function remove() {
		const removed = useWorkspace.getState().removeMember(member.id);
		onClose();
		if (removed) undoable(`${member.name} verwijderd uit de werkruimte`, () => useWorkspace.getState().restoreMember(removed.member, removed.index), "Wat ze deden blijft op naam staan.");
	}

	function transfer() {
		const ws = useWorkspace.getState();
		const previous = member.role;
		ws.setMemberRole(member.id, "Eigenaar");
		ws.setMemberRole(ME, "Beheerder");
		setTransferring(false);
		undoable(`${member.name} is nu eigenaar`, () => {
			useWorkspace.getState().setMemberRole(member.id, previous);
			useWorkspace.getState().setMemberRole(ME, "Eigenaar");
		}, "Jij bent nu Beheerder. Alleen de nieuwe eigenaar kan dit nog terugdraaien na deze melding.");
	}

	return (
		<>
			<DialogHeader>
				<div className="flex items-center gap-3">
					<PersonDisc seed={member.id} name={member.name} size={40} />
					<div className="flex min-w-0 flex-col gap-0.5">
						<DialogTitle className="flex flex-wrap items-center gap-2">
							<span className="truncate">{member.name}</span>
							{me ? <StatusPill tone="neutral" label="Jij" /> : null}
							{deactivated ? <StatusPill tone="warning" label="Gedeactiveerd" /> : null}
						</DialogTitle>
						<DialogDescription className="truncate">{member.email}</DialogDescription>
					</div>
				</div>
			</DialogHeader>

			<dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-mist sm:grid-cols-3">
				{[
					["Uitgenodigd door", owner && !by ? "Maakte de werkruimte" : (by ?? "Onbekend")],
					["Lid sinds", meta ? formatDate(new Date(meta.joinedAt), { day: "numeric", month: "long", year: "numeric" }) : "—"],
					["Laatst actief", meta?.lastSeen ? formatRelative(new Date(meta.lastSeen)) : member.last_active_at ? formatRelative(member.last_active_at) : "Nog niet"],
				].map(([k, v]) => (
					<div key={k} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
						<dt className="text-ink-3 text-xs">{k}</dt>
						<dd className="truncate font-medium text-base text-ink">{v}</dd>
					</div>
				))}
			</dl>

			{manage.ok ? null : (
				<p className="rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm">
					<span className="font-medium text-ink">Alleen lezen.</span> {manage.reason}.
				</p>
			)}
			<fieldset disabled={!manage.ok} className="contents">
			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-ink-3 text-xs">Rol</h3>
				{owner ? (
					<p className="flex items-center gap-2 text-base text-ink">
						<Key className="size-4 text-ink-3" strokeWidth={1.75} />
						Eigenaar · beheert facturatie en kan de werkruimte overdragen of verwijderen.
					</p>
				) : (
					<div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rol">
						{roles.map((r) => (
							<button
								key={r.id}
								type="button"
								role="radio"
								aria-checked={member.role === r.label}
								onClick={() => setRole(r.label)}
								className={cn(
									"inline-flex h-8 items-center rounded-md px-2.5 font-medium text-sm transition-colors",
									member.role === r.label ? "bg-abyss text-mesh-ink" : "field text-ink-2 hover:field-hover hover:text-ink",
								)}
							>
								{r.label}
							</button>
						))}
						{roleId ? null : (
							<span className="inline-flex h-8 items-center rounded-md bg-arc-tint px-2.5 font-medium text-arc-ink text-sm" title="Een rol van voor de rollen in Instellingen">
								{member.role}
							</span>
						)}
					</div>
				)}
				<p className="text-ink-2 text-sm leading-normal">
					{abilities.length > 0 ? abilities.join(" ") : `${member.role} staat niet in Rollen; kies een rol om vast te leggen wat ${first} kan.`}
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-ink-3 text-xs">Winkels</h3>
				{owner ? (
					<p className="text-base text-ink">Alle winkels, ook die later gekoppeld worden.</p>
				) : (
					<StoreAccessPicker
						value={meta?.stores ?? "all"}
						onChange={(stores) => {
							const before = meta?.stores ?? "all";
							useTeam.getState().setMemberStores(member.id, stores);
							undoable(`Winkels voor ${first} aangepast`, () => useTeam.getState().setMemberStores(member.id, before));
						}}
					/>
				)}
			</section>

			<DialogFooter className="sm:justify-between">
				{owner || me ? (
					<span className="text-ink-3 text-sm">{owner ? "De eigenaar kan niet worden verwijderd. Draag de werkruimte eerst over." : "Je kunt jezelf hier niet verwijderen."}</span>
				) : (
					<div className="flex flex-wrap gap-1">
						<button type="button" onClick={toggleActive} className={GHOST_BTN}>
							{deactivated ? "Weer activeren" : "Deactiveren"}
						</button>
						<button type="button" onClick={remove} className={cn(GHOST_BTN, "text-signal-red hover:text-signal-red")}>
							Verwijderen uit werkruimte
						</button>
					</div>
				)}
				{!owner && iAmOwner && !deactivated ? (
					<button type="button" onClick={() => setTransferring(true)} className={GHOST_BTN}>
						<Key className="size-3.5" strokeWidth={1.75} />
						Eigendom overdragen
					</button>
				) : null}
			</DialogFooter>
			</fieldset>

			<ConfirmDialog
				open={transferring}
				onOpenChange={setTransferring}
				title={`Werkruimte overdragen aan ${member.name}?`}
				description={`${first} wordt eigenaar en beheert vanaf nu facturatie, het abonnement en het verwijderen van de werkruimte. Jij wordt Beheerder en kunt dit daarna niet zelf terugzetten.`}
				confirmLabel={`Overdragen aan ${first}`}
				onConfirm={transfer}
			/>
		</>
	);
}
