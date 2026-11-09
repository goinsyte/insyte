import { type ComponentType, createContext, useContext } from "react";
import type { ForwardView } from "../lib/forwarding";
import type { IndexItem } from "../marketing-sections/link-index";
import type { Order } from "../lib/types/domain";
import type { RowAction } from "../table/data-table";

/**
 * What the orders list reads and does, from whoever hosts it (as `shops/source.tsx` for Winkels): the design app from
 * its demo stores, the console from `Orders.list` (M6.4). The list's markup is the design's; what an order may become
 * is the host's. Where a part is absent the screen leaves it out: the console labels and marks fulfilled (M7.1), copies
 * and exports, and greys "Nieuwe bestelling" out by `canCreate` until draft orders arrive.
 */

export type TeamGate = { ok: boolean; reason: string };

export interface OrdersSource {
	/** The orders the role may see, newest first. */
	orders: ReadonlyArray<Order>;
	loading: boolean;
	/** The Winkel facet's options, and a store's name for its column. */
	stores: ReadonlyArray<{ value: string; label: string }>;
	storeName: (storeId: string) => string;
	/** The Leverancier facet's options, and an order's supplier (the demo's; empty until M8 in the console). */
	suppliers: ReadonlyArray<{ value: string; label: string }>;
	supplierName: (orderId: string) => string;
	/** The selection bar's actions; `openTags` opens the label dialog for the rows. */
	actions: (openTags: (rows: Order[]) => void) => ReadonlyArray<RowAction<Order>>;
	/** Labels added or taken off; absent where they cannot be written yet. */
	applyTags?: ((rows: ReadonlyArray<Order>, tags: ReadonlyArray<string>, mode: "add" | "remove") => void) | undefined;
	/** "Nieuwe bestelling": whether the role may, and the dialog that makes one, where the host can. */
	canCreate: TeamGate;
	NewOrder?: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }> | undefined;
	/** The forwarding queue's views (`?view=`), where the host has them (M8 in the console). */
	Forwarding?: ComponentType<{ view: ForwardView }> | undefined;
	/** The first day's places to start (beside connecting a store), where the host has them. */
	starts?: IndexItem[] | undefined;
	/** The list's closing section, where the host has its figures. */
	Closing?: ComponentType<{ empty: boolean }> | undefined;
	/** Opening an order; absent where the detail is not there yet. */
	open?: ((order: Order) => void) | undefined;
}

const OrdersSourceContext = createContext<OrdersSource | null>(null);

export const OrdersSourceProvider = OrdersSourceContext.Provider;

export function useOrdersSource(): OrdersSource {
	const source = useContext(OrdersSourceContext);
	if (source === null) throw new Error("An orders screen needs an OrdersSourceProvider around it.");
	return source;
}
