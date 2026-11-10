import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import { Switch } from "../../components/switch";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Check, ClipboardCheck, Copy, Image as ImageIcon, MessageSquare, Plus, RotateCcw, Video, X, XCircle } from "../../icons";
import { EmptyPage } from "../common/empty-page";
import { FormDialog, TextAreaField } from "../common/form-dialog";
import { StatusBadge } from "../common/status-badge";
import { useNow } from "../hooks/use-now";
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
} from "../lib/quality";
import { pct } from "../lib/returns";
import type { Product } from "../lib/types/domain";
import { cn } from "../lib/utils";
import { GateBy } from "../returns/parts";
import { type QualityPicture, useQualitySource } from "./source";

/*
 * Kwaliteit, the product page's second section (PLAN 26, design §3): the checks the brand asked its
 * supplier for, what came back and the verdict; the complaints from returns and messages; the
 * complaint rate against the product's sales; and the phase it is in. One timeline, newest first,
 * filtered by size. A check opens in a drawer where it is judged. What it reads and does is `source.tsx`'s.
 */

const day = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

export function CheckStatusBadge({ c, now }: { c: QualityCheck; now: number }) {
	if (checkOverdue(c, now)) return <StatusBadge tone="danger">Te laat</StatusBadge>;
	const tone = c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : c.status === "submitted" ? "warning" : "info";
	return <StatusBadge tone={tone}>{CHECK_STATUS_LABEL[c.status]}</StatusBadge>;
}

export function PhaseSelect({ productId, phase }: { productId: string; phase: Phase }) {
	const source = useQualitySource();
	const gate = source.gates.phase;
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
						source.commands.setPhase(productId, p, { label: `Fase: ${PHASE_LABEL[p].toLowerCase()}`, detail: p === "watch" ? "Klachten en controles van dit product komen nu op Start." : undefined });
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
	const source = useQualitySource();
	const q = source.usePicture(product.id);
	return q ? <Picture product={product} q={q} openCheck={openCheck} /> : null;
}

