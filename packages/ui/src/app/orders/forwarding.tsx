import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Mail, Send, Truck, XCircle } from "../../icons";
import { Gate } from "../access/gate";
import { AgentSuggestion, RecentAgentRow, useMyName, useNow } from "../ask/agent-parts";
import { ConfirmDialog } from "../common/confirm-dialog";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { EmptyState } from "../common/empty-state";
import { FormDialog, TextAreaField, TextField } from "../common/form-dialog";
import { PageHeader } from "../common/page-header";
import { PageGuide } from "../common/page-guide";
import { StatusBadge } from "../common/status-badge";
import { ProductThumb } from "../product/product-thumb";
import { useProducts } from "../hooks/use-operator-data";
import { counted } from "../lib/bulk";
import { formatCurrency } from "../lib/format";
import {
	type ForwardVia,
	type ForwardView,
	forwardSentence,
	inView,
	overdue,
	REASON_LABEL,
	VIA_LABEL,
	VIEW_LABEL,
	waitedLabel,
} from "../lib/forwarding";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { suppliers } from "../../data-source";
import { useGate } from "../stores/access-store";
import { type LegRow, useForwarding, useForwardLegs } from "../stores/forwarding-store";
import { useWorkspace } from "../stores/workspace-store";
import { DataTable, type Facet, facetFilter, type RowAction } from "../table/data-table";

/*
 * The forwarding queue (PLAN 24, design §2): Orders' three views of what has not gone out yet —
 * Te versturen, Wacht op bevestiging, Uitverkocht of fout — one row per order × supplier. Doorsturen
 * opens one dialog for any number of them, grouped by supplier; a send waits out the window as
 * "Wordt doorgestuurd…" and has Undo. A failed row carries its reason and the next action inline.
 * At Eerst vragen the agent's ForwardOrder is a plate above Te versturen; at Zelf doen it forwards
 * them itself and shows its log row instead.
 */

const GUIDE = [
	{ title: "Te versturen", body: "Betaalde bestellingen staan hier tot ze naar hun leverancier gaan. Doorsturen kan nog worden ingetrokken tot de leverancier bevestigt.", art: "parcel" },
	{ title: "Wacht op bevestiging", body: "Wat je doorstuurt, staat hier tot de leverancier het bevestigt in zijn portaal.", art: "handover" },
	{ title: "Uitverkocht of fout", body: "Kan een leverancier iets niet leveren of klopt een adres niet, dan staat het hier met de volgende stap.", art: "notify" },
	{ title: "Alleen hun eigen regels", body: "Elke leverancier krijgt alleen zijn eigen regels en het verzendadres, nooit de prijzen of de andere leveranciers.", art: "lock" },
] as const;

import { FORWARD_VIEWS, isForwardView } from "../lib/forwarding";

export { FORWARD_VIEWS, isForwardView };

export const supplierLabel = (id: string) => suppliers.find((s) => s.id === id)?.name ?? NAMES[id] ?? id;
const NAMES: Record<string, string> = { sup_allure: "Allure Fulfillment", sup_dpc: "DPC Apparel", sup_kestrel: "Kestrel Goods", sup_blackcedar: "Black Cedar Studio" };

export type { QueueRow } from "../lib/queue-row";
import type { QueueRow } from "../lib/queue-row";

/** Every leg with its order and its lines, for one view. */
export function useQueueRows(now: number, view?: ForwardView): QueueRow[] {
	const legs = useForwardLegs(now);
	const orders = useWorkspace((s) => s.orders);
	return useMemo(() => {
		const byId = new Map(orders.map((o) => [o.id, o]));
		return legs.flatMap((l) => {
			if (view && !inView(l.effective, view)) return [];
			const order = byId.get(l.orderId);
			if (!order || order.status === "cancelled" || order.status === "refunded") return [];
			// After a reroute the lines still belong to the first supplier's products; they travel with the leg.
			const lines = order.line_items.filter((li) => li.supplier_id === (l.from ?? l.supplierId));
			return [{ ...l, order, lines }];
		});
	}, [legs, orders, view]);
}

