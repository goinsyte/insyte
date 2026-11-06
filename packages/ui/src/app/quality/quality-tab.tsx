import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import { Switch } from "../../components/switch";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Check, ClipboardCheck, Image as ImageIcon, MessageSquare, Plus, RotateCcw, Video, X, XCircle } from "../../icons";
import { Gate } from "../access/gate";
import { AgentSuggestion, RecentAgentRow, useMyName, useNow } from "../ask/agent-parts";
import { EmptyPage } from "../common/empty-page";
import { FormDialog, TextAreaField } from "../common/form-dialog";
import { StatusBadge } from "../common/status-badge";
import { formatDateTime } from "../lib/format";
import {
	CHECK_KIND_LABEL,
	CHECK_STATUS_LABEL,
	type CheckKind,
	checkOverdue,
	counts,
	type Deliverable,
	DELIVERABLE_LABEL,
	type Phase,
	PHASE_LABEL,
	type QualityCheck,
	shouldWatch,
} from "../lib/quality";
import { pct } from "../lib/returns";
import type { Product } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { suppliers } from "../../data-source";
import { useGate } from "../stores/access-store";
import { THRESHOLD, useProductQuality, useQuality } from "../stores/quality-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * Kwaliteit, the product page's second section (PLAN 26, design §3): the checks the brand asked its
 * supplier for, what came back and the verdict; the complaints from returns and messages; the
 * complaint rate against the product's sales; and the phase it is in. One timeline, newest first,
 * filtered by size. A check opens in a drawer where it is judged.
 */

const SIZES = ["Klein", "Middel", "Groot"];
const day = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

export function CheckStatusBadge({ c, now }: { c: QualityCheck; now: number }) {
	if (checkOverdue(c, now)) return <StatusBadge tone="danger">Te laat</StatusBadge>;
	const tone = c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : c.status === "submitted" ? "warning" : "info";
	return <StatusBadge tone={tone}>{CHECK_STATUS_LABEL[c.status]}</StatusBadge>;
}

export function PhaseSelect({ productId, phase }: { productId: string; phase: Phase }) {
	const gate = useGate("products.phase");
	return (
		<span role="radiogroup" aria-label="Productfase" className="inline-flex h-8 items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
			{(Object.keys(PHASE_LABEL) as Phase[]).map((p) => (
				<button
					key={p}
					type="button"
					role="radio"
					aria-checked={p === phase}
					disabled={!gate.ok}
					title={gate.ok ? undefined : gate.reason}
					onClick={() => {
						if (p === phase) return;
						const undo = useQuality.getState().setPhase(productId, p);
						undoable(`Fase: ${PHASE_LABEL[p].toLowerCase()}`, undo, p === "watch" ? "Klachten en controles van dit product komen nu op Start." : undefined);
					}}
					className={cn(
						"h-7 rounded-[5px] px-2 font-medium text-xs transition-colors disabled:cursor-not-allowed",
						p === phase ? (p === "watch" ? "bg-signal-amber-bg text-signal-amber" : "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]") : "text-ink-2 enabled:hover:text-ink",
					)}
				>
					{PHASE_LABEL[p]}
				</button>
			))}
		</span>
	);
}

type Item =
	| { kind: "check"; at: string; c: QualityCheck; event: "requested" | "submitted" | "judged" }
	| { kind: "complaint"; at: string; text: string; customer?: string | undefined; variant?: string | undefined; returnId?: string | undefined; source: "return" | "message" }
	| { kind: "media"; at: string; name: string; by: string };

