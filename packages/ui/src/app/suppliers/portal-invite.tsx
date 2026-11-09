import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Checkbox } from "../../components/checkbox";
import { Copy, ExternalLink, RotateCcw, Send } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, TextAreaField, TextField } from "../common/form-dialog";
import { StatusPill } from "../settings/setting-card";
import { GHOST_BTN, PRIMARY_BTN, WELL_BTN } from "../team/bits";
import { ME } from "../team/invite-dialog";
import { formatRelative } from "../lib/format";
import type { Supplier } from "../lib/types/domain";
import { EMAIL, inviteUrl, PORTAL_SCOPES, type PortalAccess, token } from "../lib/team";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useTeam } from "../stores/team-store";

import { PORTAL_LABEL } from "./portal-label";

export { PORTAL_LABEL };

const DEFAULT_SCOPES = PORTAL_SCOPES.map((s) => s.id);

/** Invite one supplier, or several at once with what each already has on file. Undo takes it back. */
export function invitePortal(suppliers: ReadonlyArray<Pick<Supplier, "id" | "name" | "contact_email">>, opts?: { email?: string; contact?: string; scopes?: string[]; message?: string }) {
	const team = useTeam.getState();
	const before = suppliers.map((s) => [s.id, team.portal[s.id]] as const);
	for (const s of suppliers) {
		team.setPortal(s.id, {
			status: "invited",
			email: opts?.email ?? team.portal[s.id]?.email ?? s.contact_email,
			contact: opts?.contact,
			scopes: opts?.scopes ?? team.portal[s.id]?.scopes ?? DEFAULT_SCOPES,
			sentAt: Date.now(),
			invitedBy: ME,
			inviteId: team.portal[s.id]?.inviteId ?? `inv_sup_${token()}`,
		});
	}
	undoable(
		suppliers.length === 1 ? `${suppliers[0]?.name} uitgenodigd voor het portaal` : `${suppliers.length} leveranciers uitgenodigd voor het portaal`,
		() => {
			for (const [id, access] of before) if (access) useTeam.getState().setPortal(id, access);
		},
		"Ze krijgen een link die 7 dagen geldig is.",
	);
}