/** A one-second clock only while a send is waiting out its window; otherwise once a minute. */
function useSendingTick() {
	const sending = useForwarding((s) => Object.values(s.overrides).some((l) => l.state === "sending" && (l.sendingUntil ?? 0) > Date.now()));
	return sending ? 1000 : 60_000;
}

/** The leg's state as a word on its tint: never the colour alone. */
export function LegBadge({ row, now }: { row: LegRow; now: number }) {
	if (row.effective === "sending") return <StatusBadge tone="warning">Wordt doorgestuurd…</StatusBadge>;
	if (row.effective === "awaiting") return overdue("awaiting", row.since, now) ? <StatusBadge tone="danger">Te laat · {waitedLabel(row.since, now)}</StatusBadge> : <StatusBadge tone="info">Wacht op bevestiging</StatusBadge>;
	if (row.effective === "error") return <StatusBadge tone="danger">{REASON_LABEL[row.reasonNow ?? "rejected"]}</StatusBadge>;
	if (row.effective === "confirmed") return <StatusBadge tone="success">Bevestigd</StatusBadge>;
	if (row.effective === "cancelled") return <StatusBadge tone="muted">Geannuleerd</StatusBadge>;
	return <StatusBadge tone="neutral">Te versturen</StatusBadge>;
}

const FACETS: ReadonlyArray<Facet> = [
	{ id: "supplier", label: "Leverancier", options: Object.entries(NAMES).map(([value, label]) => ({ value, label })) },
	{ id: "store", label: "Winkel", options: [{ value: "store_us", label: "Northwind US" }, { value: "store_eu", label: "Northwind EU" }] },
];

