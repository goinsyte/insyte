import { useMemo } from "react";
import { useProducts } from "./use-operator-data";
import { dueOf, handoffBy, linesOf, ME_SUPPLIER, statusOf, supplierAmount, workKey, type Due, type SupplierStatus, type SupplierWork } from "../lib/supplier-work";
import type { Order, OrderLineItem } from "../lib/types/domain";
import { useWorkspace } from "../stores/workspace-store";
import { legsNow, useForwarding } from "../stores/forwarding-store";
import { legKey } from "../lib/forwarding";

export type SupplierOrderRow = {
	id: string;
	order: Order;
	number: string;
	lines: OrderLineItem[];
	units: number;
	work: SupplierWork | undefined;
	status: SupplierStatus;
	due: Due;
	handoff: Date;
	amount: number;
	city: string;
	country: string;
};

/** Every order with at least one of this supplier's lines, from the supplier's side. */
export function useSupplierOrders(): SupplierOrderRow[] {
	const orders = useWorkspace((s) => s.orders);
	const work = useWorkspace((s) => s.supplierWork);
	const overrides = useForwarding((s) => s.overrides);
	const { data: products } = useProducts();
	return useMemo(
		() => {
			// What the brand has not sent yet does not exist for the supplier (PLAN 24): a leg still to
			// forward, or taken elsewhere, is out; a leg the brand marked confirmed is work to ship.
			const legs = new Map(legsNow(overrides, work, Date.now()).map((l) => [legKey(l.orderId, l.supplierId), l]));
			return orders.flatMap((o) => {
				const lines = linesOf(o, ME_SUPPLIER.id);
				if (lines.length === 0) return [];
				const leg = legs.get(legKey(o.id, ME_SUPPLIER.id));
				if (leg && (leg.effective === "to_forward" || leg.effective === "sending" || leg.effective === "cancelled" || leg.supplierId !== ME_SUPPLIER.id || (leg.effective === "error" && leg.reason !== undefined && leg.by !== ME_SUPPLIER.name))) return [];
				const w = work[workKey(o.id, ME_SUPPLIER.id)];
				const status = statusOf(o, w);
				return [
					{
						id: o.id,
						order: o,
						number: o.number,
						lines,
						units: lines.reduce((n, l) => n + l.quantity, 0),
						work: w,
						status: status === "to_accept" && leg?.effective === "confirmed" ? "to_ship" : status,
						due: dueOf(o, w),
						handoff: handoffBy(o, w),
						amount: supplierAmount(lines, products),
						city: o.shipping_address?.city ?? "",
						country: o.shipping_address?.country ?? "",
					},
				];
			});
		},
		[orders, work, products, overrides],
	);
}

/** The cuts the area panel and the list share. */
export type SupplierView = "to_accept" | "to_ship" | "late" | "problem" | "shipped" | "all";

export function inSupplierView(r: SupplierOrderRow, v: SupplierView): boolean {
	if (v === "all") return true;
	if (v === "late") return (r.status === "to_accept" || r.status === "to_ship") && r.due === "late";
	return r.status === v;
}
