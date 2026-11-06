import { useParams } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, RotateCcw, X } from "../../../icons";
import { deliveriesSeed, designControls, products, stores } from "../../../data-source";
import { formatCurrency } from "../../lib/format";
import {
	type ReasonDef,
	type Resolution,
	RESOLUTION_DETAIL,
	RESOLUTION_LABEL,
	resolutionsFor,
	type ReturnKind,
	type ReturnRecord,
	ruleFor,
	STATUS_LABEL,
	windowCheck,
	windowDaysFor,
} from "../../lib/returns";
import type { Order } from "../../lib/types/domain";
import { cn } from "../../lib/utils";
import { useReturns } from "../../stores/returns-store";
import { useWorkspace } from "../../stores/workspace-store";

/*
 * The public returns portal (`/retour/$storeHandle`, PLAN 25, design §1): where a shopper starts a
 * return or reports a problem, on their phone, without an account. It is the store's page, not
 * Insyte's: the store's name at the head, its words from Instellingen → Retouren, and only "Mogelijk
 * gemaakt door Insyte" at the foot. Its own small shell — nothing from the console's chrome.
 *
 * The rules are the console's (`lib/returns.ts`): the window from delivery, the product rules, the
 * resolutions on offer. Every refusal says why and what the shopper can still do.
 */

