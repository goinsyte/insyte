import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ForwardingList, isForwardView } from "./forwarding";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, MessageSquare, Plus, Send, Sparkles, AlertTriangle, Tag, Truck, XCircle } from "../../icons";
import { TagDialog } from "../common/tag-dialog";
import { isSystemTag, tagLabel } from "../lib/order-tags";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { copyLines, counted, exportCsv, patchMany } from "../lib/bulk";
import { useSearchCut } from "../filters/use-search-cut";
import { useOnCreate } from "../stores/create-intent";
import { useWorkspace } from "../stores/workspace-store";
import { undoable } from "../lib/undo";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { EmptyState } from "../common/empty-state";
import { AreaEmpty } from "../common/area-empty";
import { ListClosing } from "../marketing-sections/closings";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { PageHeader } from "../common/page-header";
import { PageGuide } from "../common/page-guide";
import { NewOrderDialog } from "./new-order-dialog";
import { OrderStatusBadge } from "./order-status-badge";
import {
	DataTable,
	type Facet,
	facetFilter,
	type RowAction,
} from "../table/data-table";
import { useOrders } from "../hooks/use-operator-data";
import { useStoreScope } from "../stores/access-store";
import { Gate } from "../access/gate";
import { formatCurrency } from "../lib/format";
import type { Order } from "../lib/types/domain";
import { SUPPLIERS, supplierName } from "../lib/order-supplier";

/*
 * The screen used to open with four stacked rows before a single order: a title, a sentence of
 * explanation, a monumental figure, and a context sentence under that — then a tab strip, then a
 * second heading reading "All orders" over a table of orders. Six rows of chrome for a list.
 *
 * What survived is the one line an operator opens Orders for, beside the heading, and the cuts the
 * tab strip was making — now facets, which compose instead of taking turns.
 */

const STORES = [
	"Zenith Tech",
	"Blue Ocean",
	"Pinnacle Designs",
	"TechSphere",
] as const;

/* The facet's values are the order's real status, so its counts ARE the data rather than a second
   definition of it kept in agreement by hand. `delayed` is the one derived value: an order at risk
   is not a state the store sends, it is a judgement this product makes. */
function cut(o: Order): string {
	return o.tags.includes("at_risk") ? "delayed" : o.status;
}

const isClosed = (o: Order) => o.status === "cancelled" || o.status === "refunded";
const now = () => new Date().toISOString();

/* What the selection bar and its ⌘K menu offer on orders. Each one changes the workspace, and the
   ones that change a record come back with one Undo for the whole selection. */
const orderActions = (openTags: (rows: Order[]) => void): ReadonlyArray<RowAction<Order>> => [
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

const GUIDE = [
	{ title: "Al je bestellingen", body: "Bestellingen komen binnen een minuut na een winkelsynchronisatie binnen, met artikelen, klant en leverancier al gekoppeld.", art: "parcel" },
	{ title: "Labels", body: "Labels zijn van jou, om op te sorteren en te filteren. Vertraagd en Track & trace verstuurd zet Insyte zelf.", art: "rules" },
] as const;

const FACETS: ReadonlyArray<Facet> = [
	{
		id: "cut",
		label: "Status",
		options: [
			{ value: "placed", label: "Geplaatst" },
			{ value: "paid", label: "Betaald" },
			{ value: "at_supplier", label: "Bij leverancier" },
			{ value: "delayed", label: "Vertraagd" },
			{ value: "shipped", label: "Verzonden" },
			{ value: "delivered", label: "Bezorgd" },
			{ value: "refunded", label: "Terugbetaald" },
			{ value: "cancelled", label: "Geannuleerd" },
		],
	},
	{
		id: "store",
		label: "Winkel",
		options: STORES.map((s) => ({ value: s, label: s })),
	},
	{
		id: "supplier",
		label: "Leverancier",
		options: SUPPLIERS.map((s) => ({ value: s, label: s })),
	},
];

export function OrdersList() {
	const view = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>).view });
	return isForwardView(view) ? <ForwardingList key={view} view={view} /> : <AllOrders />;
}

