import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Package as PackageCheck, RotateCcw, Send, Truck, User, XCircle } from "../../icons";
import { useNow } from "../hooks/use-now";
import { ConfirmDialog } from "../common/confirm-dialog";
import { DetailShell } from "../common/detail-shell";
import { EmptyState } from "../common/empty-state";
import { FormDialog } from "../common/form-dialog";
import { ProductThumb } from "../product/product-thumb";
import { formatCurrency } from "../lib/format";
import { countryName } from "../lib/format-flag";
import { euro } from "../lib/permissions";
import { amountOf, pastDeadline, type Resolution, RESOLUTION_LABEL, resolutionAmount, type ReturnRecord } from "../lib/returns";
import { cn } from "../lib/utils";
import { CarrierMark, GateBy, KindWord, RejectDialog, ResolutionPicker, ReturnStatusBadge, ReturnTimeline } from "./parts";
import { type ReturnView, useReturnDetailSource } from "./source";

const ago = (iso: string, now: number) => {
	const h = Math.floor((now - Date.parse(iso)) / 3_600_000);
	return h < 1 ? "zojuist" : h < 24 ? `${h} uur geleden` : `${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? "dag" : "dagen"} geleden`;
};
const day = (d: Date | string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(typeof d === "string" ? new Date(d) : d);

/**
 * One return or claim (`/returns/$returnId`): what came back and why, in the shopper's words and
 * photos; what they asked for; the label and its tracking; the history; and the actions the current
 * state allows. At Eerst vragen the agent's approval is a plate on top; a refund always asks first.
 */
export function ReturnDetailPage() {
	const { returnId } = useParams({ strict: false }) as { returnId?: string };
	const view = useReturnDetailSource().useView(returnId);
	if (!view) {
		return (
			<DetailShell crumb={{ label: "Retouren", to: "/returns" }} title="Retour niet gevonden">
				<EmptyState kind="returns" title="Deze retour bestaat niet (meer)." body="Misschien is hij in een andere ontwerpstaat gemaakt. Ga terug naar de lijst." />
			</DetailShell>
		);
	}
	return <Detail view={view} />;
}

function Detail({ view }: { view: ReturnView }) {
	const navigate = useNavigate();
	const source = useReturnDetailSource();
	const { commands, gates } = source;
	const { record: r, window: win, rule, offered, earlier, assignee, address } = view;
	const now = useNow(60_000);
	const role = source.role;
	const approve = gates.approve;
	const amount = amountOf(r);
	const late = pastDeadline(r.status, r.deadline, now);
	const [rejecting, setRejecting] = useState(false);
	const [resolving, setResolving] = useState(false);
	const said = (label: string, detail?: string) => ({ label, detail });

	const actions = (
		<>
			{r.status === "review" ? (
				<>
					<GateBy gate={gates.approve}>
						<button type="button" onClick={() => setRejecting(true)} className={QUIET}>
							<XCircle className="size-3.5" strokeWidth={1.75} />
							Afwijzen
						</button>
					</GateBy>
					{r.kind === "claim" && r.requested === "replacement" ? (
						<GateBy gate={gates.approve}>
							<button type="button" onClick={() => commands.approve([r.id], said(`${r.number} goedgekeurd`, "Nieuw artikel zonder terugsturen: klaar om af te handelen."), true)} className={WELL}>
								Goedkeuren zonder terugsturen
							</button>
						</GateBy>
					) : null}
					<GateBy gate={gates.approve}>
						<button type="button" onClick={() => commands.approve([r.id], said(`${r.number} goedgekeurd`, commands.sendLabel ? "Wacht nu op het pakket. Stuur het label om de klant te laten beginnen." : "Wacht nu op het pakket."))} className={PRIMARY}>
							<Check className="size-3.5" strokeWidth={2} />
							Goedkeuren
						</button>
					</GateBy>
				</>
			) : r.status === "awaiting_parcel" ? (
				<>
					<GateBy gate={gates.work}>
						<button type="button" onClick={() => commands.receive(r.id, said(`${r.number} ontvangen`))} className={r.label || !commands.sendLabel ? PRIMARY : WELL}>
							<PackageCheck className="size-3.5" strokeWidth={1.75} />
							Ontvangen markeren
						</button>
					</GateBy>
					{r.label || !commands.sendLabel ? null : (
						<GateBy gate={gates.work}>
							<button type="button" onClick={() => commands.sendLabel?.([r.id], said("Wordt verstuurd…", `Retourlabel naar ${r.customerName}. Ongedaan maken kan tot het vertrekt.`))} className={PRIMARY}>
								<Send className="size-3.5" strokeWidth={1.75} />
								Label versturen
							</button>
						</GateBy>
					)}
				</>
			) : r.status === "in_transit" ? (
				<GateBy gate={gates.work}>
					<button type="button" onClick={() => commands.receive(r.id, said(`${r.number} ontvangen`))} className={PRIMARY}>
						<PackageCheck className="size-3.5" strokeWidth={1.75} />
						Ontvangen markeren
					</button>
				</GateBy>
			) : r.status === "received" ? (
				<GateBy gate={gates.work}>
					<button type="button" onClick={() => commands.inspect(r.id, said(`${r.number} gecontroleerd`))} className={PRIMARY}>
						<Check className="size-3.5" strokeWidth={2} />
						Gecontroleerd, in orde
					</button>
				</GateBy>
			) : r.status === "ready" ? (
				<GateBy gate={gates.work}>
					<button type="button" onClick={() => setResolving(true)} className={PRIMARY}>
						Afhandelen
					</button>
				</GateBy>
			) : r.status === "rejected" ? (
				<GateBy gate={gates.approve}>
					<button type="button" onClick={() => commands.reopen(r.id, said(`${r.number} opnieuw te beoordelen`))} className={WELL}>
						<RotateCcw className="size-3.5" strokeWidth={1.75} />
						Opnieuw beoordelen
					</button>
				</GateBy>
			) : null}
		</>
	);

	const propose = !!source.agents && r.status === "review" && win.inside && offered.includes(r.requested) && approve.ok;

	return (
		<DetailShell
			crumb={{ label: "Retouren", to: "/returns" }}
			arriving={view.arriving}
			title={r.number}
			badge={
				<span className="flex items-center gap-1.5">
					<ReturnStatusBadge status={r.status} late={late} />
					<KindWord kind={r.kind} />
				</span>
			}
			meta={`${r.orderNumber} · ${r.customerName} · ${ago(r.createdAt, now)}`}
			actions={<span className="hidden items-center gap-1.5 sm:flex">{actions}</span>}
		>
			<div className="grid grid-cols-1 gap-4 pb-16 lg:grid-cols-[minmax(0,1fr)_320px] sm:pb-0">
				<div className="flex min-w-0 flex-col gap-4">
					{propose && source.agents ? <source.agents.Proposal view={view} /> : null}
					{r.status === "review" && !win.inside ? (
						<p className="flex items-start gap-2 rounded-lg bg-signal-amber-bg px-3.5 py-2.5 text-ink text-sm">
							<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-signal-amber" strokeWidth={2} />
							<span>
								<span className="font-medium">Buiten de termijn.</span> Bezorgd {win.daysSince} dagen geleden; de termijn van {win.days} dagen sloot op {day(win.closesOn)}. Insyte stelt daarom niets voor; de keuze is aan jou.
							</span>
						</p>
					) : null}

					<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<header className="flex items-center justify-between">
							<h2 className="font-medium text-ink text-md">Artikelen</h2>
							<span className="font-medium text-ink text-sm tabular-nums">{formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
						</header>
						<ul className="flex flex-col gap-2">
							{r.items.map((i) => (
								<li key={i.lineId} className="flex items-center gap-3">
									<ProductThumb src={view.imageOf(i)} title={i.title} size={40} />
									<span className="flex min-w-0 flex-1 flex-col">
										{i.productId ? (
											<Link to="/products/$productId" params={{ productId: i.productId }} className="truncate font-medium text-base text-ink hover:text-arc-ink">
												{i.title}
											</Link>
										) : (
											<span className="truncate font-medium text-base text-ink">{i.title}</span>
										)}
										<span className="text-ink-3 text-sm">
											{i.variantTitle ? `${i.variantTitle} · ` : ""}{i.qty}× {formatCurrency(i.unitPrice, r.currency)}
											{r.exchangeTo ? ` · ruilen naar ${r.exchangeTo}` : ""}
										</span>
									</span>
								</li>
							))}
						</ul>
						{rule ? <p className="rounded-lg bg-mist px-3 py-2 text-ink-2 text-sm">Regel op dit artikel: {rule.note}</p> : null}
					</section>

					<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<h2 className="font-medium text-ink text-md">Wat de klant zegt</h2>
						<p className="flex flex-wrap items-center gap-2 text-sm">
							<span className="rounded-sm bg-mist px-1.5 py-px text-ink-2">{view.reasonLabel}</span>
							<span className="text-ink-3">wil</span>
							<span className="font-medium text-ink">{RESOLUTION_LABEL[r.requested]}{r.exchangeTo ? ` naar ${r.exchangeTo}` : ""}</span>
							{r.quality ? <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px text-signal-amber text-xs">Telt mee voor kwaliteit</span> : null}
						</p>
						{r.note ? <blockquote className="max-w-[68ch] text-base text-ink leading-relaxed">“{r.note}”</blockquote> : null}
						{r.photos.length ? (
							<ul className="flex flex-wrap gap-2">
								{r.photos.map((src, i) => (
									<li key={src}>
										<a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
											<img src={src} alt={`Foto ${i + 1} van ${r.customerName}`} className="size-24 object-cover" loading="lazy" />
										</a>
									</li>
								))}
							</ul>
						) : view.photoRequired ? (
							<p className="text-signal-amber text-sm">Foto verplicht voor deze reden, maar de klant stuurde er geen.</p>
						) : null}
					</section>

					{r.label || r.resolution ? (
						<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
							<h2 className="font-medium text-ink text-md">{r.resolution ? "Afhandeling" : "Retourlabel"}</h2>
							{r.label ? (
								<div className="flex flex-wrap items-center gap-3">
									<CarrierMark carrier={r.label.carrier} size={28} />
									<span className="flex min-w-0 flex-col">
										<span className="font-medium text-ink text-sm tabular-nums">{r.label.tracking}</span>
										<span className="text-ink-3 text-xs">{r.label.carrier} · verstuurd {ago(r.label.sentAt, now)}</span>
									</span>
									{r.status === "awaiting_parcel" && commands.scan ? (
										<GateBy gate={gates.work}>
											<button
												type="button"
												onClick={() => commands.scan?.(r, said(`${r.number} onderweg`, "Gesimuleerde scan van de vervoerder."))}
												className={cn(QUIET, "ml-auto")}
											>
												<Truck className="size-3.5" strokeWidth={1.75} />
												Scan van vervoerder
											</button>
										</GateBy>
									) : null}
								</div>
							) : null}
							{r.resolution ? (
								<p className="text-base text-ink">
									<span className="font-medium">{RESOLUTION_LABEL[r.resolution.kind]}</span>
									{r.resolution.amount > 0 ? ` · ${formatCurrency(r.resolution.amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
									{r.resolution.replacementOrder ? ` · bestelling ${r.resolution.replacementOrder}` : ""}
									<span className="text-ink-3"> · door {r.resolution.by}</span>
								</p>
							) : null}
						</section>
					) : null}

					<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<h2 className="font-medium text-ink text-md">Geschiedenis</h2>
						<ReturnTimeline events={r.events} />
						{source.agents ? <source.agents.Rows id={r.id} /> : null}
					</section>
				</div>

				<aside className="flex flex-col gap-4">
					<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<h2 className="font-medium text-ink text-md">Klant</h2>
						{r.customerId ? (
							<Link to="/customers/$customerId" params={{ customerId: r.customerId }} className="flex items-center gap-2 font-medium text-base text-ink hover:text-arc-ink">
								<User className="size-4 text-ink-3" strokeWidth={1.75} />
								{r.customerName}
							</Link>
						) : (
							<span className="flex items-center gap-2 font-medium text-base text-ink">
								<User className="size-4 text-ink-3" strokeWidth={1.75} />
								{r.customerName}
							</span>
						)}
						<p className="text-ink-2 text-sm">{r.customerEmail}</p>
						<p className="text-ink-3 text-sm">{earlier === 0 ? "Eerste retour" : `${earlier} eerdere ${earlier === 1 ? "retour" : "retouren"}`}{r.country ? ` · ${countryName(r.country)}` : ""}</p>
					</section>
					<dl className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<Fact k="Bestelling">
							<Link to="/orders/$orderId" params={{ orderId: r.orderId }} className="font-medium text-arc-ink hover:underline">
								{r.orderNumber}
							</Link>
						</Fact>
						<Fact k="Termijn">
							<span className={win.inside ? "text-ink" : "font-medium text-signal-amber"}>
								{win.inside ? `Dag ${win.daysSince} van ${win.days}, sluit ${day(win.closesOn)}` : `Gesloten op ${day(win.closesOn)}`}
							</span>
						</Fact>
						{r.status === "review" ? <Fact k="Beoordelen vóór"><span className={late ? "font-medium text-signal-red" : "text-ink"}>{new Intl.DateTimeFormat("nl-NL", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(r.deadline))}</span></Fact> : null}
						<Fact k="Toegewezen aan">
							<span className="flex items-center gap-2">
								<span className="text-ink">{assignee?.name ?? "Niemand"}</span>
								<GateBy gate={gates.work}>
									<button type="button" onClick={() => commands.assign([r.id], assignee ? null : source.meId, said(assignee ? "Toewijzing weggehaald" : `${r.number} aan jou toegewezen`))} className="font-medium text-arc-ink text-xs hover:underline disabled:opacity-45">
										{assignee ? "Weghalen" : "Aan mij"}
									</button>
								</GateBy>
							</span>
						</Fact>
						{address ? <Fact k="Retouradres"><span className="text-ink-2">{address.address} · {address.carrier}</span></Fact> : null}
					</dl>
					<button type="button" onClick={() => void navigate({ to: "/orders/$orderId", params: { orderId: r.orderId } })} className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 font-medium text-arc-ink text-sm hover:bg-arc-tint">
						<ExternalLink className="size-3.5" strokeWidth={1.75} />
						Bestelling openen
					</button>
				</aside>
			</div>

			{/* On a phone the actions sit in a bar at the foot, where a thumb is. */}
			<div className="fixed inset-x-0 bottom-0 z-20 flex justify-end gap-1.5 bg-paper/95 px-3 py-2.5 shadow-[0_-1px_0_color-mix(in_oklch,var(--ink)_8%,transparent)] sm:hidden">{actions}</div>

			<RejectDialog
				count={1}
				open={rejecting}
				onClose={() => setRejecting(false)}
				onReject={(why) => commands.reject([r.id], why, said(`${r.number} afgewezen`, "De klant krijgt de reden per mail zodra dit venster sluit."))}
			/>
			<ResolveDialog r={r} open={resolving} offered={offered} onClose={() => setResolving(false)} roleLimit={role.refundLimit} roleLabel={role.label} />
		</DetailShell>
	);
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-ink-3 text-xs">{k}</dt>
			<dd className="text-sm">{children}</dd>
		</div>
	);
}

/**
 * Afhandelen: the resolution picker, then — for anything but a refund — done, with Undo. A refund
 * leaves the building, so it asks first, naming the amount and the role's limit, and has no Undo.
 */
function ResolveDialog({ r, open, offered, onClose, roleLimit, roleLabel }: { r: ReturnRecord; open: boolean; offered: ReadonlyArray<Resolution>; onClose: () => void; roleLimit: number | null; roleLabel: string }) {
	const source = useReturnDetailSource();
	const settings = source.money;
	const [pick, setPick] = useState<Resolution | null>(null);
	const [confirm, setConfirm] = useState(false);
	const chosen = pick ?? (offered.includes(r.requested) ? r.requested : offered[0]) ?? "refund";
	const amount = resolutionAmount(chosen, amountOf(r), settings);
	const refundGate = source.useRefundGate(amount);
	const money = formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const settle = () => {
		source.commands.settle(r, chosen, amount);
		onClose();
		setPick(null);
	};

	return (
		<>
			<FormDialog
				open={open && !confirm}
				onOpenChange={(o) => {
					if (!o) {
						onClose();
						setPick(null);
					}
				}}
				title={`${r.number} afhandelen`}
				description={`Gecontroleerd en in orde. Wat krijgt ${r.customerName}?`}
				primaryLabel={chosen === "refund" ? `${money} terugbetalen` : `${RESOLUTION_LABEL[chosen]} versturen`}
				disabled={chosen === "refund" && !refundGate.ok}
				onSubmit={() => (chosen === "refund" ? setConfirm(true) : settle())}
				width={600}
			>
				<ResolutionPicker value={chosen} onChange={setPick} options={offered} amount={amountOf(r)} settings={settings} requested={r.requested} exchangeTo={r.exchangeTo} currency={r.currency} />
				{chosen === "refund" && !refundGate.ok ? <p className="rounded-lg bg-signal-amber-bg px-3 py-2 text-ink text-sm">{refundGate.reason}. Vraag iemand met een hogere limiet.</p> : null}
			</FormDialog>
			<ConfirmDialog
				open={confirm}
				onOpenChange={(o) => {
					if (!o) setConfirm(false);
				}}
				title={`${money} terugbetalen aan ${r.customerName}?`}
				description={`Het geld gaat terug op de oorspronkelijke betaalmethode van ${r.orderNumber}. Dit kan niet worden teruggedraaid. ${roleLimit === null ? `Je rol ${roleLabel} heeft geen terugbetaallimiet.` : `Je rol ${roleLabel} mag tot ${euro(roleLimit)} per bestelling terugbetalen.`}`}
				confirmLabel={`${money} terugbetalen`}
				onConfirm={() => {
					source.commands.refund(r, amount);
					setConfirm(false);
					onClose();
					setPick(null);
				}}
			/>
		</>
	);
}

const PRIMARY = "flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45";
const WELL = "field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs transition-colors hover:field-hover disabled:pointer-events-none disabled:opacity-45";
const QUIET = "flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-45";