export function ForwardingList({ view }: { view: ForwardView }) {
	const navigate = useNavigate();
	const now = useNow(useSendingTick());
	const rows = useQueueRows(now, view);
	const all = useQueueRows(now);
	const { data: products } = useProducts();
	const me = useMyName();
	const edit = useGate("orders", 2);
	const [forwarding, setForwarding] = useState<QueueRow[] | null>(null);
	const [rerouting, setRerouting] = useState<QueueRow | null>(null);
	const [mailing, setMailing] = useState<QueueRow | null>(null);
	const [cancelling, setCancelling] = useState<QueueRow | null>(null);
	const image = (productId: string) => products.find((p) => p.id === productId)?.images[0];

	const counts = useMemo(() => {
		const c = { to_forward: 0, awaiting: 0, forward_error: 0, late: 0 };
		for (const r of all) {
			for (const v of FORWARD_VIEWS) if (inView(r.effective, v)) c[v]++;
			if (overdue(r.effective, r.since, now)) c.late++;
		}
		return c;
	}, [all, now]);

	const actions = useMemo<ReadonlyArray<RowAction<QueueRow>>>(
		() => [
			{
				id: "forward",
				label: "Doorsturen",
				icon: Send,
				group: "Doorsturen",
				shortcut: "f",
				bar: true,
				needs: { perm: "orders", arg: 2 },
				applies: (r) => r.effective === "to_forward" || r.effective === "error",
				run: (picked) => setForwarding([...picked]),
			},
			{
				id: "confirm",
				label: "Als bevestigd markeren",
				icon: Check,
				group: "Doorsturen",
				bar: true,
				needs: { perm: "orders", arg: 2 },
				applies: (r) => r.effective === "awaiting" || r.effective === "sending",
				run: (picked) => {
					const undos = picked.map((r) => useForwarding.getState().confirmLeg(r.key, me));
					undoable(`${counted(picked.length, "bestelling", "bestellingen")} als bevestigd gemarkeerd`, () => undos.forEach((u) => u()), "Voor als de leverancier buiten Insyte om bevestigde.");
				},
			},
		],
		[me],
	);

	const columns = useMemo<Array<ColumnDef<QueueRow, unknown>>>(
		() => [
			{
				id: "number",
				accessorFn: (r) => r.order.number,
				header: "Bestelling",
				size: 112,
				enableHiding: false,
				cell: (c) => <span className="font-medium text-ink tabular-nums">{c.row.original.order.number}</span>,
			},
			{ id: "customer", accessorFn: (r) => r.order.customer_name, header: "Klant", cell: (c) => <span className="truncate text-ink">{c.row.original.order.customer_name}</span> },
			{
				id: "supplier",
				accessorFn: (r) => r.supplierId,
				header: "Leverancier",
				filterFn: facetFilter,
				cell: (c) => (
					<span className="flex min-w-0 flex-col leading-tight">
						<span className="truncate text-ink">{supplierLabel(c.row.original.supplierId)}</span>
						{c.row.original.from ? <span className="truncate text-ink-3 text-xs">was {supplierLabel(c.row.original.from)}</span> : null}
					</span>
				),
			},
			{
				id: "lines",
				accessorFn: (r) => r.lines.reduce((n, l) => n + l.quantity, 0),
				header: "Regels",
				size: 132,
				cell: (c) => (
					<span className="flex items-center gap-1.5">
						<span className="flex -space-x-1.5">
							{c.row.original.lines.slice(0, 3).map((l) => (
								<ProductThumb key={l.id} src={image(l.product_id)} title={l.title} size={24} className="ring-2 ring-paper" />
							))}
						</span>
						<span className="text-ink-2 tabular-nums">{c.getValue() as number}×</span>
					</span>
				),
			},
			{ id: "store", accessorFn: (r) => r.order.store_id, header: "Winkel", filterFn: facetFilter },
			{
				id: "paid",
				accessorFn: (r) => r.order.total,
				header: "Betaald",
				size: 104,
				cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.order.total, c.row.original.order.currency)}</span>,
			},
			{
				id: "since",
				accessorFn: (r) => r.since,
				header: "Wacht sinds",
				size: 104,
				cell: (c) => <span className={cn("tabular-nums", overdue(c.row.original.effective, c.row.original.since, now) ? "font-medium text-signal-red" : "text-ink-2")}>{waitedLabel(c.row.original.since, now)}</span>,
			},
			{
				id: "state",
				accessorFn: (r) => r.effective,
				header: "Status",
				size: 200,
				cell: (c) => (
					<span className="flex min-w-0 flex-col items-start gap-0.5">
						<LegBadge row={c.row.original} now={now} />
						{c.row.original.note && c.row.original.effective === "error" ? <span className="max-w-[260px] truncate text-ink-3 text-xs">{c.row.original.note}</span> : null}
					</span>
				),
			},
			{ id: "via", accessorFn: (r) => (r.via ? VIA_LABEL[r.via] : ""), header: "Via", size: 120 },
			{
				id: "next",
				header: "",
				size: 280,
				enableSorting: false,
				cell: (c) => {
					const r = c.row.original;
					if (r.effective !== "error") return null;
					const btn = "flex h-7 items-center gap-1 rounded-md px-2 font-medium text-xs transition-colors";
					return (
						<span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
							<Gate perm="orders" arg={2}>
								<button type="button" onClick={() => setRerouting(r)} className={cn(btn, "field text-ink hover:field-hover")}>
									<Truck className="size-3.5" strokeWidth={1.75} />
									Andere leverancier
								</button>
							</Gate>
							<Gate perm="support" arg={2}>
								<button type="button" onClick={() => setMailing(r)} className={cn(btn, "text-ink-2 hover:bg-ink/6 hover:text-ink")}>
									<Mail className="size-3.5" strokeWidth={1.75} />
									Klant mailen
								</button>
							</Gate>
							<Gate perm="orders" arg={2}>
								<button type="button" onClick={() => setCancelling(r)} className={cn(btn, "text-signal-red hover:bg-signal-red-bg")}>
									<XCircle className="size-3.5" strokeWidth={1.75} />
									Annuleren
								</button>
							</Gate>
						</span>
					);
				},
			},
		],
		// biome-ignore lint/correctness/useExhaustiveDependencies: `now` ticks the waiting times
		[now, products],
	);

	const toForward = all.filter((r) => r.effective === "to_forward");
	const proposalKey = `forward:${toForward.map((r) => r.key).sort().join(",")}`;
	const meta = `${counts.to_forward} te versturen · ${counts.awaiting} wachten op bevestiging${counts.late ? ` (${counts.late} te laat)` : ""} · ${counts.forward_error} fout`;

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={VIEW_LABEL[view]}
				crumbs={[{ label: "Bestellingen", to: "/orders" }]}
				meta={meta}
				actions={
					view !== "awaiting" && rows.some((r) => r.effective === "to_forward" || r.effective === "error") ? (
						<Gate perm="orders" arg={2}>
							<button
								type="button"
								onClick={() => setForwarding(rows.filter((r) => r.effective === "to_forward" || r.effective === "error"))}
								className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
							>
								<Send className="size-3.5" strokeWidth={1.75} />
								Alles doorsturen
							</button>
						</Gate>
					) : null
				}
			/>
			<div className="flex min-w-0 flex-col gap-4 px-5 pb-6">
				{view === "to_forward" && toForward.length > 0 && edit.ok ? (
					<AgentSuggestion
						key={proposalKey}
						id={proposalKey}
						action="ForwardOrder"
						wide
						level={2}
						proposal={{
							title: forwardSentence(toForward),
							body: `Betaald, op voorraad volgens de leveranciers en met een volledig adres. ${toForward.map((r) => r.order.number).slice(0, 4).join(", ")}${toForward.length > 4 ? " en meer" : ""} gaan via ${[...new Set(toForward.map((r) => supplierLabel(r.supplierId)))].join(", ")}.`,
							confidence: 92,
							why: "Elke bestelling staat al langer dan 30 minuten betaald klaar. Doorsturen kan nog worden ingetrokken tot de leverancier bevestigt.",
							fileLabel: "Doorsturen",
							action: { kind: "open", to: "/orders" },
						}}
						evidence={<ForwardEvidence rows={toForward} />}
						draft={{
							sentence: forwardSentence(toForward).replace(/ doorsturen$/, " doorgestuurd"),
							record: { kind: "order", label: `${toForward[0]?.order.number ?? ""}${toForward.length > 1 ? ` +${toForward.length - 1}` : ""}`, to: "/orders", search: { view: "awaiting" } },
							trigger: "Betaalde bestellingen",
							sources: toForward.slice(0, 4).map((r) => ({ kind: "order" as const, title: r.order.number, detail: `${supplierLabel(r.supplierId)} · ${r.lines.length} ${r.lines.length === 1 ? "regel" : "regels"}`, to: `/orders/${r.order.id}` })),
							reason: "Betaald, adres compleet en de leverancier meldt voorraad.",
							compensation: "Terughalen",
						}}
						perform={() => {
							// The plate is one decision, so it is one log row over every leg; its undo takes them all back.
							const keys = toForward.map((r) => r.key);
							useForwarding.getState().forwardLegs(keys, "Insyte", undefined, 0);
							return { effect: { kind: "order.forward", keys }, after: `${toForward.length} wachten op bevestiging` };
						}}
					/>
				) : view === "to_forward" ? (
					<RecentAgentRow action="ForwardOrder" />
				) : null}
				<DataTable
					columns={columns}
					data={rows}
					facets={FACETS}
					actions={actions}
					noun={["leg", `forward-${view}`]}
					label={["bestelling", "bestellingen"]}
					getRowId={(r) => r.key}
					searchPlaceholder="Bestellingen zoeken"
					initialVisibility={{ store: false, via: view === "awaiting", paid: view !== "forward_error", customer: view !== "forward_error" }}
					initialSorting={[{ id: "since", desc: false }]}
					onRowClick={(r) => navigate({ to: "/orders/$orderId", params: { orderId: r.orderId }, state: OPEN_AS_MODAL })}
					empty={
						<EmptyState
							kind="orders"
							title={view === "to_forward" ? "Alles is doorgestuurd" : view === "awaiting" ? "Niets wacht op een leverancier" : "Geen fouten"}
							body={view === "to_forward" ? "Betaalde bestellingen komen hier tot ze naar hun leverancier gaan." : view === "awaiting" ? "Wat je doorstuurt, staat hier tot de leverancier het bevestigt." : "Wat een leverancier niet kan leveren, staat hier."}
						/>
					}
				/>
			</div>
			<ForwardDialog rows={forwarding} onClose={() => setForwarding(null)} />
			<RerouteDialog row={rerouting} onClose={() => setRerouting(null)} />
			<MailCustomerDialog row={mailing} onClose={() => setMailing(null)} />
			<ConfirmDialog
				open={cancelling !== null}
				onOpenChange={(o) => !o && setCancelling(null)}
				tone="destructive"
				title={cancelling ? `${cancelling.order.number} annuleren?` : ""}
				description={
					cancelling
						? `De bestelling van ${cancelling.order.customer_name} wordt in Shopify geannuleerd en ${formatCurrency(cancelling.order.total, cancelling.order.currency)} gaat terug naar de klant. Na betaling kan dat niet meer worden teruggedraaid.`
						: undefined
				}
				confirmLabel="Bestelling annuleren"
				onConfirm={() => {
					if (!cancelling) return;
					useForwarding.getState().cancelLeg(cancelling.key, me);
					useWorkspace.getState().cancelOrder(cancelling.order.id);
					toast(`${cancelling.order.number} geannuleerd`, { description: "De klant krijgt bericht van Shopify." });
					setCancelling(null);
				}}
			/>
			<PageGuide id="orders.forwarding" title="Doorsturen" steps={GUIDE} />
		</div>
	);
}

