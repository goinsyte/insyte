import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../components/table";
import { Link, getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
	ChevronRight,
	Database,
	Download,
	Grid2x2,
	Key,
	Link2,
	Loader,
	RefreshCcw,
	Store,
	Upload,
	Webhook,
	Zap,
} from "../../icons";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChipGroup } from "../common/form-dialog";
import { BrandLogo } from "../marketplace/brand-logos";
import { OrderStatusBadge } from "../orders/order-status-badge";
import {
	BandedList,
	BandedRow,
	SettingCard,
	StatusPill,
} from "../settings/setting-card";
import { DataTable } from "../table/data-table";
import { exportCsv } from "../lib/bulk";
import { formatCurrency, formatDateTime, formatRelative } from "../lib/format";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { type ImportBatch, parseCsv, useImports } from "../stores/import-store";
import { endpointState, health } from "../lib/developer";
import { useDeveloper } from "../stores/developer-store";
import { Gate } from "../access/gate";
import { useWorkspace } from "../stores/workspace-store";
import { VIEWS } from "./data-search";

const Route = getRouteApi("/_admin/data");
type View = (typeof VIEWS)[number];

const COPY: Record<View | "overview", { title: string; body: string }> = {
	overview: {
		title: "Data",
		body: "Importeren, exporteren, tabelweergave, koppelingen, synchronisatiestatus en webhooks voor alles wat Insyte bewaart.",
	},
	sheet: {
		title: "Tabel",
		body: "Elke bestelling als rij. Zoek, sorteer en filter zoals in de lijst, of wissel naar een geïmporteerd bestand.",
	},
	import: {
		title: "Importeren",
		body: "Sleep een CSV hierheen, controleer de eerste rijen en importeer. De rijen blijven in deze browser.",
	},
	export: {
		title: "Exporteren",
		body: "Kies de kolommen die je wilt en download ze als CSV.",
	},
	integrations: {
		title: "Koppelingen",
		body: "De diensten waar Insyte uit leest, en wanneer elk voor het laatst is gesynchroniseerd.",
	},
	sync: {
		title: "Synchronisatiestatus",
		body: "Wanneer elke winkel voor het laatst zijn bestellingen stuurde, en een manier om ze nu opnieuw op te halen.",
	},
	webhooks: {
		title: "Webhooks",
		body: "Waar Insyte events naartoe stuurt, en de sleutels waarmee scripts eruit lezen.",
	},
};

export function DataPage() {
	const { view } = Route.useSearch();
	const copy = COPY[view ?? "overview"];
	return (
		<div className="flex flex-col gap-6 px-5 py-4">
			<div className="flex flex-col gap-2">
				<h1 className="font-medium text-3xl text-ink leading-[1.1] tracking-[-0.8px]">
					{copy.title}
				</h1>
				<p className="font-normal text-base text-ink-2 leading-[1.55]">
					{copy.body}
				</p>
			</div>
			{view === "sheet" ? (
				<SheetView />
			) : view === "import" ? (
				<ImportView />
			) : view === "export" ? (
				<ExportView />
			) : view === "integrations" ? (
				<IntegrationsView />
			) : view === "sync" ? (
				<SyncView />
			) : view === "webhooks" ? (
				<WebhooksView />
			) : (
				<OverviewView />
			)}
		</div>
	);
}

/* ── Overview ─────────────────────────────────────────────────────────────────────────────── */

function ViewLink({
	view,
	icon: Icon,
	title,
	detail,
}: {
	view: View;
	icon: typeof Database;
	title: string;
	detail: string;
}) {
	return (
		<li>
			<Link
				to="/data"
				search={{ view }}
				className="group/item flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-ink/3"
			>
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-ink-2">
					<Icon className="size-4" strokeWidth={1.75} />
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate font-medium text-base text-ink">
						{title}
					</span>
					<span className="truncate text-sm text-ink-3">{detail}</span>
				</span>
				<ChevronRight
					className="size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5"
					strokeWidth={1.75}
				/>
			</Link>
		</li>
	);
}