const HANDLES: Record<string, string> = { "northwind-eu": "store_eu", "northwind-us": "store_us" };
const SIZES = ["Klein", "Middel", "Groot"];
const SIZE: Record<string, string> = { s: "Klein", m: "Middel", l: "Groot" };
const day = (d: Date | string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(typeof d === "string" ? new Date(d) : d);

type Step = "lookup" | "kind" | "items" | "reason" | "photos" | "resolution" | "summary" | "done";

type Pick = { lineId: string; productId: string; variantId: string; title: string; variantTitle: string; unitPrice: number; image?: string | undefined };

export function ReturnPortal() {
	const { storeHandle } = useParams({ strict: false }) as { storeHandle?: string };
	const storeId = HANDLES[storeHandle ?? ""] ?? null;
	const store = stores.find((s) => s.id === storeId);
	const settings = useReturns((s) => s.settings);
	const records = useReturns((s) => s.records);
	const orders = useWorkspace((s) => s.orders);
	const still = useReducedMotion();

	const [step, setStep] = useState<Step>("lookup");
	const [number, setNumber] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<ReactNode>(null);
	const [order, setOrder] = useState<Order | null>(null);
	const [kind, setKind] = useState<ReturnKind>("return");
	const [picked, setPicked] = useState<Pick[]>([]);
	const [reason, setReason] = useState<ReasonDef | null>(null);
	const [note, setNote] = useState("");
	const [photos, setPhotos] = useState<Array<{ name: string; url: string }>>([]);
	const [resolution, setResolution] = useState<Resolution | null>(null);
	const [exchangeTo, setExchangeTo] = useState<string | null>(null);
	const [made, setMade] = useState<ReturnRecord | null>(null);
	const top = useRef<HTMLDivElement>(null);

	const go = (s: Step) => {
		setError(null);
		setStep(s);
		top.current?.scrollIntoView({ block: "start" });
	};

	if (!store) {
		return (
			<PortalShell storeName="Retourportaal">
				<Card>
					<Title>Deze winkel vinden we niet</Title>
					<p className="text-ink-2">Controleer het adres in je verzendmail. Daar staat de juiste link naar het retourportaal.</p>
				</Card>
			</PortalShell>
		);
	}

	if (!settings.portal.on) {
		return (
			<PortalShell storeName={store.name}>
				<Card>
					<span className="flex size-10 items-center justify-center rounded-lg bg-mist text-ink-2">
						<Lock className="size-5" strokeWidth={1.75} />
					</span>
					<Title>Retourneren via dit portaal kan nu niet</Title>
					<p className="text-ink-2">Mail ons met je bestelnummer, dan helpen we je verder.</p>
				</Card>
			</PortalShell>
		);
	}

	const delivered = order ? (deliveriesSeed[order.id] ?? (order.status === "delivered" ? order.updated_at : undefined)) : undefined;
	const openReturn = order ? records.find((r) => r.orderId === order.id && r.status !== "resolved" && r.status !== "rejected") : undefined;
	const reasons = settings.reasons.filter((r) => r.claim === (kind === "claim"));
	const amount = picked.reduce((n, p) => n + p.unitPrice, 0);

	/** Per line: may it go back, and if not, the sentence that says why. */
	const lineState = (o: Order, lineId: string): { ok: boolean; why?: string } => {
		const line = o.line_items.find((l) => l.id === lineId);
		if (!line) return { ok: false };
		const taken = records.find((r) => r.orderId === o.id && r.status !== "rejected" && r.items.some((i) => i.lineId === lineId));
		if (taken) return { ok: false, why: `Al aangevraagd in ${taken.number}: ${STATUS_LABEL[taken.status].toLowerCase()}.` };
		if (!delivered) return { ok: false, why: "Nog niet bezorgd. Zodra het pakket binnen is, kun je hier terecht." };
		const days = windowDaysFor(kind, undefined, settings);
		const w = windowCheck(delivered, days, Date.now());
		if (!w.inside) return { ok: false, why: `De ${kind === "claim" ? "termijn om een probleem te melden" : "retourtermijn"} van ${days} dagen sloot op ${day(w.closesOn)}.` };
		const p = products.find((x) => x.id === line.product_id);
		const rule = ruleFor(settings.rules, { productId: line.product_id, variantId: line.variant_id, tags: [...(p?.tags ?? []), ...o.tags] });
		if (rule && resolutionsFor(settings.offered, rule, kind).length === 0) return { ok: false, why: rule.note };
		return { ok: true };
	};

	const lookup = () => {
		const n = number.trim().toUpperCase().replace(/^#/, "");
		const o = orders.find((x) => x.number.toUpperCase() === (n.startsWith("SO-") ? n : `SO-${n}`));
		if (!o || o.customer_email.toLowerCase() !== email.trim().toLowerCase()) {
			setError("We vinden geen bestelling met dit nummer en e-mailadres. Kijk in je bevestigingsmail: het nummer begint met SO-.");
			return;
		}
		setOrder(o);
		setPicked([]);
		go("kind");
	};

	const rule0 = picked[0] ? ruleFor(settings.rules, { productId: picked[0].productId, variantId: picked[0].variantId, tags: [...(products.find((p) => p.id === picked[0]?.productId)?.tags ?? []), ...(order?.tags ?? [])] }) : undefined;
	const options = resolutionsFor(settings.offered, rule0, kind).filter((r) => r !== "discount");

	const submit = () => {
		if (!order || !reason || !resolution) return;
		const rec = useReturns.getState().create(
			{
				kind,
				orderId: order.id,
				orderNumber: order.number,
				customerId: order.customer_id,
				customerName: order.customer_name,
				customerEmail: order.customer_email,
				storeId: order.store_id,
				country: order.shipping_address?.country ?? "NL",
				currency: order.currency,
				items: picked.map((p) => ({ lineId: p.lineId, productId: p.productId, variantId: p.variantId, title: p.title, variantTitle: p.variantTitle, qty: 1, unitPrice: p.unitPrice })),
				reason: reason.id,
				note: note.trim() || reason.label,
				photos: photos.map((p) => p.url),
				requested: resolution,
				exchangeTo: resolution === "exchange" ? (exchangeTo ?? undefined) : undefined,
				deliveredAt: delivered ?? new Date().toISOString(),
			},
			{ at: new Date().toISOString(), who: "shopper", name: order.customer_name, text: kind === "claim" ? "Claim gemeld in het retourportaal" : "Retour aangevraagd in het retourportaal" },
		);
		setMade(rec);
		go("done");
	};

	const claimStep = (i: number) => (kind === "claim" ? <p className="text-ink-3 text-sm">Stap {i} van {settings.claimSteps.length} · {settings.claimSteps[i - 1]}</p> : null);

	return (
		<PortalShell storeName={store.name}>
			<div ref={top} className="scroll-mt-4" />
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={step}
					initial={still ? false : { opacity: 0, x: 12 }}
					animate={{ opacity: 1, x: 0 }}
					exit={still ? { opacity: 0 } : { opacity: 0, x: -12 }}
					transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
				>
					{step === "lookup" ? (
						<Card>
							<Title>Retourneren of een probleem melden</Title>
							<p className="text-ink-2">{settings.portal.intro}</p>
							<form
								className="flex flex-col gap-3"
								onSubmit={(e) => {
									e.preventDefault();
									lookup();
								}}
							>
								<Labeled label="Bestelnummer">
									<input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SO-12231" autoComplete="off" className={INPUT} aria-invalid={error ? true : undefined} />
								</Labeled>
								<Labeled label="E-mailadres van de bestelling">
									<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" autoComplete="email" className={INPUT} aria-invalid={error ? true : undefined} />
								</Labeled>
								{error ? <Problem>{error}</Problem> : null}
								<Primary disabled={!number.trim() || !email.trim()} type="submit">
									Bestelling zoeken
								</Primary>
							</form>
							{designControls ? (
								<p className="border-ink/8 border-t pt-3 text-ink-3 text-xs leading-relaxed">
									In de demo: SO-12249 met hannah@example.com (binnen de termijn), SO-12231 met bea@example.com (al aangevraagd), SO-12226 met olivier@example.com (buiten de termijn), SO-12208 met felix@example.com (een claim) of SO-12204 met luca.r@example.com (nog niet bezorgd).
								</p>
							) : null}
						</Card>
					) : null}

					{step === "kind" && order ? (
						<Card>
							<Back onClick={() => go("lookup")} />
							<Title>Bestelling {order.number}</Title>
							<p className="text-ink-2">
								{order.customer_name.split(" ")[0]}, {delivered ? `bezorgd op ${day(delivered)}` : "nog onderweg"} · {order.line_items.length} {order.line_items.length === 1 ? "artikel" : "artikelen"}
							</p>
							{openReturn ? (
								<div className="flex flex-col gap-1 rounded-lg bg-arc-tint px-4 py-3">
									<p className="font-medium text-arc-ink">Je hebt al een aanvraag: {openReturn.number}</p>
									<p className="text-ink-2 text-sm">
										Status: {STATUS_LABEL[openReturn.status].toLowerCase()}. {openReturn.status === "review" ? "We kijken er binnen twee werkdagen naar." : openReturn.label ? `Het label van ${openReturn.label.carrier} staat in je mail.` : "Je krijgt bericht zodra er iets verandert."}
									</p>
								</div>
							) : null}
							<div className="flex flex-col gap-2">
								<Choice
									title="Iets terugsturen"
									body={`Te klein, te groot of anders dan verwacht. Binnen ${settings.returnDays} dagen na bezorging.`}
									onClick={() => {
										setKind("return");
										setPicked([]);
										go("items");
									}}
								/>
								<Choice
									title="Een probleem melden"
									body="Beschadigd, verkeerd of niet goed. Met een foto erbij handelen we het snel af."
									onClick={() => {
										setKind("claim");
										setPicked([]);
										go("items");
									}}
								/>
							</div>
						</Card>
					) : null}

					{step === "items" && order ? (
						<Card>
							<Back onClick={() => go("kind")} />
							<Title>{kind === "claim" ? "Met welk artikel is iets mis?" : "Wat wil je terugsturen?"}</Title>
							{claimStep(1)}
							<ul className="flex flex-col gap-2">
								{order.line_items.map((l) => {
									const st = lineState(order, l.id);
									const p = products.find((x) => x.id === l.product_id);
									const on = picked.some((x) => x.lineId === l.id);
									return (
										<li key={l.id}>
											<button
												type="button"
												disabled={!st.ok}
												aria-pressed={on}
												onClick={() =>
													setPicked((x) =>
														on ? x.filter((y) => y.lineId !== l.id) : [...x, { lineId: l.id, productId: l.product_id, variantId: l.variant_id, title: p?.title ?? l.title, variantTitle: SIZE[l.variant_id.slice(-1)] ?? l.variant_title, unitPrice: l.unit_price, image: p?.images[0] }],
													)
												}
												className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors", on ? "bg-arc-tint" : "bg-mist", st.ok ? "hover:bg-ink/6" : "cursor-not-allowed")}
											>
												{p?.images[0] ? <img src={p.images[0]} alt="" className={cn("size-14 shrink-0 rounded-lg object-cover", !st.ok && "opacity-50")} /> : <span className="size-14 shrink-0 rounded-lg bg-ink/6" />}
												<span className="flex min-w-0 flex-1 flex-col gap-0.5">
													<span className={cn("font-medium", st.ok ? "text-ink" : "text-ink-3")}>{p?.title ?? l.title}</span>
													<span className="text-ink-3 text-sm">
														{SIZE[l.variant_id.slice(-1)] ?? l.variant_title} · {formatCurrency(l.unit_price, order.currency)}
													</span>
													{st.why ? <span className="text-ink-2 text-sm">{st.why}</span> : null}
												</span>
												<span className={cn("mt-1 flex size-5 shrink-0 items-center justify-center rounded-md", on ? "bg-arc text-mesh-ink" : st.ok ? "bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]" : "")}>
													{on ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
							<Primary disabled={picked.length === 0} onClick={() => go("reason")}>
								Verder
							</Primary>
						</Card>
					) : null}

					{step === "reason" ? (
						<Card>
							<Back onClick={() => go("items")} />
							<Title>{kind === "claim" ? "Wat is er mis?" : "Waarom stuur je het terug?"}</Title>
							{claimStep(1)}
							<div className="flex flex-col gap-2" role="radiogroup" aria-label="Reden">
								{reasons.map((r) => (
									<button key={r.id} type="button" role="radio" aria-checked={reason?.id === r.id} onClick={() => setReason(r)} className={cn("flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors", reason?.id === r.id ? "bg-arc-tint font-medium text-arc-ink" : "bg-mist text-ink hover:bg-ink/6")}>
										{r.label}
										{r.photoRequired ? <span className="font-normal text-ink-3 text-xs">foto nodig</span> : null}
									</button>
								))}
							</div>
							<Labeled label="Vertel er iets meer over (mag ook leeg)">
								<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(INPUT, "h-auto py-3 leading-relaxed")} placeholder={kind === "claim" ? "Bijvoorbeeld: de naad bij de schouder is gescheurd" : "Bijvoorbeeld: valt kleiner dan de maattabel"} />
							</Labeled>
							<Primary disabled={!reason} onClick={() => go(reason?.photoRequired ? "photos" : "resolution")}>
								Verder
							</Primary>
						</Card>
					) : null}

					{step === "photos" ? (
						<Card>
							<Back onClick={() => go("reason")} />
							<Title>Foto's van het artikel</Title>
							{claimStep(2)}
							<p className="text-ink-2">Een foto van het probleem en een van de verpakking helpen ons het snelst. Minstens één is nodig.</p>
							<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg bg-mist px-4 py-8 text-center text-ink-2 transition-colors hover:bg-ink/6">
								<ImageIcon className="size-6 text-ink-3" strokeWidth={1.75} />
								<span className="font-medium text-ink">Foto's kiezen</span>
								<span className="text-sm">Of maak er een met je camera</span>
								<input
									type="file"
									accept="image/*"
									multiple
									className="sr-only"
									onChange={(e) => {
										const files = [...(e.target.files ?? [])].slice(0, 6);
										setPhotos((x) => [...x, ...files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))].slice(0, 6));
									}}
								/>
							</label>
							{photos.length ? (
								<ul className="flex flex-wrap gap-2">
									{photos.map((p) => (
										<li key={p.url} className="relative">
											<img src={p.url} alt={p.name} className="size-20 rounded-lg object-cover" />
											<button type="button" aria-label={`${p.name} weghalen`} onClick={() => setPhotos((x) => x.filter((y) => y.url !== p.url))} className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-paper text-ink-2 shadow-[0_1px_3px_rgb(0_0_0/0.15)]">
												<X className="size-3.5" strokeWidth={2} />
											</button>
										</li>
									))}
								</ul>
							) : null}
							<Primary disabled={photos.length === 0} onClick={() => go("resolution")}>
								Verder
							</Primary>
						</Card>
					) : null}

					{step === "resolution" ? (
						<Card>
							<Back onClick={() => go(reason?.photoRequired ? "photos" : "reason")} />
							<Title>Wat wil je dat we doen?</Title>
							{claimStep(3)}
							{rule0 && rule0.kind !== "not_returnable" ? <p className="rounded-lg bg-mist px-4 py-3 text-ink-2 text-sm">{rule0.note}</p> : null}
							<div className="flex flex-col gap-2" role="radiogroup" aria-label="Oplossing">
								{options.map((r) => (
									<button key={r} type="button" role="radio" aria-checked={resolution === r} onClick={() => setResolution(r)} className={cn("flex flex-col gap-0.5 rounded-lg px-4 py-3 text-left transition-colors", resolution === r ? "bg-arc-tint" : "bg-mist hover:bg-ink/6")}>
										<span className={cn("font-medium", resolution === r ? "text-arc-ink" : "text-ink")}>
											{r === "gift_card" && settings.giftCardBonus > 0 ? `${RESOLUTION_LABEL[r]} met ${settings.giftCardBonus}% extra` : RESOLUTION_LABEL[r]}
										</span>
										<span className="text-ink-2 text-sm">Je krijgt {RESOLUTION_DETAIL[r]}.</span>
									</button>
								))}
							</div>
							{resolution === "exchange" ? (
								<div className="flex flex-col gap-2">
									<span className="font-medium text-ink text-sm">Welke maat wil je?</span>
									<div className="flex gap-2">
										{SIZES.filter((s) => s !== picked[0]?.variantTitle).map((s) => (
											<button key={s} type="button" aria-pressed={exchangeTo === s} onClick={() => setExchangeTo(s)} className={cn("h-11 flex-1 rounded-md font-medium transition-colors", exchangeTo === s ? "bg-abyss text-mesh-ink" : "bg-mist text-ink hover:bg-ink/6")}>
												{s}
											</button>
										))}
									</div>
								</div>
							) : null}
							<Primary disabled={!resolution || (resolution === "exchange" && !exchangeTo)} onClick={() => go("summary")}>
								Verder
							</Primary>
						</Card>
					) : null}

					{step === "summary" && order && reason && resolution ? (
						<Card>
							<Back onClick={() => go("resolution")} />
							<Title>Klopt dit?</Title>
							<dl className="flex flex-col gap-3">
								<Row k="Bestelling">{order.number}</Row>
								<Row k={kind === "claim" ? "Probleem met" : "Terug"}>
									<ul className="flex flex-col gap-1.5">
										{picked.map((p) => (
											<li key={p.lineId} className="flex items-center gap-2">
												{p.image ? <img src={p.image} alt="" className="size-9 rounded-md object-cover" /> : null}
												<span>
													{p.title} · {p.variantTitle}
												</span>
											</li>
										))}
									</ul>
								</Row>
								<Row k="Reden">{reason.label}{note.trim() ? `: “${note.trim()}”` : ""}</Row>
								{photos.length ? <Row k="Foto's">{photos.length}</Row> : null}
								<Row k="Je wilt">
									{RESOLUTION_LABEL[resolution]}
									{resolution === "exchange" && exchangeTo ? ` naar ${exchangeTo}` : ""}
									{resolution === "refund" ? ` · ${formatCurrency(amount, order.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
								</Row>
							</dl>
							<Primary onClick={submit}>{kind === "claim" ? "Probleem melden" : "Retour aanvragen"}</Primary>
						</Card>
					) : null}

					{step === "done" && made ? (
						<Card>
							<span className="flex size-11 items-center justify-center rounded-full bg-arc-tint text-arc-ink">
								<Check className="size-5" strokeWidth={2.25} />
							</span>
							<Title>{made.kind === "claim" ? "Probleem gemeld" : "Retour aangevraagd"}</Title>
							<p className="text-ink">
								Je nummer is <span className="font-medium tabular-nums">{made.number}</span>. We hebben een bevestiging gestuurd naar {made.customerEmail}.
							</p>
							<ol className="flex flex-col gap-2.5">
								{[
									"We bekijken je aanvraag binnen twee werkdagen.",
									made.kind === "claim" && made.requested === "replacement" ? "Is het goedgekeurd, dan sturen we het nieuwe artikel; terugsturen is misschien niet nodig." : "Is het goedgekeurd, dan krijg je een retourlabel per mail. Print het of laat de code scannen bij een afgiftepunt.",
									made.requested === "refund" ? "Zodra het pakket binnen is, betalen we je terug op dezelfde betaalmethode." : made.requested === "exchange" ? `Zodra het pakket binnen is, sturen we maat ${made.exchangeTo ?? "die je koos"}.` : "Zodra het rond is, krijg je bericht.",
								].map((t, i) => (
									<li key={t} className="flex gap-3 text-ink-2">
										<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mist font-medium text-ink text-xs tabular-nums">{i + 1}</span>
										{t}
									</li>
								))}
							</ol>
							<p className="text-ink-3 text-sm">{settings.portal.done}</p>
							<button
								type="button"
								onClick={() => {
									setOrder(null);
									setNumber("");
									setEmail("");
									setPicked([]);
									setReason(null);
									setNote("");
									setPhotos([]);
									setResolution(null);
									setExchangeTo(null);
									setMade(null);
									go("lookup");
								}}
								className="flex h-11 items-center justify-center gap-1.5 rounded-md font-medium text-arc-ink hover:bg-arc-tint"
							>
								<RotateCcw className="size-4" strokeWidth={1.75} />
								Nog iets terugsturen
							</button>
						</Card>
					) : null}
				</motion.div>
			</AnimatePresence>
		</PortalShell>
	);
}

/* ── the portal's own small shell ──────────────────────────────────────────────────────────── */

function PortalShell({ storeName, children }: { storeName: string; children: ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col bg-glacier text-base text-ink">
			<header className="flex h-16 items-center justify-center px-4">
				<span className="font-medium text-ink text-lg tracking-tight">{storeName}</span>
			</header>
			<main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 pb-10">{children}</main>
			<footer className="flex justify-center px-4 pb-6 text-ink-3 text-xs">Mogelijk gemaakt door Insyte</footer>
		</div>
	);
}

function Card({ children }: { children: ReactNode }) {
	return <section className="flex flex-col gap-4 rounded-xl bg-paper px-5 py-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">{children}</section>;
}

const Title = ({ children }: { children: ReactNode }) => <h1 className="text-balance font-medium text-ink text-xl leading-snug">{children}</h1>;

const INPUT = "field h-12 w-full rounded-md px-4 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper aria-[invalid=true]:bg-signal-red-bg";

function Labeled({ label, children }: { label: string; children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
		<label className="flex flex-col gap-1.5">
			<span className="font-medium text-ink-2 text-sm">{label}</span>
			{children}
		</label>
	);
}

function Primary({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
	return (
		<button type={type} disabled={disabled} onClick={onClick} className="flex h-12 items-center justify-center gap-2 rounded-md bg-abyss font-medium text-mesh-ink transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3">
			{children}
			{disabled ? null : <ArrowRight className="size-4" strokeWidth={2} />}
		</button>
	);
}

function Back({ onClick }: { onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="-ml-1 flex h-8 w-fit items-center gap-1 rounded-md px-1 text-ink-2 text-sm hover:text-ink">
			<ArrowLeft className="size-4" strokeWidth={1.75} />
			Terug
		</button>
	);
}

function Choice({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="group flex items-center gap-3 rounded-lg bg-mist px-4 py-4 text-left transition-colors hover:bg-ink/6">
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="font-medium text-ink">{title}</span>
				<span className="text-ink-2 text-sm">{body}</span>
			</span>
			<ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
		</button>
	);
}

function Problem({ children }: { children: ReactNode }) {
	return (
		<p role="alert" className="flex items-start gap-2 rounded-lg bg-signal-red-bg px-4 py-3 text-ink text-sm">
			<AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-red" strokeWidth={2} />
			<span>{children}</span>
		</p>
	);
}

function Row({ k, children }: { k: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 border-ink/8 border-b pb-3 last:border-b-0 last:pb-0">
			<dt className="text-ink-3 text-sm">{k}</dt>
			<dd className="text-ink">{children}</dd>
		</div>
	);
}