/** The lines the plate rests on, in its chalk: order, supplier, how many. */
function ForwardEvidence({ rows }: { rows: ReadonlyArray<QueueRow> }) {
	const groups = [...new Set(rows.map((r) => r.supplierId))].map((s) => ({ s, rows: rows.filter((r) => r.supplierId === s) }));
	return (
		<dl className="grid w-full grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
			{groups.map((g) => (
				<div key={g.s} className="flex min-w-0 flex-col gap-0.5">
					<dt className="truncate text-mesh-ink-2 text-xs">{supplierLabel(g.s)}</dt>
					<dd className="truncate text-mesh-ink tabular-nums">{g.rows.map((r) => r.order.number).join(", ")}</dd>
				</div>
			))}
		</dl>
	);
}

/* ── dialogs ───────────────────────────────────────────────────────────────────────────────── */

/**
 * One dialog for any number of legs: per supplier the orders and their lines, how they go, a note,
 * and the button that says what will happen ("12 bestellingen naar 3 leveranciers doorsturen").
 */
export function ForwardDialog({ rows, onClose }: { rows: QueueRow[] | null; onClose: () => void }) {
	const prefs = useForwarding((s) => s.prefs);
	const me = useMyName();
	const [via, setVia] = useState<Record<string, ForwardVia>>({});
	const [note, setNote] = useState("");
	const legs = (rows ?? []).filter((r) => r.effective === "to_forward" || r.effective === "error");
	const groups = [...new Set(legs.map((r) => r.supplierId))].map((s) => ({ s, rows: legs.filter((r) => r.supplierId === s) }));
	const sentence = forwardSentence(legs);
	return (
		<FormDialog
			open={rows !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setNote("");
					setVia({});
				}
			}}
			title="Doorsturen naar leveranciers"
			description="Elke leverancier krijgt alleen zijn eigen regels en het verzendadres, nooit de prijzen of de andere leveranciers."
			primaryLabel={sentence.charAt(0).toUpperCase() + sentence.slice(1)}
			disabled={legs.length === 0}
			width={620}
			onSubmit={() => {
				const undo = useForwarding.getState().forwardLegs(
					legs.map((r) => r.key),
					me,
					via,
				);
				undoable("Wordt doorgestuurd…", undo, `${sentence.replace(/ doorsturen$/, "")}. Ongedaan maken kan tot het vertrekt.`);
				if (note.trim()) for (const r of legs)
					useWorkspace.getState().addOrderNote(r.orderId, `Notitie voor ${supplierLabel(r.supplierId)}: ${note.trim()}`);
				onClose();
				setNote("");
			}}
		>
			<ul className="flex max-h-[340px] flex-col gap-3 overflow-y-auto">
				{groups.map((g) => {
					const v = via[g.s] ?? prefs[g.s]?.via ?? "portal";
					return (
						<li key={g.s} className="flex flex-col gap-2 rounded-lg bg-mist px-3 py-2.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-base text-ink">{supplierLabel(g.s)}</span>
								<span className="text-ink-3 text-sm">{counted(g.rows.length, "bestelling", "bestellingen")}</span>
								<span className="flex-1" />
								<span role="radiogroup" aria-label={`Hoe naar ${supplierLabel(g.s)}`} className="inline-flex h-7 items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
									{(["portal", "email", "api"] as const).map((x) => (
										<button
											key={x}
											type="button"
											role="radio"
											aria-checked={x === v}
											onClick={() => setVia((s) => ({ ...s, [g.s]: x }))}
											className={cn("h-6 rounded-[5px] px-2 font-medium text-xs transition-colors", x === v ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:text-ink")}
										>
											{VIA_LABEL[x]}
										</button>
									))}
								</span>
							</div>
							<ul className="flex flex-col gap-0.5">
								{g.rows.map((r) => (
									<li key={r.key} className="flex min-w-0 items-baseline gap-2 text-sm">
										<span className="shrink-0 font-medium text-ink tabular-nums">{r.order.number}</span>
										<span className="min-w-0 truncate text-ink-2">{r.lines.map((l) => `${l.quantity}× ${l.title} · ${l.variant_title}`).join(", ")}</span>
										{r.effective === "error" ? <span className="shrink-0 text-signal-red text-xs">opnieuw</span> : null}
									</li>
								))}
							</ul>
						</li>
					);
				})}
			</ul>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Notitie voor de leveranciers (optioneel)</span>
				<TextAreaField value={note} onChange={setNote} placeholder="Bijvoorbeeld: cadeauverpakking, geen prijzen op de pakbon" rows={2} />
			</label>
		</FormDialog>
	);
}

