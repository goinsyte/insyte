import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Key } from "../../icons";
import { useState } from "react";
import { ConfirmDialog } from "../common/confirm-dialog";
import { StatusPill } from "../settings/setting-card";
import { GHOST_BTN, PersonDisc, StorePicker } from "./bits";
import { abilitiesOf, roleIdForLabel } from "./role-text";
import { type TeamPerson, useSourceInviteRoles, useTeamSource } from "./source";
import { formatDate, formatRelative } from "../lib/format";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";

/**
 * One person in the workspace: who brought them in and when, when they were last here, what role
 * they hold and which stores they can open. Every change applies at once with Undo; handing over
 * the workspace is the one thing that asks first, because the person handing it over loses the
 * right to take it back.
 */
export function MemberDialog({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
	const member = useTeamSource().people.find((m) => m.id === memberId);
	return (
		<Dialog open={member !== undefined} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">{member ? <Body member={member} onClose={onClose} /> : null}</DialogContent>
		</Dialog>
	);
}

function Body({ member, onClose }: { member: TeamPerson; onClose: () => void }) {
	const roles = useSourceInviteRoles();
	const source = useTeamSource();
	const { roles: allRoles, stores, people: members } = source;
	const [transferring, setTransferring] = useState(false);
	const owner = member.role === "Eigenaar";
	const me = member.id === source.me;
	const iAmOwner = members.find((m) => m.id === source.me)?.role === "Eigenaar";
	const deactivated = member.deactivated;
	const by = member.invitedBy ? members.find((m) => m.id === member.invitedBy)?.name : undefined;
	const roleId = roleIdForLabel(roles, member.role);
	const abilities = owner ? abilitiesOf(allRoles, stores, "owner") : roleId ? abilitiesOf(allRoles, stores, roleId) : [];
	const first = member.name.split(" ")[0];
	// Changing someone's role, stores or place in the team is managing the team.
	const manage = source.can.manage;

	function setRole(label: string) {
		if (label === member.role) return;
		const next = roles.find((r) => r.label === label)?.id;
		const before = roleId;
		if (!next) return;
		void source.setMemberRole(member.id, next).then((ok) => {
			if (ok && before) undoable(`${member.name} is nu ${label}`, () => void source.setMemberRole(member.id, before));
		});
	}

	function toggleActive() {
		void source.setDeactivated(member.id, !deactivated).then((ok) => {
			if (!ok) return;
			undoable(
				deactivated ? `${member.name} kan weer inloggen` : `${member.name} gedeactiveerd`,
				() => void source.setDeactivated(member.id, deactivated),
				deactivated ? undefined : "Toewijzingen en geschiedenis blijven staan. De plek is weer vrij.",
			);
		});
	}

	function remove() {
		onClose();
		void source.remove(member.id).then((ok) => {
			if (ok) undoable(`${member.name} verwijderd uit de werkruimte`, () => void source.restoreMember(member.id), "Wat ze deden blijft op naam staan.");
		});
	}

	function transfer() {
		setTransferring(false);
		void source.transfer?.(member.id).then((done) => {
			if (done) undoable(`${member.name} is nu eigenaar`, done.undo, "Jij bent nu Beheerder. Alleen de nieuwe eigenaar kan dit nog terugdraaien na deze melding.");
		});
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
					["Lid sinds", member.joinedAt !== undefined ? formatDate(new Date(member.joinedAt), { day: "numeric", month: "long", year: "numeric" }) : "—"],
					["Laatst actief", member.lastSeen !== undefined ? formatRelative(new Date(member.lastSeen)) : "Nog niet"],
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
					<StorePicker
						stores={stores}
						value={member.stores}
						onChange={(next) => {
							const before = member.stores;
							void source.setMemberStores(member.id, next).then((ok) => {
								if (ok) undoable(`Winkels voor ${first} aangepast`, () => void source.setMemberStores(member.id, before));
							});
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
				{!owner && iAmOwner && !deactivated && source.transfer ? (
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
