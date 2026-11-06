import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Pause, Play, Send } from "../../icons";
import { useEffect, useState } from "react";
import { Field, TextAreaField, TextField } from "../common/form-dialog";
import { StatusPill } from "../settings/setting-card";
import { GHOST_BTN, PersonDisc, PRIMARY_BTN, Segmented } from "../team/bits";
import { TIERS } from "../../data-source";
import { formatCurrency, formatDate } from "../lib/format";
import { type Application, REJECT_REASONS, type Tier, tierOf } from "../../data-source";
import { EMAIL, token } from "../lib/team";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useProgram } from "../stores/affiliate-program-store";

const DAY = 86_400_000;
export const TIER_OPTIONS = TIERS.map((t) => ({ id: t.id as Tier, label: `${t.label} · ${t.rate}%` }));

/** Invite someone straight into the programme, past the application. */
export function AffiliateInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [tier, setTier] = useState<Tier>("bronze");
	const [message, setMessage] = useState("");
	const [tried, setTried] = useState(false);
	const invites = useProgram((s) => s.invites);
	const affiliates = useProgram((s) => s.affiliates);

	useEffect(() => {
		if (!open) return;
		setName("");
		setEmail("");
		setTier("bronze");
		setMessage("");
		setTried(false);
	}, [open]);

	const e = email.trim().toLowerCase();
	const problem = !name.trim()
		? "Vul een naam in."
		: !EMAIL.test(e)
			? "Vul een geldig e-mailadres in."
			: affiliates.some((a) => a.email.toLowerCase() === e)
				? "Deze affiliate doet al mee."
				: invites.some((i) => i.email.toLowerCase() === e)
					? "Er staat al een uitnodiging open voor dit adres."
					: null;

	function submit() {
		setTried(true);
		if (problem) return;
		const invite = { id: `inv_aff_${token()}`, name: name.trim(), email: e, tier, message: message.trim() || undefined, sentAt: Date.now(), expiresAt: Date.now() + 14 * DAY };
		useProgram.getState().addInvite(invite);
		undoable(`${invite.name} uitgenodigd voor het partnerprogramma`, () => useProgram.getState().removeInvite(invite.id), `Op ${tierOf(tier).label}, ${tierOf(tier).rate}% commissie. De link is 14 dagen geldig.`);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Affiliate uitnodigen</DialogTitle>
					<DialogDescription>Ze slaan de aanmelding over en beginnen op het niveau dat je kiest. Ze zien alleen hun eigen links, bestellingen en uitbetalingen.</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Naam">
						<TextField value={name} onChange={setName} placeholder="Femke Jansen" />
					</Field>
					<Field label="E-mailadres">
						<TextField value={email} onChange={setEmail} type="email" placeholder="naam@kanaal.nl" />
					</Field>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-ink-3 text-sm leading-none">Niveau</span>
					<Segmented label="Niveau" value={tier} onChange={setTier} options={TIER_OPTIONS} />
				</div>
				<Field label="Persoonlijk bericht (optioneel)">
					<TextAreaField value={message} onChange={setMessage} placeholder="Je reviews van onze fleece deden het goed." rows={2} />
				</Field>
				{tried && problem ? <p className="font-medium text-signal-red text-sm">{problem}</p> : null}
				<DialogFooter>
					<button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
						Annuleren
					</button>
					<button type="button" onClick={submit} className={PRIMARY_BTN}>
						<Send className="size-3.5" strokeWidth={1.75} />
						Uitnodiging versturen
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Approve with a tier, or reject with a reason the applicant will read. */
export function DecideDialog({ app, mode, onClose }: { app: Application | null; mode: "approve" | "reject"; onClose: () => void }) {
	const [tier, setTier] = useState<Tier>("bronze");
	const [reason, setReason] = useState<string>(REJECT_REASONS[0]);
	const [custom, setCustom] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when another application opens.
	useEffect(() => {
		setTier("bronze");
		setReason(REJECT_REASONS[0]);
		setCustom("");
	}, [app?.id, mode]);

	if (!app) return <Dialog open={false} />;
	const t = tierOf(tier);
	const text = reason === "custom" ? custom.trim() : reason;

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[540px]">
				<DialogHeader>
					<DialogTitle>{mode === "approve" ? `${app.name} goedkeuren` : `${app.name} afwijzen`}</DialogTitle>
					<DialogDescription>
						{mode === "approve"
							? "Ze krijgen een e-mail met hun code en kunnen meteen links maken."
							: "Ze lezen de reden in hun account en kunnen zich later opnieuw aanmelden."}
					</DialogDescription>
				</DialogHeader>
				{mode === "approve" ? (
					<div className="flex flex-col gap-3">
						<Segmented label="Niveau" value={tier} onChange={setTier} options={TIER_OPTIONS} />
						<p className="text-ink-2 text-sm">
							{t.rate}% commissie op elke bestelling via hun code{t.from > 0 ? `, het niveau dat normaal vanaf ${t.from} conversies geldt` : ""}. Code: <span className="font-medium text-ink">{(app.name.split(" ")[0] ?? "").toUpperCase()}</span>.
						</p>
					</div>
				) : (
					<fieldset className="flex flex-col gap-1">
						<legend className="mb-1.5 font-medium text-ink-3 text-sm">Reden</legend>
						{[...REJECT_REASONS, "custom" as const].map((r) => (
							<label key={r} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-ink/4", reason === r && "bg-arc-tint hover:bg-arc-tint")}>
								<input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="mt-1 accent-[var(--arc)]" />
								<span className={cn("text-base", reason === r ? "text-arc-ink" : "text-ink")}>{r === "custom" ? "Eigen reden" : r}</span>
							</label>
						))}
						{reason === "custom" ? <TextAreaField value={custom} onChange={setCustom} placeholder="Schrijf wat ze moeten weten." rows={2} /> : null}
					</fieldset>
				)}
				<DialogFooter>
					<button type="button" onClick={onClose} className={GHOST_BTN}>
						Annuleren
					</button>
					<button
						type="button"
						disabled={mode === "reject" && !text}
						onClick={() => {
							const before = useProgram.getState().snapshot();
							if (mode === "approve") useProgram.getState().approve(app.id, tier);
							else useProgram.getState().reject(app.id, text);
							undoable(mode === "approve" ? `${app.name} doet mee op ${t.label}` : `${app.name} afgewezen`, () => useProgram.getState().restore(before), mode === "approve" ? "De welkomstmail met de code is verstuurd." : text);
							onClose();
						}}
						className={mode === "reject" ? cn(PRIMARY_BTN, "bg-signal-red hover:bg-signal-red/90") : PRIMARY_BTN}
					>
						{mode === "approve" ? `Goedkeuren op ${t.label}` : "Afwijzen"}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** One affiliate: their figures, their tier, and pausing their links. */
export function AffiliateDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
	const a = useProgram((s) => s.affiliates.find((x) => x.id === id));
	const payout = useProgram((s) => s.payouts.find((p) => p.affiliateId === id));
	return (
		<Dialog open={a !== undefined} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[580px]">
				{a ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-3">
								<PersonDisc seed={a.id} name={a.name} size={40} />
								<div className="flex min-w-0 flex-col gap-0.5">
									<DialogTitle className="flex items-center gap-2">
										<span className="truncate">{a.name}</span>
										{a.paused ? <StatusPill tone="warning" label="Gepauzeerd" /> : null}
									</DialogTitle>
									<DialogDescription className="truncate">
										{a.email} · code {a.code} · sinds {formatDate(new Date(a.joinedAt), { day: "numeric", month: "long", year: "numeric" })}
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>
						<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-mist">
							{[
								["Conversies", a.conversions.toLocaleString("nl-NL")],
								["Verdiend", formatCurrency(a.earned)],
								["Deze maand", payout ? formatCurrency(payout.approvable + payout.inWindow) : "—"],
							].map(([k, v]) => (
								<div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
									<dt className="text-ink-3 text-xs">{k}</dt>
									<dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
								</div>
							))}
						</dl>
						<section className="flex flex-col gap-2">
							<h3 className="font-medium text-ink-3 text-xs">Niveau en commissie</h3>
							<Segmented
								label="Niveau"
								value={a.tier}
								options={TIER_OPTIONS}
								onChange={(tier) => {
									if (tier === a.tier) return;
									const before = a.tier;
									useProgram.getState().setTier(a.id, tier);
									undoable(`${a.name} is nu ${tierOf(tier).label}`, () => useProgram.getState().setTier(a.id, before), `${tierOf(tier).rate}% vanaf de volgende bestelling. Wat al binnen is, houdt het oude percentage.`);
								}}
							/>
						</section>
						<DialogFooter className="sm:justify-between">
							<span className="text-ink-3 text-sm">{a.paused ? "Hun links werken, maar leveren geen commissie op." : "Hun links en code werken."}</span>
							<button
								type="button"
								onClick={() => {
									useProgram.getState().togglePause(a.id);
									undoable(a.paused ? `${a.name} hervat` : `${a.name} gepauzeerd`, () => useProgram.getState().togglePause(a.id));
								}}
								className={GHOST_BTN}
							>
								{a.paused ? <Play className="size-3.5" strokeWidth={1.75} /> : <Pause className="size-3.5" strokeWidth={1.75} />}
								{a.paused ? "Hervatten" : "Commissie pauzeren"}
							</button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