export function PortalInviteDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
	const access = useTeam((s) => (supplier ? s.portal[supplier.id] : undefined));
	const [email, setEmail] = useState("");
	const [contact, setContact] = useState("");
	const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
	const [message, setMessage] = useState("");
	const [tried, setTried] = useState(false);

	// Each opening starts from what is on file for this supplier.
	// biome-ignore lint/correctness/useExhaustiveDependencies: refill only when another supplier opens.
	useEffect(() => {
		if (!supplier) return;
		setEmail(access?.email ?? supplier.contact_email);
		setContact(access?.contact ?? "");
		setScopes(access?.scopes ?? DEFAULT_SCOPES);
		setMessage("");
		setTried(false);
	}, [supplier?.id]);

	const valid = EMAIL.test(email.trim());
	const active = access?.status === "active";

	return (
		<Dialog open={supplier !== null} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[580px]">
				{supplier ? (
					<>
						<DialogHeader>
							<DialogTitle>{active ? `Wat ${supplier.name} in het portaal ziet` : `${supplier.name} uitnodigen voor het portaal`}</DialogTitle>
							<DialogDescription>
								{active
									? "Wat je uitvinkt verdwijnt bij hun volgende klik. Hun account blijft bestaan."
									: "Ze maken een eigen account en zien daarna alleen wat je hieronder aanvinkt. Ze komen niet in je team en tellen niet als plek."}
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="E-mailadres van de contactpersoon">
								<TextField value={email} onChange={setEmail} type="email" placeholder="ops@leverancier.com" />
							</Field>
							<Field label="Naam (optioneel)">
								<TextField value={contact} onChange={setContact} placeholder="Marco Rossi" />
							</Field>
						</div>
						{tried && !valid ? <p className="-mt-2 font-medium text-signal-red text-sm">Vul een geldig e-mailadres in.</p> : null}

						<fieldset className="flex flex-col gap-1">
							<legend className="mb-1.5 font-medium text-ink-3 text-sm">Wat ze zien</legend>
							{PORTAL_SCOPES.map((s) => {
								const fixed = "fixed" in s && s.fixed;
								const on = fixed || scopes.includes(s.id);
								return (
									<label key={s.id} className={cn("flex items-start gap-3 rounded-lg px-2.5 py-2", !fixed && "cursor-pointer hover:bg-ink/4")}>
										<Checkbox
											checked={on}
											disabled={fixed}
											onCheckedChange={(v) => setScopes((xs) => (v ? [...new Set([...xs, s.id])] : xs.filter((x) => x !== s.id)))}
											className="mt-0.5"
										/>
										<span className="flex min-w-0 flex-col">
											<span className="font-medium text-base text-ink">
												{s.label}
												{fixed ? <span className="font-normal text-ink-3"> · altijd</span> : null}
											</span>
											<span className="text-ink-2 text-sm">{s.detail}</span>
										</span>
									</label>
								);
							})}
						</fieldset>

						{active ? null : (
							<Field label="Persoonlijk bericht (optioneel)">
								<TextAreaField value={message} onChange={setMessage} placeholder="Via het portaal zie je meteen welke bestellingen voor jullie zijn." rows={2} />
							</Field>
						)}

						<DialogFooter>
							<button type="button" onClick={onClose} className={GHOST_BTN}>
								Annuleren
							</button>
							<button
								type="button"
								onClick={() => {
									setTried(true);
									if (!valid) return;
									if (active && access) {
										const before = access;
										useTeam.getState().setPortal(supplier.id, { ...access, email: email.trim(), contact: contact.trim() || undefined, scopes });
										undoable(`Portaal van ${supplier.name} aangepast`, () => useTeam.getState().setPortal(supplier.id, before));
									} else invitePortal([supplier], { email: email.trim(), contact: contact.trim() || undefined, scopes, message });
									onClose();
								}}
								className={PRIMARY_BTN}
							>
								{active ? null : <Send className="size-3.5" strokeWidth={1.75} />}
								{active ? "Opslaan" : access?.status === "invited" ? "Opnieuw versturen" : "Uitnodiging versturen"}
							</button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/** The portal, inside the supplier's own dialog: where it stands and what can be done about it. */
export function PortalSection({ supplier, onInvite, onClose }: { supplier: Supplier; onInvite: () => void; onClose: () => void }) {
	const access: PortalAccess | undefined = useTeam((s) => s.portal[supplier.id]);
	const navigate = useNavigate();
	const status = access?.status ?? "none";
	const l = PORTAL_LABEL[status];

	function revoke() {
		if (!access) return;
		const before = access;
		useTeam.getState().setPortal(supplier.id, { ...access, status: "none", sentAt: undefined });
		undoable(status === "active" ? `Portaaltoegang van ${supplier.name} ingetrokken` : `Uitnodiging aan ${supplier.name} ingetrokken`, () => useTeam.getState().setPortal(supplier.id, before));
	}

	async function copy() {
		if (!access?.inviteId) return;
		try {
			await navigator.clipboard.writeText(inviteUrl(access.inviteId));
			toast.success("Link gekopieerd");
		} catch {
			toast.error("Kopiëren lukte niet", { description: inviteUrl(access.inviteId) });
		}
	}

	return (
		<section className="flex flex-col gap-2 rounded-lg bg-mist px-3.5 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-0.5">
					<h3 className="flex items-center gap-2 font-medium text-base text-ink">
						Leveranciersportaal <StatusPill tone={l.tone} label={l.label} />
					</h3>
					<p className="text-ink-2 text-sm">
						{status === "active"
							? `${access?.email} logt zelf in · ${access?.scopes.length ?? 0} van ${PORTAL_SCOPES.length} onderdelen zichtbaar`
							: status === "invited"
								? `Verstuurd naar ${access?.email} · ${access?.sentAt ? formatRelative(new Date(access.sentAt)) : ""}`
								: "Ze werken nu per e-mail. Met het portaal accepteren en verzenden ze zelf."}
					</p>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{status === "none" ? (
						<button type="button" onClick={onInvite} className={WELL_BTN}>
							<Send className="size-3.5" strokeWidth={1.75} />
							Uitnodigen voor het portaal
						</button>
					) : null}
					{status === "invited" ? (
						<>
							<button type="button" onClick={() => invitePortal([supplier])} className={WELL_BTN}>
								<RotateCcw className="size-3.5" strokeWidth={1.75} />
								Opnieuw versturen
							</button>
							<button type="button" onClick={() => void copy()} aria-label="Link kopiëren" title="Link kopiëren" className={cn(WELL_BTN, "w-8 px-0")}>
								<Copy className="size-3.5" strokeWidth={1.75} />
							</button>
							<button
								type="button"
								onClick={() => {
									onClose();
									if (access?.inviteId) void navigate({ to: "/invitations/$invitationId", params: { invitationId: access.inviteId } });
								}}
								aria-label="Bekijken zoals zij het zien"
								title="Bekijken zoals zij het zien"
								className={cn(WELL_BTN, "w-8 px-0")}
							>
								<ExternalLink className="size-3.5" strokeWidth={1.75} />
							</button>
						</>
					) : null}
					{status === "active" ? (
						<button type="button" onClick={onInvite} className={WELL_BTN}>
							Wat ze zien
						</button>
					) : null}
					{status !== "none" ? (
						<button type="button" onClick={revoke} className="flex h-8 items-center rounded-md px-2.5 font-medium text-signal-red text-sm hover:bg-signal-red-bg">
							{status === "active" ? "Toegang intrekken" : "Intrekken"}
						</button>
					) : null}
				</div>
			</div>
		</section>
	);
}
