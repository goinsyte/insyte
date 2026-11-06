import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { Check, CreditCard, Download } from "../../icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, INPUT_CLASS } from "./form";
import { Gate } from "../access/gate";
import { PageGuide } from "../common/page-guide";
import { SettingCard, StatusPill } from "./setting-card";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useSeats, useTeam } from "../stores/team-store";
import { type BillingCycle, type PlanTier, useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";

const TIERS: Record<PlanTier, { name: string; priceMonthly: number; seats: number; stores: number; replies: number; pitch: string }> = {
	starter: { name: "Starter", priceMonthly: 149, seats: 3, stores: 1, replies: 1000, pitch: "Eén winkel en een klein team." },
	growth: { name: "Growth", priceMonthly: 299, seats: 6, stores: 3, replies: 2500, pitch: "Een paar winkels en een supportteam." },
	scale: { name: "Scale", priceMonthly: 499, seats: 12, stores: 5, replies: 5000, pitch: "Elke winkel, elk kanaal, het hele team." },
};
const TIER_ORDER: PlanTier[] = ["starter", "growth", "scale"];

const RENEWAL = "14 juli 2026";

const GUIDE = [
	{ title: "Extra plekken", body: "Een extra plek gaat naar rato op je volgende factuur en stopt wanneer je hem opzegt.", art: "people" },
	{ title: "Automatisch afgeschreven", body: "Aan het einde van elke periode wordt automatisch afgeschreven van de opgeslagen kaart.", art: "budget" },
	{ title: "Abonnement wijzigen", body: "De nieuwe prijs geldt vanaf je volgende verlenging. Jaarlijks betalen geeft twee maanden gratis.", art: "chart" },
] as const;

/** Dollars the way nl-NL writes them: US$ 499, or US$ 499,00 with cents. */
const usd = (n: number, cents = 0) =>
	n.toLocaleString("nl-NL", { style: "currency", currency: "USD", minimumFractionDigits: cents, maximumFractionDigits: cents });

/** Annual is two months free, shown as what it works out to per month. */
const priceFor = (tier: PlanTier, cycle: BillingCycle) =>
	cycle === "annual" ? Math.round((TIERS[tier].priceMonthly * 10) / 12) : TIERS[tier].priceMonthly;

const INVOICES = [
	{ id: "INV-2026-06", date: "14 juni 2026", amount: 499, status: "paid" as const },
	{ id: "INV-2026-05", date: "14 mei 2026", amount: 499, status: "paid" as const },
	{ id: "INV-2026-04", date: "14 april 2026", amount: 499, status: "paid" as const },
	{ id: "INV-2026-03", date: "14 maart 2026", amount: 499, status: "paid" as const },
];

const SECONDARY =
	"flex h-8 items-center gap-2 rounded-md bg-paper px-3 py-1.5 font-medium text-base text-ink hover:bg-mist disabled:pointer-events-none disabled:opacity-45";
const PRIMARY =
	"flex h-9 items-center justify-center rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";
const GHOST = "flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6";

export function BillingPage() {
	const plan = useSettings((s) => s.plan);
	const cycle = useSettings((s) => s.cycle);
	const cancelsOn = useSettings((s) => s.cancelsOn);
	const card = useSettings((s) => s.card);
	const setCancelsOn = useSettings((s) => s.setCancelsOn);
	const account = useWorkspace((s) => s.account);
	const [changing, setChanging] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [updatingCard, setUpdatingCard] = useState(false);

	const tier = TIERS[plan];
	const seats = useSeats();
	const usage = [
		{ label: "Gebruikte plekken", value: seats.used, max: seats.total },
		{ label: "Gekoppelde winkels", value: 4, max: tier.stores },
		{ label: "AI-antwoorden (deze periode)", value: 1284, max: tier.replies },
		{ label: "Actieve automatiseringen", value: 14, max: 50 },
	];

	function resume() {
		setCancelsOn(null);
		toast.success(`${tier.name} blijft actief`);
	}

	return (
		<>
			<SettingCard
				id="plekken"
				title="Abonnement"
				action={
					<Gate perm="billing" arg={3}>
						<button type="button" onClick={() => setChanging(true)} className={SECONDARY}>
							Abonnement wijzigen
						</button>
					</Gate>
				}
			>
				<div className="flex items-end justify-between rounded-xl bg-mist p-5">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<h3 className="font-medium text-2xl text-ink leading-[1.2]">{tier.name}</h3>
							{cancelsOn ? (
								<StatusPill tone="warning" label={`Stopt op ${cancelsOn}`} />
							) : (
								<StatusPill tone="success" label="Actief" />
							)}
						</div>
						<p className="font-normal text-base text-ink-3 tabular-nums leading-[1.6]">
							{usd(priceFor(plan, cycle))} per maand{cycle === "annual" ? ", jaarlijks gefactureerd" : ""} · {tier.seats} plekken ·{" "}
							{tier.stores} {tier.stores === 1 ? "winkel" : "winkels"} · {cancelsOn ? `stopt ${cancelsOn}` : `verlengt ${RENEWAL}`}
						</p>
					</div>
					{cancelsOn ? (
						<Gate perm="billing" arg={3}>
							<button type="button" onClick={resume} className="font-medium text-base text-ink hover:underline disabled:opacity-45">
								Abonnement hervatten
							</button>
						</Gate>
					) : (
						<Gate perm="billing" arg={3}>
							<button
								type="button"
								onClick={() => setCancelling(true)}
								className="font-medium text-base text-signal-red hover:underline disabled:opacity-45"
							>
								Abonnement opzeggen
							</button>
						</Gate>
					)}
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{usage.map((u) => (
						<div key={u.label} className="flex flex-col gap-2 rounded-xl p-4">
							<div className="flex items-center justify-between">
								<span className="font-normal text-base text-ink-2 leading-[1.55]">{u.label}</span>
								<span className="font-medium text-base text-ink tabular-nums leading-[1.6]">
									{u.value.toLocaleString("nl-NL")} / {u.max.toLocaleString("nl-NL")}
								</span>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-mist">
								<div
									className={cn("h-full rounded-full", u.value > u.max ? "bg-signal-red" : "bg-abyss")}
									style={{ width: `${Math.min(100, (u.value / u.max) * 100)}%` }}
								/>
							</div>
						</div>
					))}
				</div>
				<ExtraSeats included={tier.seats} />
			</SettingCard>

			<SettingCard
				title="Betaalmethode"
				action={
					<Gate perm="billing" arg={3}>
						<button type="button" onClick={() => setUpdatingCard(true)} className={SECONDARY}>
							Kaart bijwerken
						</button>
					</Gate>
				}
			>
				<div className="flex items-center gap-3 rounded-xl p-4">
					<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-arc-tint">
						<CreditCard className="size-5 text-arc-ink" strokeWidth={1.75} />
					</span>
					<div className="flex flex-col">
						<p className="font-medium text-base text-ink tabular-nums leading-[1.4]">
							{card.brand} eindigend op {card.last4}
						</p>
						<p className="font-normal text-sm text-ink-3 tabular-nums leading-[1.4]">Verloopt {card.expiry}</p>
					</div>
				</div>
			</SettingCard>

			<SettingCard title="Facturen">
				<div className="overflow-hidden rounded-xl ">
					<div className="flex items-stretch border-hairline border-b bg-mist">
						<HeaderCell className="w-[160px]">Factuur</HeaderCell>
						<HeaderCell className="flex-1">Datum</HeaderCell>
						<HeaderCell className="w-[110px]">Bedrag</HeaderCell>
						<HeaderCell className="w-[110px]">Status</HeaderCell>
						<HeaderCell className="w-[60px]"> </HeaderCell>
					</div>
					{INVOICES.map((inv, i) => (
						<div
							key={inv.id}
							className={cn("flex items-stretch bg-paper", i < INVOICES.length - 1 && "border-hairline border-b")}
						>
							<div className="flex w-[160px] items-center px-4 py-3 font-medium text-base text-ink tabular-nums">
								{inv.id}
							</div>
							<div className="flex flex-1 items-center px-4 py-3 font-normal text-base text-ink-3 tabular-nums">
								{inv.date}
							</div>
							<div className="flex w-[110px] items-center px-4 py-3 font-normal text-base text-ink tabular-nums">
								{usd(inv.amount, 2)}
							</div>
							<div className="flex w-[110px] items-center px-4 py-3">
								<StatusPill tone="success" label="Betaald" />
							</div>
							<div className="flex w-[60px] items-center justify-center px-2 py-3">
								<Gate perm="billing.invoices">
									<button
										type="button"
										aria-label={`${inv.id} downloaden`}
										onClick={() => downloadInvoice(inv, account)}
										className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink disabled:opacity-40"
									>
										<Download className="size-4" strokeWidth={1.75} />
									</button>
								</Gate>
							</div>
						</div>
					))}
				</div>
			</SettingCard>

			<PlanDialog open={changing} onOpenChange={setChanging} />
			<CancelDialog open={cancelling} onOpenChange={setCancelling} planName={tier.name} />
			<CardDialog open={updatingCard} onOpenChange={setUpdatingCard} />
			<PageGuide id="settings.billing" title="Facturatie" steps={GUIDE} />
		</>
	);
}

/** Three tiers side by side, and the cycle above them; picking one only changes the card once confirmed. */
function PlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const plan = useSettings((s) => s.plan);
	const cycle = useSettings((s) => s.cycle);
	const setPlan = useSettings((s) => s.setPlan);
	const [pick, setPick] = useState(plan);
	const [pickCycle, setPickCycle] = useState(cycle);
	const unchanged = pick === plan && pickCycle === cycle;
	// Each opening starts from the plan as it stands, not from the last visit's choice.
	useEffect(() => {
		if (!open) return;
		setPick(plan);
		setPickCycle(cycle);
	}, [open, plan, cycle]);

	function confirm() {
		const before = { plan, cycle };
		setPlan(pick, pickCycle);
		onOpenChange(false);
		undoable(`Je hebt nu ${TIERS[pick].name}, ${pickCycle === "annual" ? "jaarlijks" : "maandelijks"} gefactureerd`, () =>
			setPlan(before.plan, before.cycle),
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>Abonnement wijzigen</DialogTitle>
					<DialogDescription>De nieuwe prijs geldt vanaf je volgende verlenging. Jaarlijks betalen geeft twee maanden gratis.</DialogDescription>
				</DialogHeader>
				<div role="radiogroup" aria-label="Factuurperiode" className="flex self-start rounded-lg bg-mist p-0.5">
					{(["monthly", "annual"] as const).map((c) => (
						<button
							key={c}
							type="button"
							role="radio"
							aria-checked={pickCycle === c}
							onClick={() => setPickCycle(c)}
							className={cn(
								"flex h-7 items-center rounded-md px-3 font-medium text-sm transition-colors",
								pickCycle === c ? "bg-paper text-ink shadow-xs" : "text-ink-3 hover:text-ink",
							)}
						>
							{c === "monthly" ? "Maandelijks" : "Jaarlijks"}
						</button>
					))}
				</div>
				<div role="radiogroup" aria-label="Abonnement" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					{TIER_ORDER.map((t) => {
						const info = TIERS[t];
						const selected = pick === t;
						return (
							<button
								key={t}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => setPick(t)}
								className={cn(
									"flex flex-col gap-2 rounded-xl p-4 text-left transition-colors",
									selected ? "bg-arc-tint" : "bg-mist hover:bg-ink/6",
								)}
							>
								<span className="flex items-center justify-between">
									<span className="font-medium text-base text-ink">{info.name}</span>
									{selected ? <Check className="size-4 text-arc-ink" strokeWidth={2} /> : null}
								</span>
								<span className="font-medium text-2xl text-ink tabular-nums leading-none">
									{usd(priceFor(t, pickCycle))}
									<span className="font-normal text-sm text-ink-3"> /maand</span>
								</span>
								<span className="text-sm text-ink-2 tabular-nums leading-snug">
									{info.seats} plekken · {info.stores} {info.stores === 1 ? "winkel" : "winkels"} ·{" "}
									{info.replies.toLocaleString("nl-NL")} AI-antwoorden
								</span>
								<span className="text-sm text-ink-3 leading-snug">{info.pitch}</span>
								{t === plan ? <span className="font-medium text-xs text-ink-3">Huidig abonnement</span> : null}
							</button>
						);
					})}
				</div>
				<DialogFooter>
					<button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
						Annuleren
					</button>
					<button type="button" disabled={unchanged} onClick={confirm} className={PRIMARY}>
						Overstappen naar {TIERS[pick].name}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const REASONS = ["Het is te duur", "We missen een functie", "We sluiten de winkel", "We zijn overgestapt op een andere tool", "Iets anders"];

function CancelDialog({ open, onOpenChange, planName }: { open: boolean; onOpenChange: (v: boolean) => void; planName: string }) {
	const setCancelsOn = useSettings((s) => s.setCancelsOn);
	const [reason, setReason] = useState<string | null>(null);
	const [note, setNote] = useState("");
	useEffect(() => {
		if (!open) return;
		setReason(null);
		setNote("");
	}, [open]);

	function confirm() {
		setCancelsOn(RENEWAL);
		onOpenChange(false);
		undoable(`${planName} stopt op ${RENEWAL}`, () => setCancelsOn(null), "Tot die tijd blijft alles werken.");
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{planName} opzeggen?</DialogTitle>
					<DialogDescription>
						Je abonnement blijft actief tot {RENEWAL}, daarna is de werkruimte alleen-lezen. Tot die datum kun je altijd hervatten.
					</DialogDescription>
				</DialogHeader>
				<fieldset className="flex flex-col gap-1">
					<legend className="mb-1.5 font-medium text-xs text-ink-2">Waarom stop je?</legend>
					{REASONS.map((r) => (
						<label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-base text-ink hover:bg-ink/3">
							<input
								type="radio"
								name="cancel-reason"
								checked={reason === r}
								onChange={() => setReason(r)}
								className="size-4 accent-[var(--abyss)]"
							/>
							{r}
						</label>
					))}
				</fieldset>
				<Field label="Wil je ons nog iets laten weten? (optioneel)">
					<textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						rows={3}
						className={cn(INPUT_CLASS, "h-auto resize-none py-2")}
					/>
				</Field>
				<DialogFooter>
					<button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
						Abonnement houden
					</button>
					<button
						type="button"
						disabled={!reason}
						onClick={confirm}
						className="flex h-9 items-center justify-center rounded-md bg-signal-red px-3 font-medium text-base text-mesh-ink transition hover:bg-signal-red/90 disabled:pointer-events-none disabled:opacity-45"
					>
						Abonnement opzeggen
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** The account keeps the English country name; the invoice prints it in Dutch. */
const COUNTRY_NL: Record<string, string> = {
	Netherlands: "Nederland",
	Belgium: "België",
	Germany: "Duitsland",
	France: "Frankrijk",
	"United Kingdom": "Verenigd Koninkrijk",
	"United States": "Verenigde Staten",
};

const digits = (s: string) => s.replace(/\D/g, "");

/** The Luhn check every card number carries, so a typo is caught before it is "saved". */
function luhn(num: string) {
	let sum = 0;
	for (let i = 0; i < num.length; i++) {
		let d = Number(num[num.length - 1 - i]);
		if (i % 2 === 1) {
			d *= 2;
			if (d > 9) d -= 9;
		}
		sum += d;
	}
	return sum % 10 === 0;
}

function brandOf(num: string) {
	if (/^4/.test(num)) return "Visa";
	if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard";
	if (/^3[47]/.test(num)) return "Amex";
	return "Kaart";
}

function CardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const card = useSettings((s) => s.card);
	const setCard = useSettings((s) => s.setCard);
	const [number, setNumber] = useState("");
	const [expiry, setExpiry] = useState("");
	const [cvc, setCvc] = useState("");
	const [tried, setTried] = useState(false);
	useEffect(() => {
		if (!open) return;
		setNumber("");
		setExpiry("");
		setCvc("");
		setTried(false);
	}, [open]);

	const num = digits(number);
	const amex = /^3[47]/.test(num);
	const [mm, yy] = [Number(digits(expiry).slice(0, 2)), Number(digits(expiry).slice(2, 4))];
	const now = new Date();
	const expired = 2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1);
	const errors = {
		number: num.length < (amex ? 15 : 16) || !luhn(num) ? "Vul een geldig kaartnummer in" : null,
		expiry: digits(expiry).length !== 4 || mm < 1 || mm > 12 ? "Gebruik MM/JJ" : expired ? "Deze kaart is verlopen" : null,
		cvc: digits(cvc).length < (amex ? 4 : 3) ? `${amex ? "4" : "3"} cijfers op de kaart` : null,
	};
	const valid = !errors.number && !errors.expiry && !errors.cvc;

	function save() {
		setTried(true);
		if (!valid) return;
		const before = card;
		setCard({ brand: brandOf(num), last4: num.slice(-4), expiry: `${String(mm).padStart(2, "0")}/20${String(yy).padStart(2, "0")}` });
		onOpenChange(false);
		undoable(`${brandOf(num)} eindigend op ${num.slice(-4)} is nu opgeslagen`, () => setCard(before));
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Kaart bijwerken</DialogTitle>
					<DialogDescription>
						Vervangt {card.brand} eindigend op {card.last4}. Deze demo bewaart alleen de laatste vier cijfers.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<CardField label="Kaartnummer" error={tried ? errors.number : null}>
						<input
							inputMode="numeric"
							autoComplete="cc-number"
							placeholder="4242 4242 4242 4242"
							value={number}
							// Grouped in fours as it is typed, the way it is printed on the card.
							onChange={(e) => setNumber(digits(e.target.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "))}
							className={cn(INPUT_CLASS, "tabular-nums")}
						/>
					</CardField>
					<div className="grid grid-cols-2 gap-3">
						<CardField label="Vervaldatum" error={tried ? errors.expiry : null}>
							<input
								inputMode="numeric"
								autoComplete="cc-exp"
								placeholder="MM/JJ"
								value={expiry}
								onChange={(e) => {
									const d = digits(e.target.value).slice(0, 4);
									setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
								}}
								className={cn(INPUT_CLASS, "tabular-nums")}
							/>
						</CardField>
						<CardField label="CVC" error={tried ? errors.cvc : null}>
							<input
								inputMode="numeric"
								autoComplete="cc-csc"
								placeholder="123"
								type="password"
								value={cvc}
								onChange={(e) => setCvc(digits(e.target.value).slice(0, 4))}
								className={cn(INPUT_CLASS, "tabular-nums")}
							/>
						</CardField>
					</div>
					<DialogFooter>
						<button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
							Annuleren
						</button>
						<button type="submit" className={PRIMARY}>
							Kaart opslaan
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function CardField({ label, error, children }: { label: string; error: string | null; children: React.ReactNode }) {
	return (
		<Field label={label}>
			{children}
			{error ? <span className="text-signal-red text-xs">{error}</span> : null}
		</Field>
	);
}

/** A plain HTML invoice, named by its number, so the download is a real file the browser can open and print. */
function downloadInvoice(
	inv: (typeof INVOICES)[number],
	account: { legalEntity: string; vat: string; billingEmail: string; country: string },
) {
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
	const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>${inv.id}</title>
<style>body{font:14px/1.6 system-ui,sans-serif;color:#111;max-width:640px;margin:48px auto;padding:0 24px}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px 0;text-align:left;font-variant-numeric:tabular-nums}th{color:#666;font-weight:500}tfoot td{font-weight:600}.r{text-align:right}.muted{color:#666}</style>
</head><body>
<h1>Factuur ${inv.id}</h1>
<p class="muted">Uitgegeven ${inv.date} · Betaald</p>
<p><strong>Gefactureerd aan</strong><br>${esc(account.legalEntity)}<br>Btw ${esc(account.vat)}<br>${esc(COUNTRY_NL[account.country] ?? account.country)}<br>${esc(account.billingEmail)}</p>
<p><strong>Van</strong><br>Insyte B.V.<br>Amsterdam, Nederland</p>
<table><thead><tr><th>Omschrijving</th><th class="r">Bedrag</th></tr></thead>
<tbody><tr><td>Insyte Scale-abonnement, maandelijks</td><td class="r">${usd(inv.amount, 2)}</td></tr></tbody>
<tfoot><tr><td>Totaal betaald</td><td class="r">${usd(inv.amount, 2)}</td></tr></tfoot></table>
<p class="muted">Afgeschreven van de opgeslagen kaart. Gemaakt door de Insyte-demo.</p>
</body></html>`;
	const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = `${inv.id}.html`;
	a.click();
	URL.revokeObjectURL(url);
	toast.success(`${inv.id}.html gedownload`);
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"flex items-center px-4 py-3 font-medium text-base text-ink-3 leading-[1.2] tracking-[-0.028px]",
				className,
			)}
		>
			{children}
		</div>
	);
}

/*
 * Seats beyond the plan, one at a time. The team page sends a full workspace here; the price per
 * seat is not settled (PRODUCT.md), so this says how it is charged rather than what it costs.
 */
function ExtraSeats({ included }: { included: number }) {
	const seats = useSeats();
	const add = (n: number) => {
		useTeam.getState().addSeats(n);
		undoable(n > 0 ? "Plek bijgekocht" : "Extra plek opgezegd", () => useTeam.getState().addSeats(-n), n > 0 ? "Je kunt meteen iemand uitnodigen." : undefined);
	};
	return (
		<div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3", seats.full ? "bg-signal-amber-bg" : "bg-mist")}>
			<span className="min-w-0 font-medium text-base text-ink">
				{seats.full ? "Alle plekken zijn bezet" : "Extra plekken"} · {included} in je abonnement{seats.extra > 0 ? ` + ${seats.extra} extra` : ""}
			</span>
			<div className="flex items-center gap-1.5">
				<Gate perm="billing" arg={3}>
					<button type="button" onClick={() => add(-1)} disabled={seats.extra === 0 || seats.free === 0} className={cn(GHOST, "disabled:pointer-events-none disabled:opacity-45")}>
						Plek opzeggen
					</button>
				</Gate>
				<Gate perm="billing" arg={3}>
					<button type="button" onClick={() => add(1)} className={PRIMARY}>
						Plek bijkopen
					</button>
				</Gate>
			</div>
		</div>
	);
}