function OverviewView() {
	const orders = useWorkspace((s) => s.orders);
	const stores = useWorkspace((s) => s.stores);
	const integrations = useWorkspace((s) => s.integrations);
	const batches = useImports((s) => s.batches);
	const connected = integrations.filter((i) => i.status === "connected").length;
	const imported = batches.reduce((n, b) => n + b.rows.length, 0);
	const liveStores = stores.filter((s) => s.status === "connected").length;

	return (
		<div className="flex flex-col gap-8">
			<dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
				{[
					["Bestellingen", orders.length],
					["Geïmporteerde rijen", imported],
					["Winkels die synchroniseren", `${liveStores} van ${stores.length}`],
					["Koppelingen", `${connected} van ${integrations.length}`],
				].map(([label, value]) => (
					<div key={label} className="flex flex-col gap-1">
						<dt className="text-sm text-ink-3">{label}</dt>
						<dd className="font-medium text-2xl text-ink tabular-nums">
							{typeof value === "number" ? value.toLocaleString("nl-NL") : value}
						</dd>
					</div>
				))}
			</dl>
			<SettingCard title="Beheren" icon={Database}>
				<BandedList>
					<ViewLink
						view="sheet"
						icon={Grid2x2}
						title="Tabel"
						detail={`${orders.length} bestellingen als rijen`}
					/>
					<ViewLink
						view="import"
						icon={Upload}
						title="Importeren"
						detail={
							batches.length
								? `${batches.length} ${batches.length === 1 ? "bestand" : "bestanden"} geïmporteerd deze sessie`
								: "Een CSV binnenhalen"
						}
					/>
					<ViewLink
						view="export"
						icon={Download}
						title="Exporteren"
						detail="Kolommen kiezen, CSV downloaden"
					/>
				</BandedList>
			</SettingCard>
			<SettingCard title="Verbindingen" icon={Link2}>
				<BandedList>
					<ViewLink
						view="integrations"
						icon={Link2}
						title="Koppelingen"
						detail={`${connected} gekoppeld`}
					/>
					<ViewLink
						view="sync"
						icon={Loader}
						title="Synchronisatiestatus"
						detail={`${liveStores} ${liveStores === 1 ? "winkel synchroniseert" : "winkels synchroniseren"}`}
					/>
					<ViewLink
						view="webhooks"
						icon={Zap}
						title="Webhooks"
						detail="Endpoints en API-sleutels"
					/>
				</BandedList>
			</SettingCard>
		</div>
	);
}