export function QualityTab({ product, openCheck }: { product: Product; openCheck?: string | undefined }) {
	const q = useProductQuality(product.id);
	const media = useWorkspace((s) => s.productMedia[product.id]) ?? [];
	const navigate = useNavigate();
	const now = useNow(60_000);
	const [size, setSize] = useState<string | null>(null);
	const [requesting, setRequesting] = useState<CheckKind | null>(null);
	const [open, setOpen] = useState<string | null>(openCheck ?? null);
	const c = counts(q.checks);
	const supplier = suppliers.find((s) => s.id === product.supplier_id);
	const watch = shouldWatch(q.rate, THRESHOLD, q.phase);

	const items = useMemo<Item[]>(() => {
		const out: Item[] = [];
		for (const ch of q.checks) {
			out.push({ kind: "check", at: ch.requestedAt, c: ch, event: "requested" });
			if (ch.submission) out.push({ kind: "check", at: ch.submission.at, c: ch, event: "submitted" });
			if (ch.verdict) out.push({ kind: "check", at: ch.verdict.at, c: ch, event: "judged" });
		}
		for (const cm of q.complaints) out.push({ kind: "complaint", at: cm.at, text: cm.text, customer: cm.customer, variant: cm.variant, returnId: cm.returnId, source: cm.source });
		for (const m of media) out.push({ kind: "media", at: m.at, name: m.name, by: m.by });
		return out
			.filter((i) => !size || (i.kind === "check" ? i.c.variants.length === 0 || i.c.variants.includes(size) : i.kind === "complaint" ? i.variant === size : true))
			.sort((a, b) => b.at.localeCompare(a.at));
	}, [q.checks, q.complaints, media, size]);

	if (q.checks.length === 0 && q.complaints.length === 0) {
		return (
			<>
				<EmptyPage
					kind="quality"
					count="0 controles"
					title="Nog geen controles"
					body="Vraag foto's van een batch of bestel een monster."
					action={{ label: "Controle aanvragen", onClick: () => setRequesting("batch") }}
					secondary={{ label: "Monster bestellen", onClick: () => setRequesting("sample") }}
					className="pt-6 sm:pt-8"
				/>
				<RequestDialog product={product} kind={requesting} onClose={() => setRequesting(null)} />
			</>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<section className="flex flex-col gap-4 rounded-xl px-5 py-4 panel">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<dl className="flex flex-wrap gap-x-8 gap-y-3">
						<Fig k="Klachtpercentage" v={pct(q.rate)} tone={q.rate > THRESHOLD ? "amber" : undefined} sub={`${q.complaints.length} van ${q.sold} verkocht in 90 dagen`} />
						<Fig k="Goedgekeurd" v={String(c.approved)} />
						<Fig k="Afgekeurd" v={String(c.rejected)} tone={c.rejected > 0 ? "red" : undefined} />
						<Fig k="Loopt" v={String(c.open)} />
					</dl>
					<div className="flex flex-col items-end gap-1">
						<span className="text-ink-3 text-xs">Fase</span>
						<PhaseSelect productId={product.id} phase={q.phase} />
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Gate perm="products" arg={2}>
						<button type="button" onClick={() => setRequesting("batch")} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45">
							<Plus className="size-3.5" strokeWidth={2} />
							Controle aanvragen
						</button>
					</Gate>
					<Gate perm="products" arg={2}>
						<button type="button" onClick={() => setRequesting("sample")} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs hover:field-hover disabled:pointer-events-none disabled:opacity-45">
							<Box className="size-3.5" strokeWidth={1.75} />
							Monster bestellen
						</button>
					</Gate>
					<span className="flex-1" />
					<span role="radiogroup" aria-label="Maat" className="flex gap-1">
						{[null, ...SIZES].map((s) => (
							<button key={s ?? "all"} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)} className={cn("h-7 rounded-md px-2 text-xs", size === s ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2 hover:bg-ink/6")}>
								{s ?? "Alle maten"}
							</button>
						))}
					</span>
				</div>
			</section>

			{watch && supplier ? (
				<AgentSuggestion
					id={`watch:${product.id}:${q.complaints.length}`}
					action="RequestQualityCheck"
					level={2}
					proposal={{
						title: `Batchcontrole vragen bij ${supplier.name} en ${product.title} onder toezicht zetten`,
						body: `${q.complaints.length} klachten op ${q.sold} verkochte stuks in 90 dagen: ${pct(q.rate)}, boven je drempel van ${pct(THRESHOLD)}. De meeste gaan over dezelfde plek.`,
						confidence: 86,
						why: "Klachten uit retouren en berichten, gemeten tegen de verkopen van 90 dagen.",
						fileLabel: "Controle aanvragen",
						action: { kind: "open", to: `/products/${product.id}` },
					}}
					evidence={
						<ul className="flex flex-col gap-1 text-mesh-ink text-sm">
							{q.complaints.slice(0, 3).map((cm) => (
								<li key={`${cm.at}-${cm.text}`} className="truncate">“{cm.text}”</li>
							))}
						</ul>
					}
					draft={{
						sentence: `Batchcontrole gevraagd bij ${supplier.name} voor ${product.title}`,
						record: { kind: "product", label: product.title, to: `/products/${product.id}`, search: { tab: "quality" }, id: product.id },
						trigger: "Klachtpercentage boven de drempel",
						sources: q.complaints.slice(0, 3).map((cm) => ({ kind: cm.returnId ? ("return" as const) : ("customer" as const), title: cm.customer ?? "Klant", detail: cm.text })),
						reason: `${pct(q.rate)} klachten, drempel ${pct(THRESHOLD)}.`,
					}}
					perform={() => {
						useQuality.getState().request({ productId: product.id, supplierId: supplier.id, kind: "batch", variants: [], deliver: ["photos", "batch", "video"], due: new Date(Date.now() + 4 * 86_400_000).toISOString(), requestedBy: "Insyte", note: `Batchcontrole na ${q.complaints.length} klachten: foto's van de naden en het batchnummer.` });
						useQuality.getState().setPhase(product.id, "watch");
						return { before: PHASE_LABEL[q.phase], after: "Onder toezicht, controle aangevraagd" };
					}}
				/>
			) : (
				<RecentAgentRow action="RequestQualityCheck" recordId={product.id} within={24 * 60 * 60_000} />
			)}

			<section className="flex flex-col gap-1 rounded-xl px-5 py-4 panel">
				<h2 className="pb-2 font-medium text-ink text-md">Tijdlijn</h2>
				{items.length === 0 ? <p className="text-ink-3 text-sm">Niets voor maat {size}.</p> : null}
				<ol className="flex flex-col">
					{items.map((i, n) => (
						<li key={`${i.kind}-${i.at}-${n}`} className="flex gap-3 pb-3 last:pb-0">
							<div className="flex shrink-0 flex-col items-center">
								<span className={cn("flex size-6 items-center justify-center rounded-md", i.kind === "complaint" ? "bg-signal-amber-bg text-signal-amber" : i.kind === "check" && i.event === "judged" ? (i.c.status === "rejected" ? "bg-signal-red-bg text-signal-red" : "bg-abyss text-mesh-ink") : "bg-mist text-ink-2")}>
									{i.kind === "complaint" ? <MessageSquare className="size-3.5" strokeWidth={1.75} /> : i.kind === "media" ? <ImageIcon className="size-3.5" strokeWidth={1.75} /> : i.event === "judged" ? (i.c.status === "rejected" ? <XCircle className="size-3.5" strokeWidth={1.75} /> : <Check className="size-3.5" strokeWidth={2.25} />) : <ClipboardCheck className="size-3.5" strokeWidth={1.75} />}
								</span>
								{n < items.length - 1 ? <span className="mt-1 w-px flex-1 bg-hairline" /> : null}
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-1">
								{i.kind === "check" ? (
									<button type="button" onClick={() => setOpen(i.c.id)} className="flex flex-wrap items-center gap-2 text-left">
										<span className="font-medium text-ink text-sm hover:text-arc-ink">
											{i.event === "requested" ? `${CHECK_KIND_LABEL[i.c.kind]} aangevraagd door ${i.c.requestedBy}` : i.event === "submitted" ? `${i.c.submission?.by ?? "Leverancier"} stuurde de controle in` : i.c.status === "approved" ? `Goedgekeurd door ${i.c.verdict?.by}` : `Afgekeurd door ${i.c.verdict?.by}`}
										</span>
										{i.event === "requested" ? <CheckStatusBadge c={i.c} now={now} /> : null}
									</button>
								) : i.kind === "complaint" ? (
									<p className="text-ink text-sm">
										<span className="font-medium">Klacht{i.customer ? ` van ${i.customer}` : ""}</span>
										{i.variant ? <span className="text-ink-3"> · {i.variant}</span> : null}
										{i.returnId ? (
											<button type="button" onClick={() => void navigate({ to: "/returns/$returnId", params: { returnId: i.returnId ?? "" } })} className="ml-1.5 rounded-sm bg-arc-tint px-1.5 py-px font-medium text-arc-ink text-xs">
												Uit retour
											</button>
										) : null}
									</p>
								) : (
									<p className="text-ink text-sm">
										<span className="font-medium">{i.by}</span> deelde {i.name}
									</p>
								)}
								{i.kind === "complaint" ? <p className="text-ink-2 text-sm">“{i.text}”</p> : null}
								{i.kind === "check" && i.event === "requested" ? <p className="text-ink-2 text-sm">{i.c.note}</p> : null}
								{i.kind === "check" && i.event === "judged" && i.c.verdict?.reason ? <p className="text-ink-2 text-sm">{i.c.verdict.reason}</p> : null}
								<time className="text-ink-3 text-xs">{formatDateTime(i.at)}</time>
							</div>
						</li>
					))}
				</ol>
			</section>
			<RequestDialog product={product} kind={requesting} onClose={() => setRequesting(null)} />
			<CheckDrawer check={q.checks.find((x) => x.id === open) ?? null} productTitle={product.title} onClose={() => setOpen(null)} />
		</div>
	);
}

function Fig({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "amber" | "red" | undefined }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-ink-3 text-xs">{k}</dt>
			<dd className={cn("font-medium text-xl tabular-nums", tone === "amber" ? "text-signal-amber" : tone === "red" ? "text-signal-red" : "text-ink")}>{v}</dd>
			{sub ? <dd className="text-ink-3 text-xs">{sub}</dd> : null}
		</div>
	);
}

