import type { ForwardLeg, ForwardPrefs } from "@insyte/ui/data-source";
import { orders } from "./orders";
import { byScenario } from "../scenario";

/*
 * Where each paid order's lines stand with their supplier (PLAN 24, design §2): one leg per order ×
 * supplier, for every order that is placed or paid. Everything older has gone through.
 *
 * A normal Tuesday: six legs to forward (two each for Allure, DPC and Kestrel), three waiting for
 * confirmation — SO-12234 at Kestrel Goods for over a day, the customs delay the demo already tells —
 * and two in error: DPC has the Field broek · steen out of stock on SO-12211, and SO-12228's address
 * is incomplete. The rest were confirmed earlier. Times are measured back from now.
 */

const H = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const SUPPLIER_NAME: Record<string, string> = { sup_allure: "Allure Fulfillment", sup_dpc: "DPC Apparel", sup_kestrel: "Kestrel Goods", sup_blackcedar: "Black Cedar Studio" };

const open = () => orders.filter((o) => o.status === "paid" || o.status === "placed");
const legsOf = () => open().flatMap((o) => [...new Set(o.line_items.map((l) => l.supplier_id ?? ""))].filter(Boolean).map((s) => ({ orderId: o.id, supplierId: s })));

const SETTLED: Record<string, Omit<ForwardLeg, "orderId" | "supplierId">> = {
	"ord_5004|sup_allure": { state: "to_forward", since: ago(0.6) },
	"ord_5016|sup_allure": { state: "to_forward", since: ago(1.4) },
	"ord_5017|sup_dpc": { state: "to_forward", since: ago(2.1) },
	"ord_5023|sup_dpc": { state: "to_forward", since: ago(2.9) },
	"ord_5010|sup_kestrel": { state: "to_forward", since: ago(3.3) },
	"ord_5022|sup_kestrel": { state: "to_forward", since: ago(4.2) },
	"ord_5010|sup_allure": { state: "awaiting", since: ago(3), via: "portal", by: "Elena Hart" },
	"ord_5005|sup_dpc": { state: "awaiting", since: ago(6), via: "email", by: "Ethan Jeppesen" },
	"ord_5034|sup_kestrel": { state: "awaiting", since: ago(31), via: "email", by: "Ethan Jeppesen" },
	"ord_5011|sup_dpc": { state: "error", since: ago(5), via: "portal", reason: "stock", by: "DPC Apparel", note: "Field broek · steen, maat Middel: uitverkocht tot 14 november" },
	"ord_5028|sup_allure": { state: "error", since: ago(2.5), via: "portal", reason: "address", by: "Allure Fulfillment", note: "Huisnummer ontbreekt in het verzendadres" },
};

const settled = (): ForwardLeg[] =>
	legsOf().map((l, i) => ({
		...l,
		...(SETTLED[`${l.orderId}|${l.supplierId}`] ?? { state: "confirmed" as const, since: ago(8 + i * 2), via: "portal" as const, by: SUPPLIER_NAME[l.supplierId] }),
	}));

const busy = (): ForwardLeg[] =>
	legsOf().map((l, i) =>
		i % 13 === 5
			? { ...l, state: "error", since: ago(1 + (i % 9)), reason: i % 2 ? "stock" : "address", by: SUPPLIER_NAME[l.supplierId], via: "portal" }
			: i % 7 === 3
				? { ...l, state: "awaiting", since: ago(2 + (i % 40)), via: "email", by: "Ethan Jeppesen" }
				: { ...l, state: "to_forward", since: ago((i % 30) * 0.4) },
	);

export const forwardingSeed: ForwardLeg[] = byScenario({ empty: [], settled: settled(), busy });

/** How each supplier takes its orders, and whether paid orders go to it at once. */
export const forwardingPrefsSeed: ForwardPrefs = byScenario<ForwardPrefs>({
	empty: {},
	settled: { sup_allure: { via: "portal", auto: false }, sup_dpc: { via: "portal", auto: false }, sup_kestrel: { via: "email", auto: false }, sup_blackcedar: { via: "api", auto: true } },
	busy: (): ForwardPrefs => ({ sup_allure: { via: "api", auto: false }, sup_dpc: { via: "portal", auto: false }, sup_kestrel: { via: "email", auto: false }, sup_blackcedar: { via: "api", auto: true } }),
});
