import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ExternalLink, Package as PackageCheck, RotateCcw, Send, Truck, User, XCircle } from "../../icons";
import { Gate } from "../access/gate";
import { AgentSuggestion, RecordAgentRows, useMyName, useNow } from "../ask/agent-parts";
import { ConfirmDialog } from "../common/confirm-dialog";
import { DetailShell } from "../common/detail-shell";
import { EmptyState } from "../common/empty-state";
import { FormDialog } from "../common/form-dialog";
import { ProductThumb } from "../product/product-thumb";
import { useProducts } from "../hooks/use-operator-data";
import { formatCurrency } from "../lib/format";
import { countryName } from "../lib/format-flag";
import { euro } from "../lib/permissions";
import {
	amountOf,
	pastDeadline,
	type Resolution,
	RESOLUTION_LABEL,
	resolutionAmount,
	resolutionsFor,
	type ReturnRecord,
	ruleFor,
	windowCheck,
	windowDaysFor,
} from "../lib/returns";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useCurrentRole, useGate } from "../stores/access-store";
import { useReturns } from "../stores/returns-store";
import { useWorkspace } from "../stores/workspace-store";
import { CarrierMark, KindWord, reasonLabel, RejectDialog, ResolutionPicker, ReturnStatusBadge, ReturnTimeline } from "./parts";

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
	const r = useReturns((s) => s.records.find((x) => x.id === returnId));
	if (!r) {
		return (
			<DetailShell crumb={{ label: "Retouren", to: "/returns" }} title="Retour niet gevonden">
				<EmptyState kind="returns" title="Deze retour bestaat niet (meer)." body="Misschien is hij in een andere ontwerpstaat gemaakt. Ga terug naar de lijst." />
			</DetailShell>
		);
	}
	return <Detail r={r} />;
}