/** Controle aanvragen / Monster bestellen: what, which sizes, what to deliver, by when, and a note for the supplier. */
function RequestDialog({ product, kind, onClose }: { product: Product; kind: CheckKind | null; onClose: () => void }) {
	const me = useMyName();
	const supplier = suppliers.find((s) => s.id === product.supplier_id);
	const [k, setK] = useState<CheckKind | null>(null);
	const chosen = k ?? kind ?? "batch";
	const [sizes, setSizes] = useState<string[]>([]);
	const [deliver, setDeliver] = useState<Deliverable[]>(["photos", "batch"]);
	const [days, setDays] = useState(4);
	const [note, setNote] = useState("");
	return (
		<FormDialog
			open={kind !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setK(null);
					setNote("");
				}
			}}
			title={chosen === "sample" ? "Monster bestellen" : "Controle aanvragen"}
			description={supplier ? `${supplier.name} krijgt het verzoek in zijn portaal, met wat je wilt zien en wanneer.` : "Dit product heeft nog geen leverancier."}
			primaryLabel={`Naar ${supplier?.name ?? "de leverancier"} sturen`}
			disabled={!supplier || deliver.length === 0}
			onSubmit={() => {
				if (!supplier) return;
				const due = new Date(Date.now() + days * 86_400_000);
				due.setHours(17, 0, 0, 0);
				const c = useQuality.getState().request({ productId: product.id, supplierId: supplier.id, kind: chosen, variants: sizes, deliver, due: due.toISOString(), requestedBy: me, note: note.trim() || `${CHECK_KIND_LABEL[chosen]} voor ${product.title}.` });
				undoable(`${CHECK_KIND_LABEL[chosen]} gestuurd naar ${supplier.name}`, () => useQuality.getState().cancel(c.id), `Vóór ${day(c.due)}.`);
				onClose();
				setK(null);
				setNote("");
			}}
		>
			<Chips label="Soort" value={[chosen]} options={(Object.keys(CHECK_KIND_LABEL) as CheckKind[]).map((x) => ({ id: x, label: CHECK_KIND_LABEL[x] }))} onToggle={(x) => setK(x)} />
			<Chips label="Maten (geen keuze is alle maten)" value={sizes} options={SIZES.map((s) => ({ id: s, label: s }))} onToggle={(x) => setSizes((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]))} />
			<Chips label="Wat de leverancier aanlevert" value={deliver} options={(Object.keys(DELIVERABLE_LABEL) as Deliverable[]).map((x) => ({ id: x, label: DELIVERABLE_LABEL[x] }))} onToggle={(x) => setDeliver((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]))} />
			<Chips label="Vóór" value={[String(days)]} options={[2, 4, 7, 14].map((d) => ({ id: String(d), label: d === 7 ? "Over een week" : d === 14 ? "Over twee weken" : `Over ${d} dagen` }))} onToggle={(x) => setDays(Number(x))} />
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Voor de leverancier</span>
				<TextAreaField value={note} onChange={setNote} rows={2} placeholder="Bijvoorbeeld: zes foto's van de nieuwe batch, binnen en buiten, en het batchnummer" />
			</label>
		</FormDialog>
	);
}

