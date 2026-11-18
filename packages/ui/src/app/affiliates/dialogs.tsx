import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Pause, Play, RotateCcw, Send } from "../../icons";
import { useEffect, useState } from "react";
import { Field, TextAreaField, TextField } from "../common/form-dialog";
import { StatusPill } from "../settings/setting-card";
import { GHOST_BTN, PersonDisc, PRIMARY_BTN, Segmented } from "../team/bits";
import { formatDate } from "../lib/format";
import { EMAIL } from "../lib/team";
import { cn } from "../lib/utils";
import { type ApplicationRow, type Tier, type TierView, tierIn, useAffiliatesSource } from "./source";

type Application = ApplicationRow;

export const tierOptions = (tiers: ReadonlyArray<TierView>) => tiers.map((t) => ({ id: t.id as Tier, label: `${t.label} · ${t.rate}%` }));

/** Invite someone straight into the programme, past the application. */
export function AffiliateInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [tier, setTier] = useState<Tier>("bronze");
	const [message, setMessage] = useState("");
	const [tried, setTried] = useState(false);
	const { tiers, useInvites, useAffiliates, invite: send } = useAffiliatesSource();
	const invites = useInvites();
	const affiliates = useAffiliates();
	const TIER_OPTIONS = tierOptions(tiers);
	const tierOf = (id: Tier) => tierIn(tiers, id);

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
		const invite = { name: name.trim(), email: e, tier, message: message.trim() || undefined };
		send(invite, { message: `${invite.name} uitgenodigd voor het partnerprogramma`, description: `Op ${tierOf(tier).label}, ${tierOf(tier).rate}% commissie. De link is 14 dagen geldig.` });
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
	const { tiers, rejectReasons: REJECT_REASONS, useProposedCode, approve, reject } = useAffiliatesSource();
	const TIER_OPTIONS = tierOptions(tiers);
	const tierOf = (id: Tier) => tierIn(tiers, id);
	const code = useProposedCode(mode === "approve" ? app : null);
	const [tier, setTier] = useState<Tier>("bronze");
	const [reason, setReason] = useState<string>(REJECT_REASONS[0] ?? "custom");
	const [custom, setCustom] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when another application opens.
	useEffect(() => {
		setTier("bronze");
		setReason(REJECT_REASONS[0] ?? "custom");
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
							{t.rate}% commissie op elke bestelling via hun code{t.from > 0 ? `, het niveau dat normaal vanaf ${t.from} conversies geldt` : ""}. Code: <span className="font-medium text-ink">{code || "…"}</span>.
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
						disabled={mode === "reject" ? !text : !code}
						onClick={() => {
							if (mode === "approve") approve(app, tier, code, { message: `${app.name} doet mee op ${t.label}`, description: "De welkomstmail met de code is verstuurd." });
							else reject(app, text, { message: `${app.name} afgewezen`, description: text });
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
	const { money: formatCurrency, tiers, useAffiliates, useThisMonth, setTier, setPaused, retryDiscount } = useAffiliatesSource();
	const TIER_OPTIONS = tierOptions(tiers);
	const tierOf = (t: Tier) => tierIn(tiers, t);
	const a = useAffiliates().find((x) => x.id === id);
	const thisMonth = useThisMonth(id ?? "");
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
								["Deze maand", thisMonth !== undefined ? formatCurrency(thisMonth) : "—"],
							].map(([k, v]) => (
								<div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
									<dt className="text-ink-3 text-xs">{k}</dt>
									<dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
								</div>
							))}
						</dl>
						{a.discount?.state === "failed" ? (
							<section className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-signal-amber-bg px-3 py-2.5">
								<span className="flex min-w-0 flex-col">
									<span className="font-medium text-ink text-sm">Kortingscode kon niet in Shopify worden aangemaakt</span>
									{a.discount.error ? <span className="text-ink-2 text-sm">{a.discount.error}</span> : null}
								</span>
								{retryDiscount ? (
									<button type="button" onClick={() => retryDiscount(a)} className={GHOST_BTN}>
										<RotateCcw className="size-3.5" strokeWidth={1.75} />
										Opnieuw proberen
									</button>
								) : null}
							</section>
						) : null}
						<section className="flex flex-col gap-2">
							<h3 className="font-medium text-ink-3 text-xs">Niveau en commissie</h3>
							<Segmented
								label="Niveau"
								value={a.tier}
								options={TIER_OPTIONS}
								onChange={(tier) => {
									if (tier === a.tier) return;
									setTier(a, tier, { message: `${a.name} is nu ${tierOf(tier).label}`, description: `${tierOf(tier).rate}% vanaf de volgende bestelling. Wat al binnen is, houdt het oude percentage.` });
								}}
							/>
						</section>
						<DialogFooter className="sm:justify-between">
							<span className="text-ink-3 text-sm">{a.paused ? "Hun links werken, maar leveren geen commissie op." : "Hun links en code werken."}</span>
							<button
								type="button"
								onClick={() => setPaused([a], { message: a.paused ? `${a.name} hervat` : `${a.name} gepauzeerd` })}
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
