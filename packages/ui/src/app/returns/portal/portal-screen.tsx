import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, RotateCcw, X } from "../../../icons";
import { createHumanCheck, HumanCheck } from "../../auth/human-check";
import { formatCurrency } from "../../lib/format";
import { RESOLUTION_DETAIL, RESOLUTION_LABEL, type Resolution, resolutionsFor, type ReturnKind, STATUS_LABEL } from "../../lib/returns";
import { cn } from "../../lib/utils";
import { type LineRefusal, type PortalLine, type PortalMade, type PortalOrderView, type PortalPhoto, type PortalReason, usePortalSource } from "./source";

/*
 * The public returns portal (`/retour/$storeHandle`, PLAN 25, design §1): where a shopper starts a
 * return or reports a problem, on their phone, without an account. It is the store's page, not
 * Insyte's: the store's name at the head, its words from Instellingen → Retouren, and only "Mogelijk
 * gemaakt door Insyte" at the foot. Its own small shell — nothing from the console's chrome.
 *
 * The rules are the console's (`lib/returns.ts`): the window from delivery, the product rules, the
 * resolutions on offer. Every refusal says why and what the shopper can still do. What may go back
 * is the host's to say (`source.tsx`); the sentences are written here.
 */

const day = (d: Date | string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(typeof d === "string" ? new Date(d) : d);

type Step = "lookup" | "kind" | "items" | "reason" | "photos" | "resolution" | "summary" | "done";

/** Why a line cannot go back, as the shopper reads it. */
const why = (r: LineRefusal, kind: ReturnKind) =>
	r.kind === "taken"
		? `Al aangevraagd in ${r.number}: ${STATUS_LABEL[r.status].toLowerCase()}.`
		: r.kind === "not_delivered"
			? "Nog niet bezorgd. Zodra het pakket binnen is, kun je hier terecht."
			: r.kind === "window"
				? `De ${kind === "claim" ? "termijn om een probleem te melden" : "retourtermijn"} van ${r.days} dagen sloot op ${day(r.closesOn)}.`
				: r.note;

const LOOKUP_PROBLEM = {
	not_found: "We vinden geen bestelling met dit nummer en e-mailadres. Kijk in je bevestigingsmail welk bestelnummer en e-mailadres erbij horen.",
	rate_limited: "Te veel pogingen. Probeer het later opnieuw.",
	human_check: "We konden niet controleren dat je geen robot bent. Probeer het opnieuw.",
	failed: "Er ging iets mis. Probeer het opnieuw.",
} as const;

const PHOTO_PROBLEM = {
	type: "Dat bestand is geen foto. Kies een JPG, PNG of HEIC.",
	size: "Die foto is groter dan 10 MB. Kies een kleinere.",
	failed: "Een foto kwam niet door. Probeer het opnieuw.",
} as const;

export function ReturnPortal() {
	const source = usePortalSource();
	const store = source.store;
	const still = useReducedMotion();
	const human = useMemo(createHumanCheck, []);

	const [step, setStep] = useState<Step>("lookup");
	const [number, setNumber] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<ReactNode>(null);
	const [busy, setBusy] = useState(false);
	const [order, setOrder] = useState<PortalOrderView | null>(null);
	const [kind, setKind] = useState<ReturnKind>("return");
	const [picked, setPicked] = useState<PortalLine[]>([]);
	const [reason, setReason] = useState<PortalReason | null>(null);
	const [note, setNote] = useState("");
	const [photos, setPhotos] = useState<PortalPhoto[]>([]);
	const [resolution, setResolution] = useState<Resolution | null>(null);
	const [exchangeTo, setExchangeTo] = useState<string | null>(null);
	const [made, setMade] = useState<PortalMade | null>(null);
	const top = useRef<HTMLDivElement>(null);

	const go = (s: Step, problem: ReactNode = null) => {
		setError(problem);
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

	if (!store.on) {
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

	const delivered = order?.deliveredAt ?? undefined;
	const openReturn = order?.open ?? undefined;
	const reasons = store.reasons.filter((r) => r.claim === (kind === "claim"));
	const amount = picked.reduce((n, p) => n + p.unitPrice, 0);

	const lookup = async () => {
		setBusy(true);
		const token = await human.token();
		const found = await source.lookup(number, email, token);
		human.spent();
		setBusy(false);
		if (!found.ok) {
			setError(LOOKUP_PROBLEM[found.problem]);
			return;
		}
		setOrder(found.order);
		setPicked([]);
		go("kind");
	};

	const rule0 = picked[0]?.rule ?? undefined;
	// An exchange needs something to exchange to.
	const options = resolutionsFor(store.offered, rule0, kind).filter((r) => r !== "discount" && (r !== "exchange" || (picked[0]?.exchange.length ?? 0) > 0));

	const addPhotos = async (files: File[]) => {
		const room = 6 - photos.length;
		if (room <= 0) return;
		setBusy(true);
		const added = await source.addPhotos(files.slice(0, room));
		setBusy(false);
		setPhotos((x) => [...x, ...added.photos].slice(0, 6));
		setError(added.problem ? PHOTO_PROBLEM[added.problem] : null);
	};

	const submit = async () => {
		if (!order || !reason || !resolution) return;
		setBusy(true);
		const sent = await source.submit({
			kind,
			lineIds: picked.map((p) => p.id),
			reasonId: reason.id,
			note,
			photoIds: photos.map((p) => p.id),
			resolution,
			exchangeTo: resolution === "exchange" ? (exchangeTo ?? undefined) : undefined,
		});
		setBusy(false);
		if (sent.ok) {
			setMade(sent.made);
			go("done");
			return;
		}
		const p = sent.problem;
		if (p.kind === "expired") go("lookup", "Je bestelling staat niet meer open. Zoek hem opnieuw op, dan kun je verder.");
		else if (p.kind === "line") go("items", "Een van de artikelen kan niet meer terug. Kijk hieronder waarom.");
		else if (p.kind === "photo") go("photos", "Voeg minstens één foto toe.");
		else if (p.kind === "resolution") go("resolution", "Deze oplossing kan niet voor dit artikel. Kies een andere.");
		else setError(p.kind === "rate_limited" ? LOOKUP_PROBLEM.rate_limited : LOOKUP_PROBLEM.failed);
	};

	const claimStep = (i: number) => (kind === "claim" ? <p className="text-ink-3 text-sm">Stap {i} van {store.claimSteps.length} · {store.claimSteps[i - 1]}</p> : null);

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
							<p className="text-ink-2">{store.intro}</p>
							<form
								className="flex flex-col gap-3"
								onSubmit={(e) => {
									e.preventDefault();
									void lookup();
								}}
							>
								<Labeled label="Bestelnummer">
									<input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={source.numberPlaceholder ?? "#1042"} autoComplete="off" className={INPUT} aria-invalid={error ? true : undefined} />
								</Labeled>
								<Labeled label="E-mailadres van de bestelling">
									<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" autoComplete="email" className={INPUT} aria-invalid={error ? true : undefined} />
								</Labeled>
								<HumanCheck controller={human} />
								{error ? <Problem>{error}</Problem> : null}
								<Primary disabled={busy || !number.trim() || !email.trim()} type="submit">
									Bestelling zoeken
								</Primary>
							</form>
							{source.hints ?? null}
						</Card>
					) : null}

					{step === "kind" && order ? (
						<Card>
							<Back onClick={() => go("lookup")} />
							<Title>Bestelling {order.number}</Title>
							<p className="text-ink-2">
								{order.firstName}, {delivered ? `bezorgd op ${day(delivered)}` : "nog onderweg"} · {order.lines.length} {order.lines.length === 1 ? "artikel" : "artikelen"}
							</p>
							{openReturn ? (
								<div className="flex flex-col gap-1 rounded-lg bg-arc-tint px-4 py-3">
									<p className="font-medium text-arc-ink">Je hebt al een aanvraag: {openReturn.number}</p>
									<p className="text-ink-2 text-sm">
										Status: {STATUS_LABEL[openReturn.status].toLowerCase()}. {openReturn.status === "review" ? "We kijken er binnen twee werkdagen naar." : openReturn.labelCarrier ? `Het label van ${openReturn.labelCarrier} staat in je mail.` : "Je krijgt bericht zodra er iets verandert."}
									</p>
								</div>
							) : null}
							<div className="flex flex-col gap-2">
								<Choice
									title="Iets terugsturen"
									body={`Te klein, te groot of anders dan verwacht. Binnen ${store.returnDays} dagen na bezorging.`}
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
								{order.lines.map((l) => {
									const no = kind === "claim" ? l.claim : l.return;
									const on = picked.some((x) => x.id === l.id);
									return (
										<li key={l.id}>
											<button
												type="button"
												disabled={no !== null}
												aria-pressed={on}
												onClick={() => setPicked((x) => (on ? x.filter((y) => y.id !== l.id) : [...x, l]))}
												className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors", on ? "bg-arc-tint" : "bg-mist", no === null ? "hover:bg-ink/6" : "cursor-not-allowed")}
											>
												{l.image ? <img src={l.image} alt="" className={cn("size-14 shrink-0 rounded-lg object-cover", no !== null && "opacity-50")} /> : <span className="size-14 shrink-0 rounded-lg bg-ink/6" />}
												<span className="flex min-w-0 flex-1 flex-col gap-0.5">
													<span className={cn("font-medium", no === null ? "text-ink" : "text-ink-3")}>{l.title}</span>
													<span className="text-ink-3 text-sm">
														{l.variantTitle ? `${l.variantTitle} · ` : ""}{formatCurrency(l.unitPrice, order.currency)}
													</span>
													{no !== null ? <span className="text-ink-2 text-sm">{why(no, kind)}</span> : null}
												</span>
												<span className={cn("mt-1 flex size-5 shrink-0 items-center justify-center rounded-md", on ? "bg-arc text-mesh-ink" : no === null ? "bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]" : "")}>
													{on ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
							{error ? <Problem>{error}</Problem> : null}
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
										void addPhotos([...(e.target.files ?? [])]);
										e.target.value = "";
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
							{error ? <Problem>{error}</Problem> : null}
							<Primary disabled={busy || photos.length === 0} onClick={() => go("resolution")}>
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
											{r === "gift_card" && store.giftCardBonus > 0 ? `${RESOLUTION_LABEL[r]} met ${store.giftCardBonus}% extra` : RESOLUTION_LABEL[r]}
										</span>
										<span className="text-ink-2 text-sm">Je krijgt {RESOLUTION_DETAIL[r]}.</span>
									</button>
								))}
							</div>
							{resolution === "exchange" ? (
								<div className="flex flex-col gap-2">
									<span className="font-medium text-ink text-sm">Welke maat wil je?</span>
									<div className="flex gap-2">
										{(picked[0]?.exchange ?? []).map((s) => (
											<button key={s} type="button" aria-pressed={exchangeTo === s} onClick={() => setExchangeTo(s)} className={cn("h-11 flex-1 rounded-md font-medium transition-colors", exchangeTo === s ? "bg-abyss text-mesh-ink" : "bg-mist text-ink hover:bg-ink/6")}>
												{s}
											</button>
										))}
									</div>
								</div>
							) : null}
							{error ? <Problem>{error}</Problem> : null}
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
											<li key={p.id} className="flex items-center gap-2">
												{p.image ? <img src={p.image} alt="" className="size-9 rounded-md object-cover" /> : null}
												<span>
													{p.title}
													{p.variantTitle ? ` · ${p.variantTitle}` : ""}
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
							{error ? <Problem>{error}</Problem> : null}
							<Primary disabled={busy} onClick={() => void submit()}>
								{kind === "claim" ? "Probleem melden" : "Retour aanvragen"}
							</Primary>
						</Card>
					) : null}

					{step === "done" && made ? (
						<Card>
							<span className="flex size-11 items-center justify-center rounded-full bg-arc-tint text-arc-ink">
								<Check className="size-5" strokeWidth={2.25} />
							</span>
							<Title>{made.kind === "claim" ? "Probleem gemeld" : "Retour aangevraagd"}</Title>
							<p className="text-ink">
								Je nummer is <span className="font-medium tabular-nums">{made.number}</span>. {made.mailed ? `We hebben een bevestiging gestuurd naar ${email.trim()}.` : "Bewaar het: daarmee vinden we je aanvraag terug."}
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
							<p className="text-ink-3 text-sm">{store.done}</p>
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

