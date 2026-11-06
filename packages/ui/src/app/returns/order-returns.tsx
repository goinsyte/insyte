import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RotateCcw } from "../../icons";
import { useMyName } from "../ask/agent-parts";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { FormDialog, TextAreaField } from "../common/form-dialog";
import { useProducts } from "../hooks/use-operator-data";
import { type ReasonId, type Resolution, RESOLUTION_LABEL, type ReturnKind } from "../lib/returns";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { deliveriesSeed } from "../../data-source";
import { useReturns } from "../stores/returns-store";
import { useWorkspace } from "../stores/workspace-store";
import { ProductThumb } from "../product/product-thumb";
import { ReturnStatusBadge } from "./parts";

/**
 * The returns and claims on one order, in its sidebar, each opening its record. The operator can
 * start one for a shopper who called or mailed (`StartReturnDialog`).
 */
export function OrderReturns({ order, onStart }: { order: Order; onStart: () => void }) {
	const all = useReturns((s) => s.records);
	const records = useMemo(() => all.filter((r) => r.orderId === order.id), [all, order.id]);
	const navigate = useNavigate();
	return (
		<section className="flex flex-col gap-3 rounded-xl px-5 py-4 panel">
			<header className="flex items-center justify-between">
				<h2 className="font-medium text-ink text-md">Retouren</h2>
				<button type="button" onClick={onStart} className="flex h-7 items-center gap-1 rounded-md px-2 font-medium text-arc-ink text-xs hover:bg-arc-tint">
					<RotateCcw className="size-3.5" strokeWidth={1.75} />
					Retour starten
				</button>
			</header>
			{records.length === 0 ? (
				<p className="text-ink-3 text-sm">Geen retouren of claims op deze bestelling.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{records.map((r) => (
						<li key={r.id}>
							<button type="button" onClick={() => navigate({ to: "/returns/$returnId", params: { returnId: r.id }, state: OPEN_AS_MODAL })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink/4">
								<span className="font-medium text-ink text-sm tabular-nums">{r.number}</span>
								<span className="min-w-0 flex-1 truncate text-ink-3 text-sm">{r.items.map((i) => i.title).join(", ")}</span>
								<ReturnStatusBadge status={r.status} />
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

const SIZE: Record<string, string> = { s: "Klein", m: "Middel", l: "Groot" };

/**
 * A return started by the operator: which lines, why, what the shopper wants. It lands in Te
 * beoordelen like one from the portal, with the operator as its first entry.
 */
export function StartReturnDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
	const settings = useReturns((s) => s.settings);
	const { data: products } = useProducts();
	const me = useMyName();
	const navigate = useNavigate();
	const [lines, setLines] = useState<string[]>([]);
	const [reason, setReason] = useState<ReasonId>("too_small");
	const [want, setWant] = useState<Resolution>("refund");
	const [note, setNote] = useState("");
	const def = settings.reasons.find((r) => r.id === reason);
	const kind: ReturnKind = def?.claim ? "claim" : "return";
	const offered = settings.offered.filter((r) => (kind === "return" ? r !== "replacement" : true));

	const reset = () => {
		setLines([]);
		setNote("");
	};
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					reset();
				}
			}}
			title={`Retour starten voor ${order.number}`}
			description={`Namens ${order.customer_name}. Hij komt bij Te beoordelen, net als een aanvraag uit het portaal.`}
			primaryLabel={kind === "claim" ? "Claim aanmaken" : "Retour aanmaken"}
			disabled={lines.length === 0}
			width={600}
			onSubmit={() => {
				const items = order.line_items
					.filter((l) => lines.includes(l.id))
					.map((l) => ({ lineId: l.id, productId: l.product_id, variantId: l.variant_id, title: products.find((p) => p.id === l.product_id)?.title ?? l.title, variantTitle: SIZE[l.variant_id.slice(-1)] ?? l.variant_title, qty: 1, unitPrice: l.unit_price }));
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
						items,
						reason,
						note: note.trim() || "Gemeld bij het team.",
						photos: [],
						requested: want,
						deliveredAt: deliveriesSeed[order.id] ?? order.updated_at,
					},
					{ at: new Date().toISOString(), who: "team", name: me, text: `${kind === "claim" ? "Claim" : "Retour"} gestart namens de klant` },
				);
				undoable(`${rec.number} aangemaakt`, () => useReturns.setState((s) => ({ records: s.records.filter((r) => r.id !== rec.id) })));
				onClose();
				reset();
				void navigate({ to: "/returns/$returnId", params: { returnId: rec.id }, state: OPEN_AS_MODAL });
			}}
		>
			<ul className="flex flex-col gap-1.5">
				{order.line_items.map((l) => {
					const on = lines.includes(l.id);
					const p = products.find((x) => x.id === l.product_id);
					return (
						<li key={l.id}>
							<button
								type="button"
								aria-pressed={on}
								onClick={() => setLines((x) => (on ? x.filter((y) => y !== l.id) : [...x, l.id]))}
								className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors", on ? "bg-arc-tint" : "bg-mist hover:bg-ink/6")}
							>
								<ProductThumb src={p?.images[0]} title={l.title} size={32} />
								<span className="min-w-0 flex-1 truncate text-ink text-sm">{p?.title ?? l.title} · {SIZE[l.variant_id.slice(-1)] ?? l.variant_title}</span>
								<span className={cn("text-xs", on ? "font-medium text-arc-ink" : "text-ink-3")}>{on ? "Gaat terug" : "Kiezen"}</span>
							</button>
						</li>
					);
				})}
			</ul>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Reden</span>
				<div className="flex flex-wrap gap-1.5">
					{settings.reasons.map((r) => (
						<button key={r.id} type="button" aria-pressed={reason === r.id} onClick={() => setReason(r.id)} className={cn("h-7 rounded-md px-2.5 font-medium text-sm", reason === r.id ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
							{r.label}
						</button>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">De klant wil</span>
				<div className="flex flex-wrap gap-1.5">
					{offered.map((r) => (
						<button key={r} type="button" aria-pressed={want === r} onClick={() => setWant(r)} className={cn("h-7 rounded-md px-2.5 font-medium text-sm", want === r ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2 hover:text-ink")}>
							{RESOLUTION_LABEL[r]}
						</button>
					))}
				</div>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className="font-medium text-ink-3 text-sm">Wat de klant zei</span>
				<TextAreaField value={note} onChange={setNote} rows={2} placeholder="Bijvoorbeeld: belde, de rits is na een week kapot" />
			</label>
		</FormDialog>
	);
}


/** A customer's returns and claims, newest first, in their sidebar. Nothing when there are none. */
export function CustomerReturns({ email }: { email: string }) {
	const all = useReturns((s) => s.records);
	const records = useMemo(() => all.filter((r) => r.customerEmail === email), [all, email]);
	const navigate = useNavigate();
	if (records.length === 0) return null;
	return (
		<section className="panel flex flex-col gap-2 rounded-lg p-4">
			<span className="font-medium text-ink-2 text-xs">Retouren · {records.length}</span>
			<ul className="flex flex-col gap-0.5">
				{records.map((r) => (
					<li key={r.id}>
						<button type="button" onClick={() => navigate({ to: "/returns/$returnId", params: { returnId: r.id }, state: OPEN_AS_MODAL })} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-ink/4">
							<span className="font-medium text-ink text-sm tabular-nums">{r.number}</span>
							<span className="min-w-0 flex-1 truncate text-ink-3 text-sm">{r.orderNumber}</span>
							<ReturnStatusBadge status={r.status} />
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

/** "Retour starten" from anywhere but an order: find the order first, by number or name. */
export function OrderPickDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (o: Order) => void }) {
	const orders = useWorkspace((s) => s.orders);
	const [q, setQ] = useState("");
	const sent = orders.filter((o) => o.status === "delivered" || o.status === "shipped");
	const hits = sent.filter((o) => `${o.number} ${o.customer_name} ${o.customer_email}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
	return (
		<FormDialog open={open} onOpenChange={(o) => !o && onClose()} title="Retour starten" description="Voor welke bestelling? Alleen verzonden en bezorgde bestellingen kunnen terug." primaryLabel="Kies een bestelling" disabled onSubmit={() => {}}>
			<input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bestelnummer, naam of e-mail" aria-label="Bestelling zoeken" className="field h-11 w-full rounded-lg px-3.5 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
			<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
				{hits.map((o) => (
					<li key={o.id}>
						<button type="button" onClick={() => onPick(o)} className="flex w-full items-center gap-3 rounded-lg bg-mist px-3 py-2 text-left hover:bg-ink/6">
							<span className="font-medium text-ink text-sm tabular-nums">{o.number}</span>
							<span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{o.customer_name}</span>
							<span className="text-ink-3 text-xs">{o.line_items.length} {o.line_items.length === 1 ? "artikel" : "artikelen"}</span>
						</button>
					</li>
				))}
				{hits.length === 0 ? <li className="px-1 text-ink-3 text-sm">Geen verzonden bestelling gevonden.</li> : null}
			</ul>
		</FormDialog>
	);
}