function Detail({ r }: { r: ReturnRecord }) {
	const navigate = useNavigate();
	const settings = useReturns((s) => s.settings);
	const all = useReturns((s) => s.records);
	const members = useWorkspace((s) => s.members);
	const { data: products } = useProducts();
	const now = useNow(60_000);
	const me = useMyName();
	const role = useCurrentRole();
	const approve = useGate("returns.approve");
	const amount = amountOf(r);
	const reason = settings.reasons.find((x) => x.id === r.reason);
	const win = windowCheck(r.deliveredAt, windowDaysFor(r.kind, reason, settings), now);
	const product = products.find((p) => p.id === r.items[0]?.productId);
	const rule = r.items[0] ? ruleFor(settings.rules, { productId: r.items[0].productId, variantId: r.items[0].variantId, tags: [...(product?.tags ?? []), ...r.tags] }) : undefined;
	const offered = resolutionsFor(settings.offered, rule, r.kind);
	const earlier = all.filter((x) => x.customerEmail === r.customerEmail && x.id !== r.id).length;
	const late = pastDeadline(r.status, r.deadline, now);
	const assignee = members.find((m) => m.id === r.assignee);
	const address = settings.addresses.find((a) => a.country === r.country) ?? settings.addresses.find((a) => a.country === (r.storeId === "store_us" ? "US" : "NL")) ?? settings.addresses[0];
	const [rejecting, setRejecting] = useState(false);
	const [resolving, setResolving] = useState(false);

	const act = (label: string, undo: () => void, detail?: string) => undoable(label, undo, detail);
	const store = useReturns.getState;

	const actions = (
		<>
			{r.status === "review" ? (
				<>
					<Gate perm="returns.approve">
						<button type="button" onClick={() => setRejecting(true)} className={QUIET}>
							<XCircle className="size-3.5" strokeWidth={1.75} />
							Afwijzen
						</button>
					</Gate>
					{r.kind === "claim" && r.requested === "replacement" ? (
						<Gate perm="returns.approve">
							<button type="button" onClick={() => act(`${r.number} goedgekeurd`, store().approve([r.id], me, true), "Nieuw artikel zonder terugsturen: klaar om af te handelen.")} className={WELL}>
								Goedkeuren zonder terugsturen
							</button>
						</Gate>
					) : null}
					<Gate perm="returns.approve">
						<button type="button" onClick={() => act(`${r.number} goedgekeurd`, store().approve([r.id], me), "Wacht nu op het pakket. Stuur het label om de klant te laten beginnen.")} className={PRIMARY}>
							<Check className="size-3.5" strokeWidth={2} />
							Goedkeuren
						</button>
					</Gate>
				</>
			) : r.status === "awaiting_parcel" ? (
				<>
					<Gate perm="returns" arg={2}>
						<button type="button" onClick={() => act(`${r.number} ontvangen`, store().advance(r.id, "received", { at: new Date().toISOString(), who: "team", name: me, text: "Ontvangen gemarkeerd" }))} className={r.label ? PRIMARY : WELL}>
							<PackageCheck className="size-3.5" strokeWidth={1.75} />
							Ontvangen markeren
						</button>
					</Gate>
					{r.label ? null : (
						<Gate perm="returns" arg={2}>
							<button type="button" onClick={() => act("Wordt verstuurd…", store().sendLabel([r.id], me), `Retourlabel naar ${r.customerName}. Ongedaan maken kan tot het vertrekt.`)} className={PRIMARY}>
								<Send className="size-3.5" strokeWidth={1.75} />
								Label versturen
							</button>
						</Gate>
					)}
				</>
			) : r.status === "in_transit" ? (
				<Gate perm="returns" arg={2}>
					<button type="button" onClick={() => act(`${r.number} ontvangen`, store().advance(r.id, "received", { at: new Date().toISOString(), who: "team", name: me, text: "Ontvangen gemarkeerd" }))} className={PRIMARY}>
						<PackageCheck className="size-3.5" strokeWidth={1.75} />
						Ontvangen markeren
					</button>
				</Gate>
			) : r.status === "received" ? (
				<Gate perm="returns" arg={2}>
					<button type="button" onClick={() => act(`${r.number} gecontroleerd`, store().advance(r.id, "ready", { at: new Date().toISOString(), who: "team", name: me, text: "Gecontroleerd: in orde" }))} className={PRIMARY}>
						<Check className="size-3.5" strokeWidth={2} />
						Gecontroleerd, in orde
					</button>
				</Gate>
			) : r.status === "ready" ? (
				<Gate perm="returns" arg={2}>
					<button type="button" onClick={() => setResolving(true)} className={PRIMARY}>
						Afhandelen
					</button>
				</Gate>
			) : r.status === "rejected" ? (
				<Gate perm="returns.approve">
					<button type="button" onClick={() => act(`${r.number} opnieuw te beoordelen`, store().advance(r.id, "review", { at: new Date().toISOString(), who: "team", name: me, text: "Opnieuw te beoordelen" }))} className={WELL}>
						<RotateCcw className="size-3.5" strokeWidth={1.75} />
						Opnieuw beoordelen
					</button>
				</Gate>
			) : null}
		</>
	);

	const propose = r.status === "review" && win.inside && offered.includes(r.requested) && approve.ok;

	return (
		<DetailShell
			crumb={{ label: "Retouren", to: "/returns" }}
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
					{propose ? (
						<AgentSuggestion
							id={`approve:${r.id}`}
							action="ApproveReturn"
							level={2}
							proposal={{
								title: `Goedkeuren en ${r.requested === "exchange" && r.exchangeTo ? `ruilen naar ${r.exchangeTo}` : RESOLUTION_LABEL[r.requested].toLowerCase()}`,
								body: `${r.customerName} stuurt ${r.items.map((i) => `${i.qty}× ${i.title} (${i.variantTitle})`).join(", ")} terug: ${reasonLabel(settings.reasons, r.reason).toLowerCase()}. Alles past binnen je regels.`,
								confidence: earlier === 0 ? 93 : 81,
								why: `Binnen de termijn (dag ${win.daysSince} van ${win.days}), het artikel is retourneerbaar en ${earlier === 0 ? "dit is de eerste retour van deze klant" : `deze klant deed eerder ${earlier} ${earlier === 1 ? "retour" : "retouren"}`}.`,
								fileLabel: "Goedkeuren",
								action: { kind: "open", to: `/returns/${r.id}` },
							}}
							evidence={
								<ul className="flex flex-col gap-1 text-mesh-ink text-sm">
									<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />Binnen de termijn: bezorgd {win.daysSince} {win.daysSince === 1 ? "dag" : "dagen"} geleden</li>
									<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />{rule ? `Regel: ${rule.note}` : "Geen uitzondering op dit artikel"}</li>
									<li className="flex items-center gap-2"><Check className="size-3.5 text-mesh-ink-2" strokeWidth={2} />{earlier === 0 ? "Eerste retour van deze klant" : `${earlier} eerdere ${earlier === 1 ? "retour" : "retouren"}`}</li>
								</ul>
							}
							draft={{
								sentence: `${r.number} goedgekeurd: ${r.requested === "exchange" && r.exchangeTo ? `ruilen naar ${r.exchangeTo}` : RESOLUTION_LABEL[r.requested].toLowerCase()}`,
								record: { kind: "return", label: r.number, to: `/returns/${r.id}`, id: r.id },
								trigger: "Retourportaal",
								sources: [
									{ kind: "order", title: r.orderNumber, detail: `Bezorgd ${day(r.deliveredAt)}`, to: `/orders/${r.orderId}` },
									{ kind: "policy", title: "Retourinstellingen", detail: `Termijn ${win.days} dagen`, to: "/settings/returns" },
								],
								reason: "Binnen de termijn, retourneerbaar en zonder eerdere retouren.",
								compensation: "Terugzetten naar Te beoordelen",
							}}
							perform={() => {
								store().approve([r.id], "Insyte");
								return { effect: { kind: "return.status", returnId: r.id, from: "review", to: "awaiting_parcel" }, before: "Te beoordelen", after: "Wacht op pakket" };
							}}
						/>
					) : null}
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
									<ProductThumb src={products.find((p) => p.id === i.productId)?.images[0]} title={i.title} size={40} />
									<span className="flex min-w-0 flex-1 flex-col">
										<Link to="/products/$productId" params={{ productId: i.productId }} className="truncate font-medium text-base text-ink hover:text-arc-ink">
											{i.title}
										</Link>
										<span className="text-ink-3 text-sm">
											{i.variantTitle} · {i.qty}× {formatCurrency(i.unitPrice, r.currency)}
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
							<span className="rounded-sm bg-mist px-1.5 py-px text-ink-2">{reasonLabel(settings.reasons, r.reason)}</span>
							<span className="text-ink-3">wil</span>
							<span className="font-medium text-ink">{RESOLUTION_LABEL[r.requested]}{r.exchangeTo ? ` naar ${r.exchangeTo}` : ""}</span>
							{r.quality ? <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px text-signal-amber text-xs">Telt mee voor kwaliteit</span> : null}
						</p>
						<blockquote className="max-w-[68ch] text-base text-ink leading-relaxed">“{r.note}”</blockquote>
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
						) : reason?.photoRequired ? (
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
									{r.status === "awaiting_parcel" ? (
										<Gate perm="returns" arg={2}>
											<button
												type="button"
												onClick={() => act(`${r.number} onderweg`, store().advance(r.id, "in_transit", { at: new Date().toISOString(), who: "carrier", name: r.label?.carrier ?? "", text: "Pakket aangenomen" }), "Gesimuleerde scan van de vervoerder.")}
												className={cn(QUIET, "ml-auto")}
											>
												<Truck className="size-3.5" strokeWidth={1.75} />
												Scan van vervoerder
											</button>
										</Gate>
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
						<RecordAgentRows kind="return" id={r.id} />
					</section>
				</div>

				<aside className="flex flex-col gap-4">
					<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
						<h2 className="font-medium text-ink text-md">Klant</h2>
						<Link to="/customers/$customerId" params={{ customerId: r.customerId }} className="flex items-center gap-2 font-medium text-base text-ink hover:text-arc-ink">
							<User className="size-4 text-ink-3" strokeWidth={1.75} />
							{r.customerName}
						</Link>
						<p className="text-ink-2 text-sm">{r.customerEmail}</p>
						<p className="text-ink-3 text-sm">{earlier === 0 ? "Eerste retour" : `${earlier} eerdere ${earlier === 1 ? "retour" : "retouren"}`} · {countryName(r.country)}</p>
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
								<Gate perm="returns" arg={2}>
									<button type="button" onClick={() => act(assignee ? "Toewijzing weggehaald" : `${r.number} aan jou toegewezen`, store().assign([r.id], assignee ? undefined : "mem_elena", me))} className="font-medium text-arc-ink text-xs hover:underline disabled:opacity-45">
										{assignee ? "Weghalen" : "Aan mij"}
									</button>
								</Gate>
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
				onReject={(why) => act(`${r.number} afgewezen`, store().reject([r.id], why, me), "De klant krijgt de reden per mail zodra dit venster sluit.")}
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
function ResolveDialog({ r, open, offered, onClose, roleLimit, roleLabel }: { r: ReturnRecord; open: boolean; offered: Resolution[]; onClose: () => void; roleLimit: number | null; roleLabel: string }) {
	const settings = useReturns((s) => s.settings);
	const me = useMyName();
	const [pick, setPick] = useState<Resolution | null>(null);
	const [confirm, setConfirm] = useState(false);
	const chosen = pick ?? (offered.includes(r.requested) ? r.requested : offered[0]) ?? "refund";
	const amount = resolutionAmount(chosen, amountOf(r), settings);
	const refundGate = useGate("refunds.write", amount);
	const money = formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const settle = () => {
		const store = useReturns.getState();
		if (chosen === "exchange" || chosen === "replacement") {
			const ws = useWorkspace.getState();
			const order = ws.createOrder({
				customer_name: r.customerName,
				customer_email: r.customerEmail,
				store: ws.stores.find((s) => s.id === r.storeId)?.name ?? "",
				notes: `${chosen === "exchange" ? "Ruil" : "Vervanging"} voor ${r.number}`,
				items: r.items.map((i) => ({ sku: i.variantId ?? i.lineId, title: i.title, qty: i.qty, price: 0 })),
			});
			useWorkspace.setState((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? { ...o, tags: ["retour"], status: "paid", payment_status: "paid" } : o)) }));
			const undo = store.resolve(r.id, chosen, amount, me, order.number);
			undoable(`${r.number} afgehandeld: ${RESOLUTION_LABEL[chosen].toLowerCase()}`, () => {
				undo();
				ws.removeOrder(order.id);
			}, `Nieuwe bestelling ${order.number} staat klaar om door te sturen.`);
		} else {
			const undo = store.resolve(r.id, chosen, amount, me);
			undoable(`${r.number} afgehandeld: ${RESOLUTION_LABEL[chosen].toLowerCase()}`, undo, chosen === "gift_card" ? `Cadeaubon van ${money} wordt gemaild.` : `Kortingscode ter waarde van ${money} wordt gemaild.`);
		}
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
					useReturns.getState().resolve(r.id, "refund", amount, me);
					useWorkspace.getState().addOrderNote(r.orderId, `${money} terugbetaald voor ${r.number}`);
					toast(`${money} terugbetaald`, { description: `${r.number} is afgehandeld. ${r.customerName} krijgt een bevestiging.` });
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

