import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { deliveriesSeed } from "../../data-source";
import { useMyName } from "../ask/agent-parts";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { useProducts } from "../hooks/use-operator-data";
import type { ReturnKind } from "../lib/returns";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { useReturns } from "../stores/returns-store";
import { useWorkspace } from "../stores/workspace-store";
import { CustomerReturnsPanel, OrderPickForm, OrderReturnsPanel, StartReturnForm } from "./order-returns";
import type { StartLine, StartOrder } from "./source";

/*
 * The returns parts of the order, the customer and "Retour starten" over the design app's stores (the views are
 * `order-returns.tsx`'s): the store's records, the workspace's orders and products, and a return made in the store.
 */

const SIZE: Record<string, string> = { s: "Klein", m: "Middel", l: "Groot" };

/**
 * The returns and claims on one order, in its sidebar, each opening its record. The operator can
 * start one for a shopper who called or mailed (`StartReturnDialog`).
 */
export function OrderReturns({ order, onStart }: { order: Order; onStart: () => void }) {
	const all = useReturns((s) => s.records);
	const records = useMemo(() => all.filter((r) => r.orderId === order.id), [all, order.id]);
	return <OrderReturnsPanel records={records} onStart={onStart} />;
}

/**
 * A return started by the operator: which lines, why, what the shopper wants. It lands in Te
 * beoordelen like one from the portal, with the operator as its first entry.
 */
export function StartReturnDialog({ order, open, onClose }: { order: StartOrder; open: boolean; onClose: () => void }) {
	const settings = useReturns((s) => s.settings);
	const full = useWorkspace((s) => s.orders.find((o) => o.id === order.id));
	const { data: products } = useProducts();
	const me = useMyName();
	const navigate = useNavigate();
	const lines = useMemo<StartLine[]>(
		() =>
			(full?.line_items ?? []).map((l) => {
				const p = products.find((x) => x.id === l.product_id);
				return { id: l.id, title: l.title, label: `${p?.title ?? l.title} · ${SIZE[l.variant_id.slice(-1)] ?? l.variant_title}`, image: p?.images[0] };
			}),
		[full, products],
	);
	return (
		<StartReturnForm
			order={order}
			open={open}
			onClose={onClose}
			reasons={settings.reasons}
			offered={settings.offered}
			lines={lines}
			onStart={(draft) => {
				if (!full) return;
				const def = settings.reasons.find((r) => r.id === draft.reason);
				const kind: ReturnKind = def?.claim ? "claim" : "return";
				const items = full.line_items
					.filter((l) => draft.lines.includes(l.id))
					.map((l) => ({ lineId: l.id, productId: l.product_id, variantId: l.variant_id, title: products.find((p) => p.id === l.product_id)?.title ?? l.title, variantTitle: SIZE[l.variant_id.slice(-1)] ?? l.variant_title, qty: 1, unitPrice: l.unit_price }));
				const rec = useReturns.getState().create(
					{
						kind,
						orderId: full.id,
						orderNumber: full.number,
						customerId: full.customer_id,
						customerName: full.customer_name,
						customerEmail: full.customer_email,
						storeId: full.store_id,
						country: full.shipping_address?.country ?? "NL",
						currency: full.currency,
						items,
						reason: draft.reason,
						note: draft.note.trim() || "Gemeld bij het team.",
						photos: [],
						requested: draft.want,
						deliveredAt: deliveriesSeed[full.id] ?? full.updated_at,
					},
					{ at: new Date().toISOString(), who: "team", name: me, text: `${kind === "claim" ? "Claim" : "Retour"} gestart namens de klant` },
				);
				undoable(`${rec.number} aangemaakt`, () => useReturns.setState((s) => ({ records: s.records.filter((r) => r.id !== rec.id) })));
				void navigate({ to: "/returns/$returnId", params: { returnId: rec.id }, state: OPEN_AS_MODAL });
			}}
		/>
	);
}

/** A customer's returns and claims, newest first, in their sidebar. Nothing when there are none. */
export function CustomerReturns({ email }: { email: string }) {
	const all = useReturns((s) => s.records);
	const records = useMemo(() => all.filter((r) => r.customerEmail === email), [all, email]);
	return <CustomerReturnsPanel records={records} />;
}

/** "Retour starten" from anywhere but an order: find the order first, by number or name. */
export function OrderPickDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (o: StartOrder) => void }) {
	const orders = useWorkspace((s) => s.orders);
	return <OrderPickForm open={open} onClose={onClose} onPick={onPick} orders={orders} />;
}

