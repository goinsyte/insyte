import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, MessageSquare, Send, Tag, Truck, XCircle } from "../../icons";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { useOrders } from "../hooks/use-operator-data";
import { copyLines, counted, exportCsv, patchMany } from "../lib/bulk";
import { SUPPLIERS, supplierName } from "../lib/order-supplier";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { ListClosing, useListStarts } from "../marketing-sections/closings";
import { useGate, useStoreScope } from "../stores/access-store";
import { useWorkspace } from "../stores/workspace-store";
import type { RowAction } from "../table/data-table";
import { ForwardingList } from "./forwarding";
import { NewOrderDialog } from "./new-order-dialog";
import { isClosed } from "./orders-screen";
import { type OrdersSource, OrdersSourceProvider } from "./source";

/*
 * The orders list's source in the design app: the demo workspace's orders as the screen read them before it had a
 * source, the selection bar's actions over them (each with one Undo), the draft-order dialog and the forwarding queue.
 */

const STORES = ["Zenith Tech", "Blue Ocean", "Pinnacle Designs", "TechSphere"] as const;

function storeName(id: string) {
	switch (id) {
		case "store_us":
			return "Zenith Tech";
		case "store_eu":
			return "Blue Ocean";
		case "store_uk":
			return "Pinnacle Designs";
		default:
			return "TechSphere";
	}
}

const now = () => new Date().toISOString();

/* What the selection bar and its ⌘K menu offer on orders. Each one changes the workspace, and the
   ones that change a record come back with one Undo for the whole selection. */
export const demoOrderActions = (openTags: (rows: Order[]) => void): ReadonlyArray<RowAction<Order>> => [
	{
		id: "tag",
		needs: { perm: "orders", arg: 2 },
		label: "Label toevoegen",
		icon: Tag,
		group: "Ordenen",
		shortcut: "g",
		run: (rows) => openTags([...rows]),
	},
	{
		id: "fulfil",
		needs: { perm: "orders", arg: 2 },
		label: "Als afgehandeld markeren",
		icon: Truck,
		group: "Afhandeling",
		shortcut: "f",
		bar: true,
		applies: (o) => !isClosed(o) && o.fulfillment_status !== "fulfilled",
		run: (rows) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({ ...o, status: "shipped", fulfillment_status: "fulfilled", updated_at: now() }),
				`${counted(rows.length, "bestelling", "bestellingen")} als afgehandeld gemarkeerd`,
			),
	},
	{
		id: "flag",
		needs: { perm: "orders", arg: 2 },
		label: "Als vertraagd markeren",
		icon: AlertTriangle,
		group: "Afhandeling",
		shortcut: "d",
		bar: true,
		applies: (o) => !isClosed(o) && !o.tags.includes("at_risk"),
		run: (rows) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({ ...o, tags: [...o.tags, "at_risk"] }),
				`${counted(rows.length, "bestelling", "bestellingen")} als vertraagd gemarkeerd`,
			),
	},
	{
		id: "unflag",
		needs: { perm: "orders", arg: 2 },
		label: "Vertraging wissen",
		icon: AlertTriangle,
		group: "Afhandeling",
		applies: (o) => o.tags.includes("at_risk"),
		run: (rows) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({ ...o, tags: o.tags.filter((t) => t !== "at_risk") }),
				`Vertraging gewist bij ${counted(rows.length, "bestelling", "bestellingen")}`,
			),
	},
	{
		id: "tracking",
		needs: { perm: "orders", arg: 2 },
		label: "Track & trace-update sturen",
		icon: Send,
		group: "Klanten",
		applies: (o) => o.tracking_number !== undefined && !isClosed(o),
		// The email itself is simulated; the order keeps a "tracking sent" tag, which the detail shows.
		run: (rows) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({ ...o, tags: [...o.tags.filter((t) => t !== "tracking_sent"), "tracking_sent"], updated_at: now() }),
				`Track & trace-update gestuurd naar ${counted(rows.length, "klant", "klanten")}`,
			),
	},
	{
		id: "follow-up",
		needs: { perm: "support", arg: 2 },
		label: "Opvolging voor leverancier opstellen",
		icon: MessageSquare,
		group: "Klanten",
		applies: (o) => !isClosed(o) && o.fulfillment_status !== "fulfilled",
		run: (rows) => {
			const { createTicket } = useWorkspace.getState();
			for (const o of rows)
				createTicket({
					title: `Overdrachtsdatum bevestigen voor ${o.number}`,
					description: `Vraag de leverancier om de overdrachtsdatum en het track & trace-nummer van ${o.number} en laat het daarna ${o.customer_name} weten.`,
					priority: o.tags.includes("at_risk") ? "high" : "medium",
					related_entity: { type: "order", id: o.id, label: o.number },
				});
			toast(`${counted(rows.length, "ticket", "tickets")} opgesteld op het bord`);
		},
	},
	{
		id: "copy",
		label: "Bestelnummers kopiëren",
		icon: Copy,
		group: "Exporteren",
		shortcut: "c",
		run: (rows) => copyLines(rows.map((o) => o.number), counted(rows.length, "bestelnummer", "bestelnummers")),
	},
	{
		id: "csv",
		needs: { perm: "data.export" },
		label: "Exporteren als CSV",
		icon: Download,
		group: "Exporteren",
		run: (rows) =>
			exportCsv(
				"bestellingen",
				["Bestelling", "Klant", "E-mail", "Status", "Totaal", "Geplaatst"],
				rows.map((o) => [o.number, o.customer_name, o.customer_email, o.status, o.total, o.created_at]),
			),
	},
	{
		id: "cancel",
		needs: { perm: "orders", arg: 2 },
		label: "Bestellingen annuleren",
		icon: XCircle,
		group: "Onomkeerbaar",
		destructive: true,
		applies: (o) => !isClosed(o) && o.status !== "shipped" && o.status !== "delivered",
		run: (rows) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({ ...o, status: "cancelled", updated_at: now() }),
				`${counted(rows.length, "bestelling", "bestellingen")} geannuleerd`,
			),
	},
];


