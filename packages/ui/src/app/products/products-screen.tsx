import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useReturns } from "../stores/returns-store";
import { useAllComplaints, useQuality } from "../stores/quality-store";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, BadgePercent, Check, Copy, Download, Edit3, Plus, Sparkles, Star, Truck } from "../../icons";
import { CategoriesView } from "./categories-view";
import { LowStockPlate } from "./low-stock-plate";
import { MarginDialog } from "./margin-dialog";
import { categoryOf, marginOf, type Stock, stockOf, unitsOf } from "../lib/catalog";
import { useViews } from "../stores/views-store";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { copyLines, counted, exportCsv } from "../lib/bulk";
import { useSearchCut } from "../filters/use-search-cut";
import { useOnCreate } from "../stores/create-intent";
import { useWorkspace } from "../stores/workspace-store";
import { undoable } from "../lib/undo";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { OPEN_AS_MODAL } from "../common/detail-shell";
import { EmptyState } from "../common/empty-state";
import { DemoAreaEmpty as AreaEmpty } from "../marketing-sections/closings";
import { ListClosing } from "../marketing-sections/closings";
import { PageHeader } from "../common/page-header";
import { NewProductDialog } from "./new-product-dialog";
import { ProductThumb } from "../product/product-thumb";
import {
	DataTable,
	type Facet,
	facetFilter,
	type RowAction,
} from "../table/data-table";
import { useProducts } from "../hooks/use-operator-data";
import { formatCurrency } from "../lib/format";
import { suppliers } from "../../data-source";
import type { Product } from "../lib/types/domain";

type Row = Product & {
	stock: Stock;
	category: string;
	margin: number;
	supplierName: string;
	avgDelivery: string;
	feedback: string;
	sku: string;
};

/* A status change on picked products, with one Undo for the lot. */
function setStatus(rows: ReadonlyArray<Row>, status: Product["status"]) {
	const ws = useWorkspace.getState();
	const before = ws.productEdits;
	ws.editProducts(Object.fromEntries(rows.map((r) => [r.id, { status }])));
	const verb = status === "archived" ? "gearchiveerd" : status === "active" ? "op actief gezet" : "op concept gezet";
	undoable(`${counted(rows.length, "product", "producten")} ${verb}`, () => useWorkspace.getState().restoreProducts(before));
}

/* The selection bar's actions on products. A restock request is a ticket on the board, addressed
   to the supplier, so it is followed up like every other piece of work. */
const productActions = (openMargins: (rows: Row[]) => void): ReadonlyArray<RowAction<Row>> => [
	{
		id: "restock",
		needs: { perm: "products", arg: 2 },
		label: "Bijbestelling aanvragen",
		icon: Truck,
		group: "Leveranciers",
		shortcut: "r",
		bar: true,
		applies: (p) => p.stock !== "available",
		run: (rows) => {
			const { createTicket } = useWorkspace.getState();
			for (const p of rows)
				createTicket({
					title: `${p.title} bijbestellen bij ${p.supplierName}`,
					description: `${p.title} (${p.sku}) is ${p.stock === "out" ? "uitverkocht" : "bijna op"}. Vraag ${p.supplierName} wanneer er nieuwe voorraad komt.`,
					priority: p.stock === "out" ? "high" : "medium",
				});
			toast(`${counted(rows.length, "bijbestelling", "bijbestellingen")} opgesteld op het bord`);
		},
	},
	{
		id: "margins",
		label: "Marges herberekenen",
		icon: BadgePercent,
		group: "Prijzen",
		shortcut: "p",
		bar: true,
		run: (rows) => openMargins([...rows]),
	},
	{
		id: "active",
		needs: { perm: "products", arg: 2 },
		label: "Op actief zetten",
		icon: Check,
		group: "Status",
		applies: (p) => p.status !== "active",
		run: (rows) => setStatus(rows, "active"),
	},
	{
		id: "draft",
		needs: { perm: "products", arg: 2 },
		label: "Op concept zetten",
		icon: Edit3,
		group: "Status",
		applies: (p) => p.status !== "draft",
		run: (rows) => setStatus(rows, "draft"),
	},
	{
		id: "archive",
		needs: { perm: "products", arg: 3 },
		label: "Archiveren",
		icon: Archive,
		group: "Status",
		applies: (p) => p.status !== "archived",
		destructive: true,
		run: (rows) => setStatus(rows, "archived"),
	},
	{
		id: "copy",
		label: "SKU's kopiëren",
		icon: Copy,
		group: "Exporteren",
		shortcut: "c",
		bar: true,
		run: (rows) => copyLines(rows.map((p) => p.sku), counted(rows.length, "SKU", "SKU's")),
	},
	{
		id: "csv",
		needs: { perm: "data.export" },
		label: "Exporteren als CSV",
		icon: Download,
		group: "Exporteren",
		run: (rows) =>
			exportCsv(
				"producten",
				["Product", "SKU", "Leverancier", "Prijs", "Marge", "Voorraad"],
				rows.map((p) => [p.title, p.sku, p.supplierName, p.price, p.margin, p.stock]),
			),
	},
];