function RerouteDialog({ row, onClose }: { row: QueueRow | null; onClose: () => void }) {
	const me = useMyName();
	const [pick, setPick] = useState<string | null>(null);
	const others = Object.keys(NAMES).filter((s) => s !== row?.supplierId);
	return (
		<FormDialog
			open={row !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setPick(null);
				}
			}}
			title={row ? `${row.order.number} naar een andere leverancier` : ""}
			description={row ? `${supplierLabel(row.supplierId)}: ${REASON_LABEL[row.reasonNow ?? "rejected"].toLowerCase()}. Kies wie het wel kan leveren; de bestelling komt dan weer bij Te versturen.` : undefined}
			primaryLabel={pick ? `Naar ${supplierLabel(pick)}` : "Kies een leverancier"}
			disabled={!pick}
			onSubmit={() => {
				if (!row || !pick) return;
				const undo = useForwarding.getState().rerouteLeg(row.key, pick, me);
				undoable(`${row.order.number} gaat naar ${supplierLabel(pick)}`, undo, "Staat bij Te versturen.");
				onClose();
				setPick(null);
			}}
		>
			<ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Leverancier">
				{others.map((s) => (
					<li key={s}>
						<button
							type="button"
							role="radio"
							aria-checked={pick === s}
							onClick={() => setPick(s)}
							className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors", pick === s ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink hover:bg-ink/6")}
						>
							<span className="font-medium text-base">{supplierLabel(s)}</span>
							{pick === s ? <Check className="size-4" strokeWidth={2.25} /> : null}
						</button>
					</li>
				))}
			</ul>
		</FormDialog>
	);
}