/* ── Sheet ─────────────────────────────────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
	placed: "Geplaatst",
	paid: "Betaald",
	at_supplier: "Bij leverancier",
	shipped: "Verzonden",
	delivered: "Bezorgd",
	refunded: "Terugbetaald",
	cancelled: "Geannuleerd",
};

const PAYMENT_LABEL: Record<Order["payment_status"], string> = {
	pending: "In afwachting",
	paid: "Betaald",
	refunded: "Terugbetaald",
	voided: "Vervallen",
};

const FULFILMENT_LABEL: Record<Order["fulfillment_status"], string> = {
	unfulfilled: "Niet afgehandeld",
	partial: "Deels afgehandeld",
	fulfilled: "Afgehandeld",
	returned: "Retour",
};

const ORDER_COLUMNS: Array<ColumnDef<Order, unknown>> = [
	{
		id: "number",
		accessorKey: "number",
		header: "Bestelling",
		size: 108,
		enableHiding: false,
		cell: (c) => (
			<span className="font-medium text-ink">{c.row.original.number}</span>
		),
	},
	{ id: "customer", accessorKey: "customer_name", header: "Klant" },
	{ id: "email", accessorKey: "customer_email", header: "E-mail" },
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
		id: "status",
		accessorKey: "status",
		header: "Status",
		size: 124,
		cell: (c) => <OrderStatusBadge status={c.row.original.status} />,
	},
	{
		id: "payment",
		accessorKey: "payment_status",
		header: "Betaling",
		size: 104,
		cell: (c) => PAYMENT_LABEL[c.row.original.payment_status],
	},
	{
		id: "fulfillment",
		accessorKey: "fulfillment_status",
		header: "Afhandeling",
		size: 112,
		cell: (c) => FULFILMENT_LABEL[c.row.original.fulfillment_status],
	},
	{
		id: "placed",
		accessorKey: "created_at",
		header: "Geplaatst",
		size: 160,
		cell: (c) => (
			<span className="tabular-nums">
				{formatDateTime(c.row.original.created_at)}
			</span>
		),
	},
];

function batchColumns(batch: ImportBatch): Array<ColumnDef<string[], unknown>> {
	return batch.header.map((h, i) => ({
		id: `c${i}`,
		accessorFn: (r: string[]) => r[i] ?? "",
		header: h || `Kolom ${i + 1}`,
	}));
}

function SheetView() {
	const orders = useWorkspace((s) => s.orders);
	const batches = useImports((s) => s.batches);
	const [source, setSource] = useState("orders");
	const batch = batches.find((b) => b.id === source);
	const columns = useMemo(() => (batch ? batchColumns(batch) : []), [batch]);

	return (
		<div className="flex min-w-0 flex-col gap-3">
			{batches.length > 0 ? (
				<SourceTabs
					value={batch ? batch.id : "orders"}
					onChange={setSource}
					options={[
						{ id: "orders", label: "Bestellingen" },
						...batches.map((b) => ({ id: b.id, label: b.fileName })),
					]}
				/>
			) : null}
			{batch ? (
				<DataTable
					key={batch.id}
					columns={columns}
					data={batch.rows}
					searchPlaceholder={`Zoeken in ${batch.fileName}`}
					noun={["imported row", "imported rows"]}
				/>
			) : (
				<DataTable
					columns={ORDER_COLUMNS}
					data={orders}
					searchPlaceholder="Zoek op bestelling, klant, e-mail"
					initialSorting={[{ id: "placed", desc: true }]}
					noun={["sheet row", "sheet rows"]}
					label={["tabelrij", "tabelrijen"]}
				/>
			)}
		</div>
	);
}

function SourceTabs({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (id: string) => void;
	options: ReadonlyArray<{ id: string; label: string }>;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{options.map((o) => (
				<button
					key={o.id}
					type="button"
					onClick={() => onChange(o.id)}
					className={cn(
						"inline-flex h-7 items-center rounded-md px-2.5 font-medium text-sm leading-none transition-colors",
						value === o.id
							? "bg-abyss text-mesh-ink"
							: "bg-paper text-ink-3 hover:bg-mist hover:text-ink",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

/* ── Import ────────────────────────────────────────────────────────────────────────────────── */

const SAMPLE_CSV = `sku,title,stock,price
NW-TEE-001,Heavyweight tee · black,142,29.00
NW-TEE-002,Heavyweight tee · bone,88,29.00
NW-HOOD-010,Loopback hoodie · navy,36,74.00
NW-CAP-004,"Six-panel cap, washed",210,24.00
NW-SOCK-003,Rib socks · 3 pack,4,18.00
`;