function DemoNewOrder({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const navigate = useNavigate();
	const createOrder = useWorkspace((s) => s.createOrder);
	const removeOrder = useWorkspace((s) => s.removeOrder);
	return (
		<NewOrderDialog
			open={open}
			onOpenChange={onOpenChange}
			onCreate={(input) => {
				const order = createOrder(input);
				undoable(`Conceptbestelling ${order.number} aangemaakt`, () => removeOrder(order.id));
				navigate({ to: "/orders/$orderId", params: { orderId: order.id }, state: OPEN_AS_MODAL });
			}}
		/>
	);
}

const DemoClosing = ({ empty }: { empty: boolean }) => <ListClosing area="orders" empty={empty} />;

const STORE_OPTIONS = STORES.map((s) => ({ value: s, label: s }));
const SUPPLIER_OPTIONS = SUPPLIERS.map((s) => ({ value: s, label: s }));

export function DemoOrdersSource({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const { data: allOrders, loading } = useOrders();
	// A role limited to some stores sees only their orders; the count beside the title follows.
	const scope = useStoreScope();
	const orders = useMemo(() => (scope ? allOrders.filter((o) => scope.includes(o.store_id)) : allOrders), [allOrders, scope]);
	const canCreate = useGate("orders", 2);
	const starts = useListStarts("orders");
	const source: OrdersSource = {
		orders,
		loading,
		stores: STORE_OPTIONS,
		storeName,
		suppliers: SUPPLIER_OPTIONS,
		supplierName,
		actions: demoOrderActions,
		applyTags: (rows, tags, mode) =>
			patchMany(
				"orders",
				rows.map((o) => o.id),
				(o) => ({
					...o,
					tags: mode === "add" ? [...new Set([...o.tags, ...tags])] : o.tags.filter((t) => !tags.includes(t)),
					updated_at: now(),
				}),
				`${tags.length === 1 ? `“${tags[0]}”` : `${tags.length} labels`} ${mode === "add" ? "toegevoegd aan" : "verwijderd van"} ${counted(rows.length, "bestelling", "bestellingen")}`,
			),
		canCreate,
		NewOrder: DemoNewOrder,
		Forwarding: ForwardingList,
		starts,
		Closing: DemoClosing,
		open: (o) => navigate({ to: "/orders/$orderId", params: { orderId: o.id }, state: OPEN_AS_MODAL }),
	};
	return <OrdersSourceProvider value={source}>{children}</OrdersSourceProvider>;
}