function Picture({ product, q, openCheck }: { product: Product; q: QualityPicture; openCheck?: string | undefined }) {
	const source = useQualitySource();
	const media = q.media;
	const navigate = useNavigate();
	const now = useNow(60_000);
	const [size, setSize] = useState<string | null>(null);
	const [requesting, setRequesting] = useState<CheckKind | null>(null);
	const [open, setOpen] = useState<string | null>(openCheck ?? null);
	// A notification for a check on the page already open names it in the URL: the drawer follows.
	useEffect(() => {
		if (openCheck) setOpen(openCheck);
	}, [openCheck]);
	const c = counts(q.checks);
	const supplier = q.supplier;

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
			.toSorted((a, b) => b.at.localeCompare(a.at));
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
				<RequestDialog product={product} supplier={supplier} sizes={q.sizes} kind={requesting} onClose={() => setRequesting(null)} />
			</>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<section className="flex flex-col gap-4 rounded-xl px-5 py-4 panel">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<dl className="flex flex-wrap gap-x-8 gap-y-3">
						<Fig k="Klachtpercentage" v={pct(q.rate)} tone={q.rate > q.threshold ? "amber" : undefined} sub={`${q.complaints.length} van ${q.sold} verkocht in 90 dagen`} />
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
					<GateBy gate={source.gates.request}>
						<button type="button" onClick={() => setRequesting("batch")} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45">
							<Plus className="size-3.5" strokeWidth={2} />
							Controle aanvragen
						</button>
					</GateBy>
					<GateBy gate={source.gates.request}>
						<button type="button" onClick={() => setRequesting("sample")} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs hover:field-hover disabled:pointer-events-none disabled:opacity-45">
							<Box className="size-3.5" strokeWidth={1.75} />
							Monster bestellen
						</button>
					</GateBy>
					<span className="flex-1" />
					<span role="radiogroup" aria-label="Maat" className="flex gap-1">
						{q.sizes.length > 1 ? [null, ...q.sizes].map((s) => (
							<button key={s ?? "all"} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)} className={cn("h-7 rounded-md px-2 text-xs", size === s ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2 hover:bg-ink/6")}>
								{s ?? "Alle maten"}
							</button>
						)) : null}
					</span>
				</div>
			</section>

			{source.Agents ? <source.Agents product={product} picture={q} /> : null}

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
			<RequestDialog product={product} supplier={supplier} sizes={q.sizes} kind={requesting} onClose={() => setRequesting(null)} />
			<CheckDrawer check={q.checks.find((x) => x.id === open) ?? null} productTitle={product.title} supplierName={supplier?.name} onClose={() => setOpen(null)} />
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
function RequestDialog({ product, supplier, sizes: options, kind, onClose }: { product: Product; supplier: QualityPicture["supplier"]; sizes: ReadonlyArray<string>; kind: CheckKind | null; onClose: () => void }) {
	const source = useQualitySource();
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
			description={supplier ? (source.reach === "portal" ? `${supplier.name} krijgt het verzoek in zijn portaal, met wat je wilt zien en wanneer.` : `Je krijgt een link voor ${supplier.name}, met wat je wilt zien en wanneer.`) : "Dit product heeft nog geen leverancier."}
			primaryLabel={source.reach === "portal" ? `Naar ${supplier?.name ?? "de leverancier"} sturen` : "Controle aanvragen"}
			disabled={!supplier || deliver.length === 0}
			onSubmit={() => {
				if (!supplier) return;
				const due = new Date(Date.now() + days * 86_400_000);
				due.setHours(17, 0, 0, 0);
				source.commands.request(
					product.id,
					{ kind: chosen, variants: sizes, deliver, due: due.toISOString(), note: note.trim() || `${CHECK_KIND_LABEL[chosen]} voor ${product.title}.` },
					source.reach === "portal"
						? { label: `${CHECK_KIND_LABEL[chosen]} gestuurd naar ${supplier.name}`, detail: `Vóór ${day(due.toISOString())}.` }
						: { label: `${CHECK_KIND_LABEL[chosen]} aangevraagd bij ${supplier.name}`, detail: `Vóór ${day(due.toISOString())}. Kopieer de link voor ${supplier.name} bij de controle.` },
				);
				onClose();
				setK(null);
				setNote("");
			}}
		>
			<Chips label="Soort" value={[chosen]} options={(Object.keys(CHECK_KIND_LABEL) as CheckKind[]).map((x) => ({ id: x, label: CHECK_KIND_LABEL[x] }))} onToggle={(x) => setK(x)} />
			{options.length > 1 ? <Chips label="Maten (geen keuze is alle maten)" value={sizes} options={options.map((s) => ({ id: s, label: s }))} onToggle={(x) => setSizes((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]))} /> : null}
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
export function CheckDrawer({ check, productTitle, supplierName, onClose }: { check: QualityCheck | null; productTitle: string; supplierName?: string | undefined; onClose: () => void }) {
	const source = useQualitySource();
	const ref = useRef<HTMLDivElement>(null);
	const now = useNow(60_000);
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [ticket, setTicket] = useState(true);
	const [watch, setWatch] = useState(true);
	const supplier = supplierName === undefined ? undefined : { name: supplierName };
	const portal = source.reach === "portal";
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
								<div className="flex flex-col items-start gap-2 rounded-lg bg-mist px-3.5 py-3 text-ink-2 text-sm">
									<p>{supplier?.name ?? "De leverancier"} heeft nog niets ingestuurd. {portal ? "Ze zien het verzoek in hun portaal." : "Ze antwoorden via hun link."}</p>
									{source.copyLink ? (
										<button type="button" onClick={() => source.copyLink?.(check.id)} className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-ink text-xs hover:bg-ink/6">
											<Copy className="size-3.5" strokeWidth={1.75} />
											Link voor {supplier?.name ?? "de leverancier"} kopiëren
										</button>
									) : null}
								</div>
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
										{source.tickets ? (
											<label className="flex items-center gap-2 text-ink-2 text-sm">
												<Switch checked={ticket} onCheckedChange={setTicket} aria-label="Ticket openen" />
												Ticket met {supplier?.name ?? "de leverancier"} openen
											</label>
										) : null}
										{source.gates.phase.ok ? (
											<label className="flex items-center gap-2 text-ink-2 text-sm">
												<Switch checked={watch} onCheckedChange={setWatch} aria-label="Onder toezicht zetten" />
												Product onder toezicht zetten
											</label>
										) : null}
										<div className="flex gap-2">
											<button type="button" onClick={() => setRejecting(false)} className="h-8 rounded-md px-3 font-medium text-ink-2 text-sm hover:bg-ink/6">
												Annuleren
											</button>
											<button
												type="button"
												disabled={!reason.trim()}
												onClick={() => {
													source.commands.reject(
														check.id,
														{ reason: reason.trim(), watch: watch && source.gates.phase.ok, ticket: ticket && source.tickets },
														{ label: "Controle afgekeurd", detail: portal ? `${supplier?.name ?? "De leverancier"} krijgt de reden in zijn portaal.` : `${supplier?.name ?? "De leverancier"} ziet de reden via de link.` },
													);
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
										<GateBy gate={source.gates.judge}>
											<button type="button" onClick={() => setRejecting(true)} className="field flex h-9 items-center gap-1.5 rounded-md px-3 font-medium text-ink text-sm hover:field-hover disabled:opacity-45">
												<XCircle className="size-4" strokeWidth={1.75} />
												Afkeuren
											</button>
										</GateBy>
										<GateBy gate={source.gates.judge}>
											<button
												type="button"
												onClick={() => source.commands.approve(check.id, { label: "Controle goedgekeurd", detail: portal ? `${supplier?.name ?? "De leverancier"} ziet het in zijn portaal.` : undefined })}
												className="flex h-9 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:opacity-45"
											>
												<Check className="size-4" strokeWidth={2} />
												Goedkeuren
											</button>
										</GateBy>
									</div>
								)
							) : null}
							{check.status === "rejected" ? (
								<p className="flex items-center gap-1.5 text-ink-3 text-sm">
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									{portal ? "De leverancier kan de controle opnieuw insturen." : "De leverancier kan de controle via dezelfde link opnieuw insturen."}
								</p>
							) : null}
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