function Chips<T extends string>({ label, value, options, onToggle }: { label: string; value: T[]; options: Array<{ id: T; label: string }>; onToggle: (id: T) => void }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-ink-3 text-sm">{label}</span>
			<div className="flex flex-wrap gap-1.5">
				{options.map((o) => (
					<button key={o.id} type="button" aria-pressed={value.includes(o.id)} onClick={() => onToggle(o.id)} className={cn("h-7 rounded-md px-2.5 font-medium text-sm transition-colors", value.includes(o.id) ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * One check: what was asked, what came back (the gallery, the batch, the video, the supplier's note),
 * and the verdict. Goedkeuren has Undo; Afkeuren asks for a reason the supplier can act on, and can
 * open a ticket with the supplier and put the product under watch in the same move.
 */
export function CheckDrawer({ check, productTitle, onClose }: { check: QualityCheck | null; productTitle: string; onClose: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const me = useMyName();
	const now = useNow(60_000);
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [ticket, setTicket] = useState(true);
	const [watch, setWatch] = useState(true);
	const supplier = check ? suppliers.find((s) => s.id === check.supplierId) : undefined;
	return (
		<Sheet open={check !== null} onOpenChange={(o) => !o && onClose()}>
			<SheetContent side="right" className="w-[520px] max-w-[100vw] gap-0 overflow-y-auto bg-paper p-0 sm:max-w-[520px]" showCloseButton={false} initialFocus={ref}>
				{check ? (
					<div ref={ref} tabIndex={-1} className="flex min-h-full flex-col outline-none">
						<header className="flex items-start gap-3 bg-mist px-5 py-4">
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<SheetTitle className="font-medium text-ink text-lg">{CHECK_KIND_LABEL[check.kind]}</SheetTitle>
								<SheetDescription className="flex flex-wrap items-center gap-2 text-ink-2 text-sm">
									{productTitle} · {supplier?.name}
									<CheckStatusBadge c={check} now={now} />
								</SheetDescription>
							</div>
							<button type="button" aria-label="Sluiten" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
								<X className="size-4" strokeWidth={1.75} />
							</button>
						</header>
						<div className="flex flex-col gap-6 px-5 py-5">
							<section className="flex flex-col gap-1.5">
								<h3 className="font-medium text-ink-3 text-xs">Gevraagd door {check.requestedBy}</h3>
								<p className="text-base text-ink leading-relaxed">{check.note}</p>
								<p className="text-ink-2 text-sm">
									{check.deliver.map((d) => DELIVERABLE_LABEL[d]).join(", ")} · {check.variants.length ? check.variants.join(", ") : "alle maten"} · vóór {day(check.due)}
								</p>
								{checkOverdue(check, now) ? (
									<p className="flex items-center gap-1.5 text-signal-red text-sm">
										<AlertTriangle className="size-3.5" strokeWidth={2} />
										Nog niets binnen, de datum is verstreken.
									</p>
								) : null}
							</section>
							{check.submission ? (
								<section className="flex flex-col gap-2">
									<h3 className="font-medium text-ink-3 text-xs">
										Ingestuurd door {check.submission.by} · {formatDateTime(check.submission.at)}
									</h3>
									<ul className="grid grid-cols-3 gap-2">
										{check.submission.photos.filter(Boolean).map((src, i) => (
											<li key={`${src}-${i}`}>
												<a href={src} target="_blank" rel="noreferrer">
													<img src={src} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
												</a>
											</li>
										))}
										{check.submission.video ? (
											<li className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-mist text-ink-2 text-xs">
												<Video className="size-5" strokeWidth={1.75} />
												Video
											</li>
										) : null}
									</ul>
									{check.submission.batch ? <p className="text-ink-2 text-sm">Batch {check.submission.batch}</p> : null}
									{check.submission.note ? <p className="text-ink text-sm">“{check.submission.note}”</p> : null}
								</section>
							) : (
								<p className="rounded-lg bg-mist px-3.5 py-3 text-ink-2 text-sm">{supplier?.name ?? "De leverancier"} heeft nog niets ingestuurd. Ze zien het verzoek in hun portaal.</p>
							)}
							{check.verdict ? (
								<section className={cn("flex flex-col gap-1 rounded-lg px-3.5 py-3", check.status === "approved" ? "bg-arc-tint" : "bg-signal-red-bg")}>
									<p className="font-medium text-ink text-sm">
										{check.status === "approved" ? "Goedgekeurd" : "Afgekeurd"} door {check.verdict.by} · {formatDateTime(check.verdict.at)}
									</p>
									{check.verdict.reason ? <p className="text-ink-2 text-sm">{check.verdict.reason}</p> : null}
								</section>
							) : null}
							{check.status === "submitted" ? (
								rejecting ? (
									<section className="flex flex-col gap-3">
										<label className="flex flex-col gap-1.5">
											<span className="font-medium text-ink-3 text-sm">Waarom afgekeurd (de leverancier leest dit)</span>
											<TextAreaField value={reason} onChange={setReason} rows={3} placeholder="Bijvoorbeeld: naad bij de schouder loopt niet door tot de zoom" />
										</label>
										<label className="flex items-center gap-2 text-ink-2 text-sm">
											<Switch checked={ticket} onCheckedChange={setTicket} aria-label="Ticket openen" />
											Ticket met {supplier?.name ?? "de leverancier"} openen
										</label>
										<label className="flex items-center gap-2 text-ink-2 text-sm">
											<Switch checked={watch} onCheckedChange={setWatch} aria-label="Onder toezicht zetten" />
											Product onder toezicht zetten
										</label>
										<div className="flex gap-2">
											<button type="button" onClick={() => setRejecting(false)} className="h-8 rounded-md px-3 font-medium text-ink-2 text-sm hover:bg-ink/6">
												Annuleren
											</button>
											<button
												type="button"
												disabled={!reason.trim()}
												onClick={() => {
													const undos = [useQuality.getState().judge(check.id, false, me, reason.trim())];
													if (watch) undos.push(useQuality.getState().setPhase(check.productId, "watch"));
													let ticketId: string | undefined;
													if (ticket) {
														ticketId = useWorkspace.getState().createTicket({ title: `${productTitle}: controle afgekeurd bij ${supplier?.name ?? "leverancier"}`, description: reason.trim(), priority: "high", tags: ["Kwaliteit", "Leverancier"] }).id;
													}
													undoable("Controle afgekeurd", () => {
														for (const u of undos) u();
														if (ticketId) useWorkspace.setState((s) => ({ tickets: s.tickets.filter((t) => t.id !== ticketId) }));
													}, `${supplier?.name ?? "De leverancier"} krijgt de reden in zijn portaal.`);
													setRejecting(false);
													setReason("");
												}}
												className="h-8 rounded-md bg-signal-red px-3 font-medium text-paper text-sm disabled:opacity-45"
											>
												Afkeuren
											</button>
										</div>
									</section>
								) : (
									<div className="flex gap-2">
										<Gate perm="quality.approve">
											<button type="button" onClick={() => setRejecting(true)} className="field flex h-9 items-center gap-1.5 rounded-md px-3 font-medium text-ink text-sm hover:field-hover disabled:opacity-45">
												<XCircle className="size-4" strokeWidth={1.75} />
												Afkeuren
											</button>
										</Gate>
										<Gate perm="quality.approve">
											<button
												type="button"
												onClick={() => undoable("Controle goedgekeurd", useQuality.getState().judge(check.id, true, me), `${supplier?.name ?? "De leverancier"} ziet het in zijn portaal.`)}
												className="flex h-9 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:opacity-45"
											>
												<Check className="size-4" strokeWidth={2} />
												Goedkeuren
											</button>
										</Gate>
									</div>
								)
							) : null}
							{check.status === "rejected" ? (
								<p className="flex items-center gap-1.5 text-ink-3 text-sm">
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									De leverancier kan de controle opnieuw insturen.
								</p>
							) : null}
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