function AllOrders() {
	const navigate = useNavigate();
	const ask = useAskInsyte();
	const { data: allOrders, loading } = useOrders();
	// A role limited to some stores sees only their orders; the count beside the title follows.
	const scope = useStoreScope();
	const orders = useMemo(() => (scope ? allOrders.filter((o) => scope.includes(o.store_id)) : allOrders), [allOrders, scope]);
	const [newOpen, setNewOpen] = useState(false);
	const [tagging, setTagging] = useState<Order[] | null>(null);
	const actions = useMemo(() => orderActions(setTagging), []);
	// Counted from the orders on screen, so the line beside the title is always true.
	const standing = useMemo(() => {
		const open = orders.filter((o) => ["placed", "paid", "at_supplier"].includes(o.status)).length;
		const transit = orders.filter((o) => o.status === "shipped").length;
		const delayed = orders.filter((o) => o.tags.includes("at_risk") && !isClosed(o)).length;
		return `${open} wachten op afhandeling · ${transit} onderweg · ${delayed} vertraagd`;
	}, [orders]);
	const knownTags = useMemo(() => [...new Set(orders.flatMap((o) => o.tags).filter((t) => !isSystemTag(t)))], [orders]);
	const createOrder = useWorkspace((s) => s.createOrder);
	const removeOrder = useWorkspace((s) => s.removeOrder);
	useOnCreate("order", useCallback(() => setNewOpen(true), []));
	useSearchCut("orders", "status", {
		open: { field: "cut", values: ["placed", "paid", "at_supplier", "delayed"] },
		processing: { field: "cut", values: ["at_supplier", "delayed"] },
		shipped: { field: "cut", values: ["shipped"] },
		returned: { field: "cut", values: ["refunded"] },
		cancelled: { field: "cut", values: ["cancelled"] },
		delayed: { field: "cut", values: ["delayed"] },
		delivered: { field: "cut", values: ["delivered"] },
	});

	const columns = useMemo<Array<ColumnDef<Order, unknown>>>(
		() => [
			{
				id: "number",
				accessorKey: "number",
				header: "Bestelling",
				size: 108,
				enableHiding: false,
				cell: (c) => {
					const own = c.row.original.tags.filter((t) => !isSystemTag(t));
					return (
						<span className="flex items-center gap-1.5">
							<span className="font-medium text-ink">{c.row.original.number}</span>
							{own.length > 0 ? (
								<span className="truncate rounded-sm bg-mist px-1.5 py-px text-xs text-ink-2" title={own.join(", ")}>
									{own[0]}
									{own.length > 1 ? ` +${own.length - 1}` : ""}
								</span>
							) : null}
						</span>
					);
				},
			},
			// Hidden: there so the filter builder can ask "Tags contains …".
			{ id: "tags", accessorFn: (o) => o.tags.map(tagLabel).join(", "), header: "Labels" },
			{
				id: "customer",
				accessorKey: "customer_name",
				header: "Klant",
				cell: (c) => (
					<span className="text-ink">{c.row.original.customer_name}</span>
				),
			},
			{
				id: "store",
				accessorFn: (o) => storeName(o.store_id),
				header: "Winkel",
				filterFn: facetFilter,
			},
			{
				id: "items",
				accessorFn: (o) => o.line_items.length,
				header: "Artikelen",
				size: 64,
				cell: (c) => (
					<span className="tabular-nums">
						{c.row.original.line_items.length}
					</span>
				),
			},
			{
				id: "total",
				accessorKey: "total",
				header: "Totaal",
				size: 104,
				cell: (c) => (
					<span className="font-medium text-ink tabular-nums">
						{formatCurrency(c.row.original.total, c.row.original.currency)}
					</span>
				),
			},
			{
				id: "cut",
				accessorFn: cut,
				header: "Status",
				size: 124,
				filterFn: facetFilter,
				cell: (c) => (
					<OrderStatusBadge
						status={
							c.row.original.tags.includes("at_risk")
								? ("delayed" as const)
								: c.row.original.status
						}
					/>
				),
			},
			{
				id: "supplier",
				accessorFn: (o) => supplierName(o.id),
				header: "Leverancier",
				filterFn: facetFilter,
			},
			{
				id: "placed",
				accessorKey: "created_at",
				header: "Geplaatst",
				size: 128,
				cell: (c) => (
					<span className="tabular-nums">
						{formatPlacedAt(c.row.original.created_at)}
					</span>
				),
			},
		],
		[],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Bestellingen"
				meta={standing}
				actions={
					<Gate perm="orders" arg={2}>
						<button
							type="button"
							onClick={() => setNewOpen(true)}
							className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
						>
							<Plus className="size-3.5" strokeWidth={2} />
							Nieuwe bestelling
						</button>
					</Gate>
				}
			/>

			<div className="min-w-0 px-5 pb-6">
				{!loading && allOrders.length === 0 ? (
					<AreaEmpty area="orders" action={{ label: "Nieuwe conceptbestelling", onClick: () => setNewOpen(true) }} />
				) : (
					<DataTable
						columns={columns}
						data={orders}
						loading={loading}
						facets={FACETS}
						actions={actions}
						initialVisibility={{ tags: false }}
						noun={["order", "orders"]}
						getRowId={(o) => o.id}
						searchPlaceholder="Bestellingen zoeken"
						initialSorting={[{ id: "placed", desc: true }]}
						onRowClick={(o) =>
							navigate({
								to: "/orders/$orderId",
								params: { orderId: o.id },
								state: OPEN_AS_MODAL,
							})
						}
						toolbarEnd={
							<button
								type="button"
								onClick={() => ask.open()}
								className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc-tint"
							>
								<Sparkles className="size-3.5" strokeWidth={1.75} />
								Vraag Insyte
							</button>
						}
						empty={
							<EmptyState
								kind="orders"
								title="Geen bestellingen voor deze filters."
								body="Pas de filters aan of wis ze."
								action={{
									label: "Nieuwe conceptbestelling",
									onClick: () => setNewOpen(true),
								}}
							/>
						}
					/>
				)}
			</div>
			<ListClosing area="orders" empty={allOrders.length === 0} />

			<TagDialog
				open={tagging !== null}
				onOpenChange={(v) => !v && setTagging(null)}
				picked={(tagging ?? []).map((o) => ({ tags: o.tags.filter((t) => !isSystemTag(t)) }))}
				known={knownTags}
				noun={["bestelling", "bestellingen"]}
				description="Labels zijn van jou, om op te sorteren en te filteren. Vertraagd en Track & trace verstuurd zet Insyte zelf en die blijven staan."
				onApply={(tags, mode) => {
					const n = tagging?.length ?? 0;
					patchMany(
						"orders",
						(tagging ?? []).map((o) => o.id),
						(o) => ({
							...o,
							tags: mode === "add" ? [...new Set([...o.tags, ...tags])] : o.tags.filter((t) => !tags.includes(t)),
							updated_at: now(),
						}),
						`${tags.length === 1 ? `“${tags[0]}”` : `${tags.length} labels`} ${mode === "add" ? "toegevoegd aan" : "verwijderd van"} ${counted(n, "bestelling", "bestellingen")}`,
					);
				}}
			/>
			<NewOrderDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				onCreate={(input) => {
					const order = createOrder(input);
					undoable(`Conceptbestelling ${order.number} aangemaakt`, () => removeOrder(order.id));
					navigate({ to: "/orders/$orderId", params: { orderId: order.id }, state: OPEN_AS_MODAL });
				}}
			/>
			<PageGuide id="orders.list" title="Bestellingen" steps={GUIDE} />
		</div>
	);
}

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

function formatPlacedAt(iso: string) {
	const d = new Date(iso);
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(d);
}