/** The customer, told what went wrong, in the brand's words; a send waits out the window. */
function MailCustomerDialog({ row, onClose }: { row: QueueRow | null; onClose: () => void }) {
	const first = row?.order.customer_name.split(" ")[0] ?? "";
	const what = row?.lines[0] ? `${row.lines[0].title} (${row.lines[0].variant_title})` : "een artikel";
	const draft = row
		? row.reasonNow === "address"
			? `Hoi ${first},\n\nBedankt voor je bestelling ${row.order.number}. Om hem te kunnen versturen, missen we je huisnummer. Kun je het adres even aanvullen door op deze mail te antwoorden?\n\nGroet,\nNorthwind`
			: `Hoi ${first},\n\nBedankt voor je bestelling ${row.order.number}. ${what} is bij onze leverancier helaas net uitverkocht. We kunnen hem over ongeveer twee weken alsnog sturen, of je het bedrag meteen terugbetalen. Laat je weten wat je wilt?\n\nGroet,\nNorthwind`
		: "";
	const [body, setBody] = useState<string | null>(null);
	const [subject, setSubject] = useState<string | null>(null);
	const text = body ?? draft;
	const subj = subject ?? (row ? `Over je bestelling ${row.order.number}` : "");
	return (
		<FormDialog
			open={row !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setBody(null);
					setSubject(null);
				}
			}}
			title={row ? `${row.order.customer_name} mailen` : ""}
			description={row ? `Aan ${row.order.customer_email}. Insyte schreef het concept; jij verstuurt het.` : undefined}
			primaryLabel="Versturen"
			disabled={!text.trim()}
			onSubmit={() => {
				if (!row) return;
				const order = row.order;
				let sent = true;
				toast("Wordt verstuurd…", {
					description: `Aan ${order.customer_name}: ${subj}`,
					duration: 6000,
					action: { label: "Ongedaan maken", onClick: () => (sent = false) },
					onAutoClose: () => {
						if (sent) useWorkspace.getState().addOrderNote(order.id, `Klant gemaild: ${subj}`);
					},
				});
				onClose();
				setBody(null);
				setSubject(null);
			}}
		>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Onderwerp</span>
				<TextField value={subj} onChange={setSubject} />
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Bericht</span>
				<TextAreaField value={text} onChange={setBody} rows={8} />
			</label>
		</FormDialog>
	);
}

