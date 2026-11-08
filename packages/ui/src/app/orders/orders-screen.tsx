import { useRouterState } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Sparkles } from "../../icons";
import type { ReactElement } from "react";
import { TagDialog } from "../common/tag-dialog";
import { isSystemTag, tagLabel } from "../lib/order-tags";
import { useCallback, useMemo, useState } from "react";
import { useSearchCut } from "../filters/use-search-cut";
import { useOnCreate } from "../stores/create-intent";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { EmptyState } from "../common/empty-state";
import { AreaEmpty } from "../common/area-empty";
import { PageHeader } from "../common/page-header";
import { PageGuide } from "../common/page-guide";
import { OrderStatusBadge } from "./order-status-badge";
import { DataTable, type Facet, facetFilter } from "../table/data-table";
import { Blocked } from "../access/blocked";
import { formatCurrency } from "../lib/format";
import { isForwardView } from "../lib/forwarding";
import type { Order } from "../lib/types/domain";
import { type TeamGate, useOrdersSource } from "./source";
import { ZONE } from "../lib/format";

/*
 * The screen used to open with four stacked rows before a single order: a title, a sentence of
 * explanation, a monumental figure, and a context sentence under that — then a tab strip, then a
 * second heading reading "All orders" over a table of orders. Six rows of chrome for a list.
 *
 * What survived is the one line an operator opens Orders for, beside the heading, and the cuts the
 * tab strip was making — now facets, which compose instead of taking turns.
 *
 * Store-free: the orders, what they may become, and the parts that make and forward them come from the host
 * (`source.tsx`; the design app's `demo-source.tsx`, the console's over `Orders.list`).
 */

/** A control the role may not use: disabled, with what is missing, as `Gate` draws it from the host's answer. */
function GateBy({ gate, children }: { gate: TeamGate; children: ReactElement }) {
	return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>;
}

/* The facet's values are the order's real status, so its counts ARE the data rather than a second
   definition of it kept in agreement by hand. `delayed` is the one derived value: an order at risk
   is not a state the store sends, it is a judgement this product makes. */
function cut(o: Order): string {
	return o.tags.includes("at_risk") ? "delayed" : o.status;
}

export const isClosed = (o: Order) => o.status === "cancelled" || o.status === "refunded";

const GUIDE = [
	{ title: "Al je bestellingen", body: "Bestellingen komen binnen een minuut na een winkelsynchronisatie binnen, met artikelen, klant en leverancier al gekoppeld.", art: "parcel" },
	{ title: "Labels", body: "Labels zijn van jou, om op te sorteren en te filteren. Vertraagd en Track & trace verstuurd zet Insyte zelf.", art: "rules" },
] as const;

/** The list's facets: Status from the orders themselves, Winkel and Leverancier from the host. */
const facetsOf = (
	stores: ReadonlyArray<{ value: string; label: string }>,
	suppliers: ReadonlyArray<{ value: string; label: string }>,
): ReadonlyArray<Facet> => [
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
		options: stores,
	},
	{
		id: "supplier",
		label: "Leverancier",
		options: suppliers,
	},
];

export function OrdersList() {
	const view = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>).view });
	const { Forwarding } = useOrdersSource();
	return isForwardView(view) && Forwarding ? <Forwarding key={view} view={view} /> : <AllOrders />;
}

function AllOrders() {
	const ask = useAskInsyte();
	const source = useOrdersSource();
	const { orders: allOrders, loading, storeName, supplierName, NewOrder, Closing } = source;
	// The host hands over the orders the role may see: a role limited to some stores sees only theirs.
	const orders = allOrders as Order[];
	const [newOpen, setNewOpen] = useState(false);
	const [tagging, setTagging] = useState<Order[] | null>(null);
	const actions = useMemo(() => source.actions(setTagging), [source.actions]);
	const facets = useMemo(() => facetsOf(source.stores, source.suppliers), [source.stores, source.suppliers]);
	// Making a draft order, where the host can: the empty states offer it then.
	const create = NewOrder === undefined ? undefined : { label: "Nieuwe conceptbestelling", onClick: () => setNewOpen(true) };
	// Counted from the orders on screen, so the line beside the title is always true.
	const standing = useMemo(() => {
		const open = orders.filter((o) => ["placed", "paid", "at_supplier"].includes(o.status)).length;
		const transit = orders.filter((o) => o.status === "shipped").length;
		const delayed = orders.filter((o) => o.tags.includes("at_risk") && !isClosed(o)).length;
		return `${open} wachten op afhandeling · ${transit} onderweg · ${delayed} vertraagd`;
	}, [orders]);
	const knownTags = useMemo(() => [...new Set(orders.flatMap((o) => o.tags).filter((t) => !isSystemTag(t)))], [orders]);
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
				accessorFn: (o) => o.line_count ?? o.line_items.length,
				header: "Artikelen",
				size: 64,
				cell: (c) => (
					<span className="tabular-nums">
						{c.row.original.line_count ?? c.row.original.line_items.length}
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
		[storeName, supplierName],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Bestellingen"
				meta={standing}
				actions={
					<GateBy gate={source.canCreate}>
						<button
							type="button"
							onClick={() => setNewOpen(true)}
							className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
						>
							<Plus className="size-3.5" strokeWidth={2} />
							Nieuwe bestelling
						</button>
					</GateBy>
				}
			/>

			<div className="min-w-0 px-5 pb-6">
				{!loading && allOrders.length === 0 ? (
					<AreaEmpty area="orders" action={create} starts={source.starts} />
				) : (
					<DataTable
						columns={columns}
						data={orders}
						loading={loading}
						facets={facets}
						actions={actions}
						initialVisibility={{ tags: false }}
						noun={["order", "orders"]}
						getRowId={(o) => o.id}
						searchPlaceholder="Bestellingen zoeken"
						initialSorting={[{ id: "placed", desc: true }]}
						onRowClick={source.open}
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
								action={create}
							/>
						}
					/>
				)}
			</div>
			{Closing ? <Closing empty={allOrders.length === 0} /> : null}

			<TagDialog
				open={tagging !== null}
				onOpenChange={(v) => !v && setTagging(null)}
				picked={(tagging ?? []).map((o) => ({ tags: o.tags.filter((t) => !isSystemTag(t)) }))}
				known={knownTags}
				noun={["bestelling", "bestellingen"]}
				description="Labels zijn van jou, om op te sorteren en te filteren. Vertraagd en Track & trace verstuurd zet Insyte zelf en die blijven staan."
				onApply={(tags, mode) => source.applyTags?.(tagging ?? [], tags, mode)}
			/>
			{NewOrder ? <NewOrder open={newOpen} onOpenChange={setNewOpen} /> : null}
			<PageGuide id="orders.list" title="Bestellingen" steps={GUIDE} />
		</div>
	);
}

function formatPlacedAt(iso: string) {
	const d = new Date(iso);
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: ZONE
	}).format(d);
}