function PreviewTable({
	header,
	rows,
}: {
	header: string[];
	rows: string[][];
}) {
	return (
		<div className="overflow-hidden rounded-xl bg-paper">
			<Table>
				<TableHeader>
					<TableRow>
						{header.map((h, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a CSV header may repeat a name
							<TableHead key={i} className="whitespace-nowrap px-3.5">
								{h || `Kolom ${i + 1}`}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r, ri) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no id of their own
						<TableRow key={ri}>
							{header.map((_, ci) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: cells follow the header's order
								<TableCell key={ci} className="whitespace-nowrap px-3.5 tabular-nums">
									{r[ci] ?? ""}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ImportView() {
	const batches = useImports((s) => s.batches);
	const addBatch = useImports((s) => s.addBatch);
	const removeBatch = useImports((s) => s.removeBatch);
	const input = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const [pending, setPending] = useState<{
		fileName: string;
		header: string[];
		rows: string[][];
	} | null>(null);

	function read(fileName: string, text: string) {
		const parsed = parseCsv(text);
		if (parsed.header.length === 0 || parsed.rows.length === 0) {
			toast.error(`${fileName} heeft geen rijen om te importeren`);
			return;
		}
		setPending({ fileName, ...parsed });
	}

	async function take(file: File | undefined) {
		if (!file) return;
		if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
			toast.error("Hier kun je alleen CSV-bestanden importeren");
			return;
		}
		read(file.name, await file.text());
	}

	return (
		<div className="flex min-w-0 flex-col gap-6">
			{pending ? (
				<div className="flex min-w-0 flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-medium text-base text-ink">
								{pending.fileName}
							</span>
							<span className="text-sm text-ink-3 tabular-nums">
								{pending.rows.length.toLocaleString("nl-NL")} rijen ·{" "}
								{pending.header.length} kolommen · de eerste{" "}
								{Math.min(8, pending.rows.length)} getoond
							</span>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setPending(null)}
								className="flex h-8 items-center rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								Annuleren
							</button>
							<button
								type="button"
								onClick={() => {
									const batch = addBatch(pending);
									setPending(null);
									undoable(
										`${batch.rows.length.toLocaleString("nl-NL")} rijen geïmporteerd uit ${batch.fileName}`,
										() => removeBatch(batch.id),
										"Ze staan nu in Tabel.",
									);
								}}
								className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2"
							>
								<Upload className="size-3.5" strokeWidth={1.75} />
								{pending.rows.length.toLocaleString("nl-NL")} rijen importeren
							</button>
						</div>
					</div>
					<PreviewTable header={pending.header} rows={pending.rows.slice(0, 8)} />
				</div>
			) : (
				<button
					type="button"
					onClick={() => input.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setOver(true);
					}}
					onDragLeave={() => setOver(false)}
					onDrop={(e) => {
						e.preventDefault();
						setOver(false);
						void take(e.dataTransfer.files[0]);
					}}
					className={cn(
						"hatch flex flex-col items-center justify-center gap-3 rounded-xl px-10 py-16 text-center transition-colors",
						over ? "bg-arc-tint" : "bg-paper hover:bg-mist",
					)}
				>
					<span className="flex size-12 items-center justify-center rounded-xl bg-mist">
						<Upload className="size-6 text-ink-2" strokeWidth={1.75} />
					</span>
					<span className="font-medium text-base text-ink">
						Sleep een CSV hierheen of klik om er een te kiezen
					</span>
					<span className="max-w-[420px] text-base text-ink-3 leading-[1.6]">
						De eerste rij wordt gelezen als kolomnamen.
					</span>
				</button>
			)}
			<input
				ref={input}
				type="file"
				accept=".csv,text/csv"
				className="hidden"
				onChange={(e) => {
					void take(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
			{pending ? null : (
				<button
					type="button"
					onClick={() => read("inventory-sample.csv", SAMPLE_CSV)}
					className="self-start font-medium text-base text-arc-ink underline underline-offset-2"
				>
					Geen bestand bij de hand? Gebruik een voorbeeld
				</button>
			)}

			{batches.length > 0 ? (
				<SettingCard title="Geïmporteerd deze sessie" icon={Upload}>
					<BandedList>
						{batches.map((b) => (
							<BandedRow
								key={b.id}
								title={b.fileName}
								detail={`${b.rows.length.toLocaleString("nl-NL")} rijen · ${b.header.length} kolommen · ${formatRelative(b.at)}`}
								trailing={
									<>
										<Link
											to="/data"
											search={{ view: "sheet" }}
											className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
										>
											Openen in Tabel
										</Link>
										<button
											type="button"
											onClick={() => {
												const restore = removeBatch(b.id);
												if (restore) undoable(`${b.fileName} verwijderd`, restore);
											}}
											className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-signal-red-bg hover:text-signal-red"
										>
											Verwijderen
										</button>
									</>
								}
							/>
						))}
					</BandedList>
				</SettingCard>
			) : null}
		</div>
	);
}

/* ── Export ────────────────────────────────────────────────────────────────────────────────── */

type OrderColumn =
	| "number"
	| "customer"
	| "email"
	| "total"
	| "currency"
	| "status"
	| "payment"
	| "fulfillment"
	| "items"
	| "tracking"
	| "placed";

const EXPORT_COLUMNS: ReadonlyArray<{
	id: OrderColumn;
	label: string;
	read: (o: Order) => string | number;
}> = [
	{ id: "number", label: "Bestelling", read: (o) => o.number },
	{ id: "customer", label: "Klant", read: (o) => o.customer_name },
	{ id: "email", label: "E-mail", read: (o) => o.customer_email },
	{ id: "total", label: "Totaal", read: (o) => o.total },
	{ id: "currency", label: "Valuta", read: (o) => o.currency },
	{ id: "status", label: "Status", read: (o) => STATUS_LABEL[o.status] ?? o.status },
	{ id: "payment", label: "Betaling", read: (o) => PAYMENT_LABEL[o.payment_status] },
	{ id: "fulfillment", label: "Afhandeling", read: (o) => FULFILMENT_LABEL[o.fulfillment_status] },
	{ id: "items", label: "Artikelen", read: (o) => o.line_items.length },
	{ id: "tracking", label: "Track & trace", read: (o) => o.tracking_number ?? "" },
	{ id: "placed", label: "Geplaatst", read: (o) => o.created_at },
];

function ExportView() {
	const orders = useWorkspace((s) => s.orders);
	const batches = useImports((s) => s.batches);
	const [source, setSource] = useState("orders");
	const batch = batches.find((b) => b.id === source);
	const [picked, setPicked] = useState<OrderColumn[]>([
		"number",
		"customer",
		"total",
		"status",
		"placed",
	]);
	const [pickedImport, setPickedImport] = useState<Record<string, string[]>>(
		{},
	);

	// An imported file exports its own columns, all of them until some are turned off.
	const importCols = batch
		? (pickedImport[batch.id] ?? batch.header.map((_, i) => String(i)))
		: [];

	const { header, rows } = useMemo(() => {
		if (batch) {
			const idx = importCols.map(Number);
			return {
				header: idx.map((i) => batch.header[i] ?? `Kolom ${i + 1}`),
				rows: batch.rows.map((r) => idx.map((i) => r[i] ?? "")),
			};
		}
		const cols = EXPORT_COLUMNS.filter((c) => picked.includes(c.id));
		return {
			header: cols.map((c) => c.label),
			rows: orders.map((o) => cols.map((c) => c.read(o))),
		};
	}, [batch, importCols, picked, orders]);

	const toggle = <T extends string>(list: T[], id: T) =>
		list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

	return (
		<div className="flex min-w-0 flex-col gap-6">
			{batches.length > 0 ? (
				<SourceTabs
					value={batch ? batch.id : "orders"}
					onChange={setSource}
					options={[
						{ id: "orders", label: "Bestellingen" },
						...batches.map((b) => ({ id: b.id, label: b.fileName })),
					]}
				/>
			) : null}
			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm text-ink-3">Kolommen</span>
				{batch ? (
					<ChipGroup
						value={importCols}
						options={batch.header.map((h, i) => ({
							id: String(i),
							label: h || `Kolom ${i + 1}`,
						}))}
						onToggle={(id) =>
							setPickedImport((p) => ({ ...p, [batch.id]: toggle(importCols, id) }))
						}
					/>
				) : (
					<ChipGroup
						value={picked}
						options={EXPORT_COLUMNS}
						onToggle={(id) => setPicked((p) => toggle(p, id))}
					/>
				)}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<span className="text-base text-ink-2 tabular-nums">
					{rows.length.toLocaleString("nl-NL")} rijen · {header.length} kolommen
				</span>
				<Gate perm="data.export">
				<button
					type="button"
					disabled={header.length === 0 || rows.length === 0}
					onClick={() =>
						exportCsv(
							batch ? batch.fileName.replace(/\.csv$/i, "-export") : "orders-export",
							header,
							rows,
						)
					}
					className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Download className="size-3.5" strokeWidth={1.75} />
					CSV downloaden
				</button>
				</Gate>
			</div>
			{header.length > 0 ? (
				<PreviewTable
					header={header}
					rows={rows.slice(0, 5).map((r) => r.map(String))}
				/>
			) : (
				<p className="text-base text-ink-3">Kies minstens één kolom.</p>
			)}
		</div>
	);
}

/* ── Integrations ──────────────────────────────────────────────────────────────────────────── */

function IntegrationsView() {
	const integrations = useWorkspace((s) => s.integrations);
	const sync = useWorkspace((s) => s.syncIntegration);
	return (
		<SettingCard
			title={`Gekoppeld · ${integrations.filter((i) => i.status === "connected").length} van ${integrations.length}`}
			icon={Link2}
			action={<SettingsLink to="/settings/integrations">Beheren in instellingen</SettingsLink>}
		>
			<BandedList>
				{integrations.map((it) => (
					<BandedRow
						key={it.key}
						leading={<BrandLogo brand={it.key} name={it.name} size={32} />}
						title={it.name}
						detail={
							it.status === "connected" && it.syncedAt
								? `${it.description} · gesynchroniseerd ${formatRelative(it.syncedAt)}`
								: it.description
						}
						trailing={
							it.status === "connected" ? (
								<>
									<StatusPill tone="success" label="Gekoppeld" />
									<button
										type="button"
										aria-label={`${it.name} nu synchroniseren`}
										onClick={async () => {
											await sync(it.key);
											toast.success(`${it.name} gesynchroniseerd`);
										}}
										className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
									>
										<RefreshCcw className="size-3.5" />
									</button>
								</>
							) : it.status === "connecting" ? (
								<span className="flex items-center gap-1.5 text-sm text-ink-2">
									<Loader className="size-3.5 animate-spin" /> Synchroniseren…
								</span>
							) : (
								<SettingsLink to="/settings/integrations">
									{it.status === "action_required" ? "Oplossen in instellingen" : "Koppelen"}
								</SettingsLink>
							)
						}
					/>
				))}
			</BandedList>
		</SettingCard>
	);
}

function SettingsLink({
	to,
	children,
}: {
	to: "/settings/integrations" | "/settings/api-keys" | "/settings/webhooks" | "/settings/stores";
	children: React.ReactNode;
}) {
	return (
		<Link
			to={to}
			className="flex h-7 items-center gap-1 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
		>
			{children}
			<ChevronRight className="size-3" strokeWidth={1.75} />
		</Link>
	);
}

/* ── Sync status ───────────────────────────────────────────────────────────────────────────── */

function SyncView() {
	const stores = useWorkspace((s) => s.stores);
	const orders = useWorkspace((s) => s.orders);
	const syncs = useImports((s) => s.syncs);
	const syncStore = useImports((s) => s.syncStore);

	return (
		<SettingCard
			title="Winkels"
			icon={Store}
			action={<SettingsLink to="/settings/stores">Winkels beheren</SettingsLink>}
		>
			<BandedList>
				{stores.map((st) => {
					const sync = syncs[st.id];
					const count = orders.filter((o) => o.store_id === st.id).length;
					const running = sync?.progress !== undefined;
					const live = st.status === "connected";
					return (
						<BandedRow
							key={st.id}
							leading={<BrandLogo brand="shopify" name={st.name} size={32} />}
							title={st.name}
							detail={
								running ? (
									<span className="flex items-center gap-2">
										<span className="h-1 w-32 overflow-hidden rounded-full bg-ink/8">
											<span
												className="block h-full rounded-full bg-arc transition-[width] duration-150"
												style={{ width: `${sync.progress}%` }}
											/>
										</span>
										<span className="tabular-nums">
											Synchroniseren · {sync.progress}%
										</span>
									</span>
								) : !live ? (
									`${st.domain} · niet gekoppeld`
								) : sync?.syncedAt ? (
									`${st.domain} · ${sync.records ?? count} bestellingen · gesynchroniseerd ${formatRelative(sync.syncedAt)}`
								) : (
									`${st.domain} · nog niet gesynchroniseerd`
								)
							}
							trailing={
								live ? (
									<>
										<StatusPill
											tone={running ? "info" : "success"}
											label={running ? "Synchroniseren" : "Bijgewerkt"}
										/>
										<button
											type="button"
											disabled={running}
											onClick={async () => {
												await syncStore(st.id, count);
												toast.success(`${st.name} gesynchroniseerd`, {
													description: `${count} ${count === 1 ? "bestelling" : "bestellingen"} gecontroleerd`,
												});
											}}
											className="flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
										>
											<RefreshCcw
												className={cn("size-3.5", running && "animate-spin")}
											/>
											Nu synchroniseren
										</button>
									</>
								) : (
									<SettingsLink to="/settings/stores">Opnieuw koppelen</SettingsLink>
								)
							}
						/>
					);
				})}
			</BandedList>
		</SettingCard>
	);
}

/* ── Webhooks ──────────────────────────────────────────────────────────────────────────────── */

/* The endpoints Settings → Webhooks lists. They are added and changed there; this is the read. */
function WebhooksView() {
	const keys = useDeveloper((s) => s.apiKeys);
	const endpoints = useDeveloper((s) => s.webhooks);
	const deliveries = useDeveloper((s) => s.deliveries);
	const active = keys.filter((k) => k.status === "active");
	return (
		<div className="flex flex-col gap-8">
			<SettingCard
				title="Endpoints"
				icon={Webhook}
				action={<SettingsLink to="/settings/webhooks">Webhooks beheren</SettingsLink>}
			>
				<BandedList>
					{endpoints.length === 0 ? (
						<BandedRow title="Geen endpoints" detail="Voeg er een toe onder Instellingen → Webhooks, dan stuurt Insyte er events naartoe." />
					) : null}
					{endpoints.map((w) => {
						const ds = deliveries.filter((d) => d.endpointId === w.id);
						const state = endpointState(w, ds);
						const h = health(ds);
						return (
							<BandedRow
								key={w.id}
								leading={
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink/6">
										<Webhook className="size-4 text-ink-2" />
									</span>
								}
								title={w.url}
								detail={`${w.events.length} events · ${h.rate === null ? "geen leveringen in 24 uur" : `${h.rate.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}% geslaagd in 24 uur`}`}
								trailing={
									<StatusPill
										tone={state === "active" ? "success" : state === "failing" || state === "disabled" ? "danger" : state === "paused" ? "neutral" : "info"}
										label={state === "active" ? "In orde" : state === "failing" ? "Mislukt" : state === "disabled" ? "Uitgezet" : state === "paused" ? "Uit" : "Wacht op eerste event"}
									/>
								}
							/>
						);
					})}
				</BandedList>
			</SettingCard>
			<SettingCard
				title={`API-sleutels · ${active.length} actief`}
				icon={Key}
				action={<SettingsLink to="/settings/api-keys">Sleutels beheren</SettingsLink>}
			>
				<BandedList>
					{active.map((k) => (
						<BandedRow
							key={k.id}
							leading={
								<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink/6">
									<Key className="size-4 text-ink-2" />
								</span>
							}
							title={k.label}
							detail={`${k.prefix}… · ${k.last_used_at ? `gebruikt ${formatRelative(k.last_used_at)}` : "nooit gebruikt"}`}
						/>
					))}
				</BandedList>
			</SettingCard>
		</div>
	);
}