/* ── the tracker on an order ───────────────────────────────────────────────────────────────── */

const STEPS = ["Betaald", "Naar leverancier", "Bevestigd", "Verzonden", "Bezorgd"] as const;

const at = (iso: string | undefined) => (iso ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : undefined);

/**
 * Verwerking, above the lines on an order: Betaald → Naar leverancier → Bevestigd → Verzonden →
 * Bezorgd, one track per supplier when the order has lines from two, each step with its time and
 * who did it. A failed step says why in red. Vertical under `sm`.
 */
export function ProcessingTracker({ order }: { order: Order }) {
	const now = useNow(useSendingTick());
	const legs = useForwardLegs(now).filter((l) => l.orderId === order.id);
	const work = useWorkspace((s) => s.supplierWork);
	const supplierIds = [...new Set(order.line_items.map((l) => l.supplier_id ?? "").filter(Boolean))];
	if (supplierIds.length === 0 || order.status === "cancelled") return null;
	const tracks = supplierIds.map((s) => {
		const leg = legs.find((l) => (l.from ?? l.supplierId) === s);
		const w = work[`${order.id}|${s}`];
		const shipped = w?.parcels[0]?.at ?? (order.status === "shipped" || order.status === "delivered" ? order.updated_at : undefined);
		const delivered = order.status === "delivered" ? order.updated_at : undefined;
		const state = leg?.effective ?? (shipped ? "confirmed" : order.status === "at_supplier" ? "confirmed" : "to_forward");
		const reached = delivered ? 5 : shipped ? 4 : state === "confirmed" ? 3 : state === "awaiting" || state === "sending" || state === "error" ? 2 : 1;
		const detail: Array<string | undefined> = [
			at(order.created_at),
			reached >= 2 ? [leg?.since && state !== "confirmed" ? at(leg.since) : undefined, leg?.by].filter(Boolean).join(" · ") || undefined : undefined,
			reached >= 3 ? [at(w?.accepted_at ?? (state === "confirmed" ? leg?.since : undefined)), supplierLabel(leg?.supplierId ?? s)].filter(Boolean).join(" · ") : undefined,
			reached >= 4 ? [at(shipped), w?.parcels[0]?.carrier ?? order.carrier].filter(Boolean).join(" · ") : undefined,
			reached >= 5 ? at(delivered) : undefined,
		];
		return { s: leg?.supplierId ?? s, from: leg?.from, leg, state, reached, detail };
	});
	return (
		<section aria-label="Verwerking" className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
			<header className="flex items-center justify-between">
				<h2 className="font-medium text-md text-ink">Verwerking</h2>
				{tracks.length > 1 ? <span className="text-ink-3 text-sm">{tracks.length} leveranciers</span> : null}
			</header>
			{tracks.map((t) => {
				const failed = t.state === "error";
				return (
					<div key={t.s} className="flex flex-col gap-2">
						<p className="flex flex-wrap items-center gap-2 text-sm">
							<span className="font-medium text-ink">{supplierLabel(t.s)}</span>
							{t.from ? <span className="text-ink-3">was {supplierLabel(t.from)}</span> : null}
							{t.leg ? <LegBadge row={t.leg} now={now} /> : null}
						</p>
						<ol className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:gap-0">
							{STEPS.map((label, i) => {
								const n = i + 1;
								const done = n <= t.reached && !(failed && n === 2);
								const here = n === t.reached;
								return (
									<li key={label} className="flex items-start gap-2.5 sm:flex-col sm:gap-1.5">
										<span className="flex items-center sm:w-full">
											<span
												className={cn(
													"flex size-5 shrink-0 items-center justify-center rounded-full",
													failed && n === 2 ? "bg-signal-red-bg text-signal-red" : done ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-4",
												)}
											>
												{failed && n === 2 ? <AlertTriangle className="size-3" strokeWidth={2} /> : done ? <Check className="size-3" strokeWidth={2.5} /> : <span className="size-1.5 rounded-[1px] bg-current" />}
											</span>
											{i < STEPS.length - 1 ? <span className={cn("ml-1.5 hidden h-px flex-1 sm:block", n < t.reached ? "bg-abyss/40" : "bg-hairline")} /> : null}
										</span>
										<span className="flex min-w-0 flex-col pr-2">
											<span className={cn("text-sm", here ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3")}>{failed && n === 2 ? REASON_LABEL[t.leg?.reasonNow ?? "rejected"] : label}</span>
											{t.detail[i] ? <span className="truncate text-ink-3 text-xs">{t.detail[i]}</span> : null}
										</span>
									</li>
								);
							})}
						</ol>
					</div>
				);
			})}
		</section>
	);
}

