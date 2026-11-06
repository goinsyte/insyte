import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProposalPlate } from "../ask/parts";
import { ProductThumb } from "../product/product-thumb";
import { sellThrough, stockOf, unitsOf } from "../lib/catalog";
import { suppliers } from "../../data-source";
import type { Product } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import type { Decision } from "../stores/ask-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * The low-stock advice, drawn the way Insyte draws every proposal: a plate, with the evidence in it
 * and the decision at its foot. It picks the product that runs out soonest at its own pace — units on
 * hand over units sold a day — and proposes the two things that stop it costing orders: pause the
 * ads that are still sending buyers to it, and ask the supplier for a restock date. Filing does both,
 * with Undo; Discard leaves everything as it is. Nothing is decided until the operator files it.
 */
export function LowStockPlate({ products }: { products: ReadonlyArray<Product> }) {
	const orders = useWorkspace((s) => s.orders);
	const edits = useWorkspace((s) => s.productEdits);
	const navigate = useNavigate();
	const [decided, setDecided] = useState<Record<string, Decision>>({});

	const pick = useMemo(() => {
		const candidates = products
			.filter((p) => p.status !== "archived" && stockOf(p) !== "available" && (!edits[p.id]?.adsPaused || decided[p.id]))
			.map((p) => ({ p, ...sellThrough(p, orders) }))
			.filter((c) => c.daysLeft !== null || unitsOf(c.p) === 0)
			.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
		return candidates.find((c) => decided[c.p.id] !== "discarded") ?? null;
	}, [products, orders, edits, decided]);

	if (!pick) return null;
	const { p, perDay, daysLeft } = pick;
	const supplier = suppliers.find((s) => s.id === p.supplier_id);
	const units = unitsOf(p);
	const openOrders = orders.filter(
		(o) => o.line_items.some((li) => li.product_id === p.id) && !["delivered", "cancelled", "refunded"].includes(o.status),
	).length;
	const sold = Math.round(perDay * 30);
	const when =
		units === 0 ? "is uitverkocht" : daysLeft !== null && daysLeft < 1 ? "is vandaag op" : `is over ${Math.round(daysLeft ?? 0)} ${Math.round(daysLeft ?? 0) === 1 ? "dag" : "dagen"} op`;

	return (
		<div className="mb-3">
			<ProposalPlate
				level={2}
				wide
				evidence={
					<div className="flex flex-wrap items-center gap-x-8 gap-y-3">
						<ProductThumb src={p.images[0]} title={p.title} size={44} />
						{[
							["Op voorraad", units.toLocaleString("nl-NL")],
							["Verkocht, 30 dagen", sold.toLocaleString("nl-NL")],
							["In open bestellingen", openOrders.toLocaleString("nl-NL")],
							["Op over", units === 0 ? "nu" : daysLeft === null ? "—" : `${Math.max(0, Math.round(daysLeft))} d`],
						].map(([k, v]) => (
							<div key={k} className="flex flex-col gap-0.5">
								<span className="text-mesh-ink-2 text-xs">{k}</span>
								<span className="figure text-2xl text-mesh-ink">{v}</span>
							</div>
						))}
						{supplier ? <span className="text-mesh-ink-2 text-xs">Leverancier {supplier.name}</span> : null}
					</div>
				}
				proposal={{
					title: `Advertenties voor ${p.title} pauzeren en ${supplier?.name ?? "de leverancier"} om nieuwe voorraad vragen`,
					body:
						units === 0
							? `${p.title} is uitverkocht en verkoopt nog: ${sold} in de bestellingen van de afgelopen 30 dagen. Het zit in ${openOrders} open ${openOrders === 1 ? "bestelling" : "bestellingen"}.`
							: `${p.title} ${when} als het tempo zo blijft: nog ${units} over, ongeveer ${perDay < 1 ? `${sold} per maand` : `${perDay.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} per dag`}. Het zit in ${openOrders} open ${openOrders === 1 ? "bestelling" : "bestellingen"}.`,
					confidence: Math.min(94, 58 + sold * 3),
					why: `Op basis van ${sold} verkocht in de bestellingen van de afgelopen 30 dagen. Advertenties blijven kopers sturen terwijl de voorraad slinkt.`,
					fileLabel: "Pauzeren en vragen",
					action: { kind: "open", to: "/products" },
				}}
				decision={decided[p.id] ?? "open"}
				onFile={() => {
					const ws = useWorkspace.getState();
					const before = ws.productEdits;
					ws.editProducts({ [p.id]: { adsPaused: true } });
					const ticket = ws.createTicket({
						title: `${p.title} bijbestellen bij ${supplier?.name ?? "de leverancier"}`,
						description: `${p.title} ${when} (${units} op voorraad, ${perDay.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} verkocht per dag). Advertenties staan op pauze tot het terug is. Vraag wanneer er nieuwe voorraad komt.`,
						priority: units === 0 ? "high" : "medium",
						status: "awaiting_reply",
						tags: ["Leverancier"],
					});
					setDecided((d) => ({ ...d, [p.id]: "filed" }));
					undoable(`Advertenties voor ${p.title} gepauzeerd, bijbestelling gevraagd in ${ticket.number}`, () => {
						useWorkspace.getState().restoreProducts(before);
						useWorkspace.setState((s) => ({ tickets: s.tickets.filter((t) => t.id !== ticket.id) }));
						setDecided((d) => ({ ...d, [p.id]: "open" }));
					});
				}}
				onDiscard={() => setDecided((d) => ({ ...d, [p.id]: "discarded" }))}
				onEdit={() => navigate({ to: "/products/$productId", params: { productId: p.id } })}
			/>
		</div>
	);
}