const FACETS: ReadonlyArray<Facet> = [
	{
		id: "stock",
		label: "Voorraad",
		options: [
			{ value: "available", label: "Op voorraad" },
			{ value: "low", label: "Lage voorraad" },
			{ value: "out", label: "Uitverkocht" },
		],
	},
	{
		id: "supplier",
		label: "Leverancier",
		options: suppliers.map((s) => ({ value: s.name, label: s.name })),
	},
];

export function ProductsPage() {
	const navigate = useNavigate();
	const ask = useAskInsyte();
	const { data: products, loading } = useProducts();
	const [newOpen, setNewOpen] = useState(false);
	const createProduct = useWorkspace((s) => s.createProduct);
	const removeProduct = useWorkspace((s) => s.removeProduct);
	useOnCreate("product", useCallback(() => setNewOpen(true), []));
	useSearchCut("products", "status", {
		active: { field: "status", values: ["active"] },
		draft: { field: "status", values: ["draft"] },
		archived: { field: "status", values: ["archived"] },
		attention_returns: { field: "returnHigh", values: ["ja"] },
		attention_complaints: { field: "complaints", values: ["ja"] },
		attention_checks: { field: "checkRunning", values: ["ja"] },
	});
	// Aandacht (PLAN 26): what the returns queue and the quality checks say about each product.
	const returnRecords = useReturns((s) => s.records);
	const complaints = useAllComplaints();
	const checks = useQuality((s) => s.checks);
	const orders = useWorkspace((s) => s.orders);
	const attention = useMemo(() => {
		const out = new Map<string, { returnHigh: boolean; complaints: number; checkRunning: boolean }>();
		const sold = new Map<string, number>();
		for (const o of orders) for (const l of o.line_items) sold.set(l.product_id, (sold.get(l.product_id) ?? 0) + l.quantity);
		const back = new Map<string, number>();
		for (const r of returnRecords) if (r.status !== "rejected") for (const i of r.items) back.set(i.productId, (back.get(i.productId) ?? 0) + i.qty);
		for (const p of products) {
			const rate = (sold.get(p.id) ?? 0) > 0 ? (back.get(p.id) ?? 0) / (sold.get(p.id) ?? 1) : 0;
			out.set(p.id, {
				returnHigh: rate > 0.1,
				complaints: complaints.filter((c) => c.productId === p.id && Date.parse(c.at) > Date.now() - 30 * 86_400_000).length,
				checkRunning: checks.some((c) => c.productId === p.id && (c.status === "requested" || c.status === "submitted")),
			});
		}
		return out;
	}, [orders, returnRecords, complaints, checks, products]);

	const view = useRouterState({ select: (s) => (s.location.search as { view?: string }).view });
	const setDraft = useViews((s) => s.setDraft);
	const [margining, setMargining] = useState<Row[] | null>(null);
	const actions = useMemo(() => productActions(setMargining), []);

	/* Stock, SKU, margin and category come from the product itself — its variants, its cost — so
	   the list, the product page and the low-stock advice say the same thing. */
	const rows = useMemo<Array<Row>>(
		() =>
			products.map((p, i) => {
				const supplier = suppliers.find((s) => s.id === p.supplier_id);
				return {
					...p,
					stock: stockOf(p),
					category: categoryOf(p.title),
					margin: marginOf(p.price, p.cost),
					supplierName: supplier?.name ?? "—",
					avgDelivery: `${((i % 7) + 3 + (i % 3) * 0.3).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} d`,
					feedback: (3.5 + ((i * 7) % 15) / 10).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
					sku: (p.variants[0]?.sku ?? "").replace(/-[SML]$/, "") || "—",
				};
			}),
		[products],
	);

	const standing = useMemo(() => {
		if (rows.length === 0) return undefined;
		const low = rows.filter((p) => p.stock !== "available").length;
		const avg = rows.reduce((s, p) => s + p.margin, 0) / rows.length;
		// What the stock on hand cost to buy: cost times the units across every variant.
		const value = rows.reduce((s, p) => s + (p.cost ?? 0) * unitsOf(p), 0);
		return `${rows.length} ${rows.length === 1 ? "product" : "producten"} · ${low} moeten worden bijbesteld · ${Math.round(
			avg * 100,
		)}% gemiddelde marge · ${formatCurrency(value)} op de plank`;
	}, [rows]);

	const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
		() => [
			// Hidden by default: it is there so the area panel's Active / Draft / Archived can cut by it.
			{ id: "status", accessorKey: "status", header: "Status" },
			{ id: "returnHigh", accessorFn: (p) => (attention.get(p.id)?.returnHigh ? "ja" : "nee"), header: "Retour boven 10%" },
			{ id: "complaints", accessorFn: (p) => ((attention.get(p.id)?.complaints ?? 0) > 0 ? "ja" : "nee"), header: "Open klachten" },
			{ id: "checkRunning", accessorFn: (p) => (attention.get(p.id)?.checkRunning ? "ja" : "nee"), header: "Controle loopt" },
			{
				id: "product",
				accessorFn: (p) => `${p.title} ${p.sku}`,
				header: "Product",
				size: 300,
				enableHiding: false,
				cell: (ctx) => {
					const p = ctx.row.original;
					return (
						<div className="flex items-center gap-2.5">
							<ProductThumb src={p.images[0]} title={p.title} size={32} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium text-ink">{p.title}</span>
								<span className="truncate font-medium text-2xs text-ink-3">
									{p.sku}
								</span>
							</span>
						</div>
					);
				},
			},
			{
				id: "category",
				accessorKey: "category",
				header: "Categorie",
				size: 150,
			},
			{
				id: "cogs",
				accessorKey: "cost",
				header: "Inkoop",
				size: 84,
				cell: (ctx) => (
					<span className="tabular-nums">
						{ctx.row.original.cost === undefined
							? "—"
							: formatCurrency(ctx.row.original.cost)}
					</span>
				),
			},
			{
				id: "price",
				accessorKey: "price",
				header: "Prijs",
				size: 84,
				cell: (ctx) => (
					<span className="font-medium text-ink tabular-nums">
						{formatCurrency(ctx.row.original.price)}
					</span>
				),
			},
			{
				id: "margin",
				accessorKey: "margin",
				header: "Marge",
				size: 132,
				cell: (ctx) => {
					const pct = Math.round(ctx.row.original.margin * 100);
					return (
						<span className="flex items-center gap-2">
							<span className="relative block h-1 w-14 overflow-hidden rounded-full bg-ink/10">
								<span
									className="absolute inset-y-0 left-0 rounded-full bg-arc"
									style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
								/>
							</span>
							<span className="tabular-nums">{pct}%</span>
						</span>
					);
				},
			},
			{
				id: "stock",
				accessorKey: "stock",
				header: "Voorraad",
				size: 116,
				filterFn: facetFilter,
				cell: (ctx) => <StockBadge stock={ctx.row.original.stock} />,
			},
			{
				id: "supplier",
				accessorKey: "supplierName",
				header: "Leverancier",
				filterFn: facetFilter,
			},
			{
				id: "delivery",
				accessorKey: "avgDelivery",
				header: "Gem. levertijd",
				size: 104,
				cell: (ctx) => (
					<span className="tabular-nums">{ctx.row.original.avgDelivery}</span>
				),
			},
			{
				id: "feedback",
				accessorKey: "feedback",
				header: "Beoordeling",
				size: 100,
				cell: (ctx) => (
					<span className="flex items-center gap-1.5">
						<Star
							className="size-3 fill-signal-amber text-signal-amber"
							strokeWidth={1.5}
						/>
						<span className="tabular-nums">{ctx.row.original.feedback}</span>
					</span>
				),
			},
		],
		[attention],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Producten"
				meta={standing}
				actions={
					<>
						<button
							type="button"
							onClick={() => setNewOpen(true)}
							className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
						>
							<Plus className="size-3.5" strokeWidth={2} />
							Nieuw product
						</button>
					</>
				}
			/>

			<div className="min-w-0 px-5 pb-6">
				{view === "categories" ? (
					<CategoriesView
						products={products}
						onOpen={(category) => {
							setDraft("products", {
								kind: "group",
								id: "root",
								join: "and",
								children: [{ kind: "rule", id: `cat-${category}`, field: "category", op: "any", value: [category] }],
							});
							navigate({ to: "/products" });
						}}
					/>
				) : (
					<>
				<LowStockPlate products={products} />
				{!loading && products.length === 0 ? (
					<AreaEmpty area="products" action={{ label: "Product toevoegen", onClick: () => setNewOpen(true) }} />
				) : (
					<DataTable
						columns={columns}
						data={rows}
						loading={loading}
						facets={FACETS}
						actions={actions}
						noun={["product", "products"]}
						initialVisibility={{ status: false, returnHigh: false, complaints: false, checkRunning: false }}
						getRowId={(r) => r.id}
						searchPlaceholder="Producten zoeken"
						onRowClick={(p) =>
							navigate({
								to: "/products/$productId",
								params: { productId: p.id },
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
								kind="products"
								title="Geen producten voor deze filters."
								body="Pas de filters aan of wis ze."
								action={{
									label: "Nieuw product",
									onClick: () => setNewOpen(true),
								}}
							/>
						}
					/>
				)}
					</>
				)}
			</div>
			<ListClosing area="products" empty={products.length === 0} />

			<MarginDialog open={margining !== null} onOpenChange={(v) => !v && setMargining(null)} picked={margining ?? []} />

			<NewProductDialog
				open={newOpen}
				onOpenChange={setNewOpen}
				onCreate={(input) => {
					const product = createProduct({
						title: input.title,
						price: input.price,
						cost: input.cost,
						margin: input.price > 0 ? Math.round(((input.price - input.cost) / input.price) * 100) : undefined,
						status: input.status === "active" ? "active" : "draft",
						description: input.description,
						sku: input.sku,
					});
					undoable(`${product.title} aangemaakt als ${product.status === "active" ? "actief" : "concept"}`, () => removeProduct(product.id));
				}}
			/>
		</div>
	);
}

function StockBadge({ stock }: { stock: Stock }) {
	const map = {
		available: {
			label: "Op voorraad",
			bg: "var(--signal-green-bg)",
			fg: "var(--signal-green)",
		},
		low: {
			label: "Lage voorraad",
			bg: "var(--signal-amber-bg)",
			fg: "var(--signal-amber)",
		},
		out: {
			label: "Uitverkocht",
			bg: "var(--signal-red-bg)",
			fg: "var(--signal-red)",
		},
	}[stock];
	return (
		<span
			className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
			style={{ backgroundColor: map.bg, color: map.fg }}
		>
			{map.label}
		</span>
	);
}
