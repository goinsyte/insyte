import { Switch } from "../../components/switch";
import { useForwarding } from "../stores/forwarding-store";
import { useGate } from "../stores/access-store";
import { SOLD90, THRESHOLD, useAllComplaints, useQuality } from "../stores/quality-store";
import { pct } from "../lib/returns";
import { VIA_LABEL } from "../lib/forwarding";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { Mail, MessagesSquare, Pause, Play, Send, Truck } from "../../icons";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { PageHeader } from "../common/page-header";
import { StatusPill } from "../settings/setting-card";
import { invitePortal, PORTAL_LABEL, PortalInviteDialog, PortalSection } from "./portal-invite";
import { DataTable, type RowAction } from "../table/data-table";
import { useProducts } from "../hooks/use-operator-data";
import { counted } from "../lib/bulk";
import { type Stock, type SupplierStats, stockOf, supplierStats, unitsOf } from "../lib/catalog";
import { suppliers } from "../../data-source";
import type { PortalStatus } from "../lib/team";
import type { Product, Supplier } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { DemoAreaEmpty as AreaEmpty } from "../marketing-sections/closings";
import { ListClosing } from "../marketing-sections/closings";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * Suppliers, scored. Each row is computed from the orders that carry the supplier's products: how
 * many are open, how many are past their hand-off date, and the share shipped on time — measured on
 * a bar, with the figure beside it. The stock feed and API columns say how much of their stock the
 * console can actually see. A supplier opens as a modal with their products and late orders, and
 * the three things an operator does about a supplier: message them, ask for a restock of what is
 * running low, and pause new orders while something is sorted out.
 */

type Row = SupplierStats & { id: string; name: string; paused: boolean; portal: PortalStatus };

const FEED: Record<string, string> = { live: "Live", in_stock_out_of_stock: "Alleen op voorraad of niet", none: "Geen" };

const SUPPLIER_CHAT: Record<string, string> = { sup_allure: "conv_supplier_allure", sup_dpc: "conv_supplier_dpc" };

function pauseOrResume(rows: ReadonlyArray<Row>) {
	const ws = useWorkspace.getState();
	const before = ws.pausedSuppliers;
	for (const r of rows) ws.toggleSupplierPause(r.id);
	undoable(
		rows.length === 1 ? `${rows[0]?.name} ${rows[0]?.paused ? "hervat" : "gepauzeerd voor nieuwe bestellingen"}` : `${counted(rows.length, "leverancier", "leveranciers")} omgezet`,
		() => useWorkspace.setState({ pausedSuppliers: before }),
	);
}

const ACTIONS: ReadonlyArray<RowAction<Row>> = [
	{
		id: "portal",
		label: "Uitnodigen voor het portaal",
		icon: Send,
		group: "Portaal",
		shortcut: "u",
		bar: true,
		applies: (r) => r.portal !== "active",
		run: (rows) => invitePortal(rows.map((r) => r.supplier)),
	},
	{
		id: "pause",
		label: "Nieuwe bestellingen pauzeren of hervatten",
		icon: Pause,
		group: "Bestellingen",
		shortcut: "p",
		bar: true,
		run: (rows) => pauseOrResume(rows),
	},
	{
		id: "email",
		label: "E-mailen",
		icon: Mail,
		group: "Contact",
		shortcut: "m",
		bar: true,
		run: (rows) => {
			window.location.href = `mailto:?bcc=${encodeURIComponent(rows.map((r) => r.supplier.contact_email).join(","))}`;
		},
	},
];

export function SuppliersPage() {
	const { data: products } = useProducts();
	const orders = useWorkspace((s) => s.orders);
	const paused = useWorkspace((s) => s.pausedSuppliers);
	const portal = useTeam((s) => s.portal);
	const [openId, setOpenId] = useState<string | null>(null);
	const [inviting, setInviting] = useState<Supplier | null>(null);

	const rows = useMemo<Row[]>(
		() =>
			supplierStats(suppliers, products, orders).map((st) => ({
				...st,
				id: st.supplier.id,
				name: st.supplier.name,
				paused: paused.includes(st.supplier.id),
				portal: portal[st.supplier.id]?.status ?? "none",
			})),
		[products, orders, paused, portal],
	);
	const late = rows.reduce((n, r) => n + r.delayed, 0);
	// Complaint rate and checks passed per supplier (PLAN 26), over its products' last 90 days.
	const checks = useQuality((st) => st.checks);
	const complaints = useAllComplaints();
	const quality = useMemo(() => {
		const out = new Map<string, { rate: number; complaints: number; sold: number; passed: number; judged: number }>();
		for (const sup of suppliers) {
			const mine = products.filter((p) => p.supplier_id === sup.id).map((p) => p.id);
			const sold = mine.reduce((n, id) => n + (SOLD90[id] ?? 0), 0);
			const n = complaints.filter((c) => mine.includes(c.productId)).length;
			const judged = checks.filter((c) => c.supplierId === sup.id && (c.status === "approved" || c.status === "rejected"));
			out.set(sup.id, { rate: sold > 0 ? n / sold : 0, complaints: n, sold, passed: judged.filter((c) => c.status === "approved").length, judged: judged.length });
		}
		return out;
	}, [checks, complaints, products]);
	const live = rows.filter((r) => r.supplier.stock_indicator === "live").length;

	const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
		() => [
			{
				id: "supplier",
				accessorKey: "name",
				header: "Leverancier",
				size: 260,
				enableHiding: false,
				cell: (c) => {
					const r = c.row.original;
					return (
						<span className="flex items-center gap-2.5">
							<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-mist font-medium text-ink-2 text-xs">
								{r.name.slice(0, 1)}
							</span>
							<span className="truncate font-medium text-ink">{r.name}</span>
							{r.paused ? <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px font-medium text-signal-amber text-xs">Gepauzeerd</span> : null}
						</span>
					);
				},
			},
			{ id: "products", accessorKey: "products", header: "Producten", size: 90, cell: (c) => <span className="tabular-nums">{c.row.original.products}</span> },
			{ id: "open", accessorKey: "open", header: "Open bestellingen", size: 110, cell: (c) => <span className="tabular-nums">{c.row.original.open}</span> },
			{
				id: "delayed",
				accessorKey: "delayed",
				header: "Vertraagd",
				size: 90,
				cell: (c) => (
					<span className={cn("tabular-nums", c.row.original.delayed > 0 ? "font-medium text-signal-red" : "text-ink-3")}>{c.row.original.delayed}</span>
				),
			},
			{
				id: "ontime",
				accessorFn: (r) => (r.onTime === null ? -1 : r.onTime),
				header: "Op tijd",
				size: 150,
				cell: (c) => {
					const v = c.row.original.onTime;
					if (v === null) return <span className="text-ink-3">Niets verzonden</span>;
					return (
						<span className="flex items-center gap-2">
							<span className="relative block h-1 w-16 overflow-hidden rounded-full bg-ink/10">
								<span className={cn("absolute inset-y-0 left-0 rounded-full", v < 0.8 ? "bg-signal-amber" : "bg-arc")} style={{ width: `${v * 100}%` }} />
							</span>
							<span className="tabular-nums">{Math.round(v * 100)}%</span>
						</span>
					);
				},
			},
			{
				id: "complaints",
				accessorFn: (r) => quality.get(r.id)?.rate ?? 0,
				header: "Klachten",
				size: 96,
				cell: (c) => {
					const q = quality.get(c.row.original.id);
					return q && q.sold > 0 ? <span className={q.rate > THRESHOLD ? "font-medium text-signal-amber tabular-nums" : "tabular-nums"} title={`${q.complaints} klachten op ${q.sold} verkocht in 90 dagen`}>{pct(q.rate)}</span> : <span className="text-ink-3">—</span>;
				},
			},
			{
				id: "checks",
				accessorFn: (r) => quality.get(r.id)?.passed ?? 0,
				header: "Controles",
				size: 96,
				cell: (c) => {
					const q = quality.get(c.row.original.id);
					return q && q.judged > 0 ? <span className="tabular-nums" title="Goedgekeurd van beoordeeld">{q.passed} van {q.judged}</span> : <span className="text-ink-3">—</span>;
				},
			},
			{ id: "feed", accessorFn: (r) => FEED[r.supplier.stock_indicator], header: "Voorraadfeed", size: 120 },
			{ id: "api", accessorFn: (r) => (r.supplier.api_connected ? "Gekoppeld" : "Niet gekoppeld"), header: "API", size: 120 },
			{
				id: "portal",
				accessorFn: (r) => PORTAL_LABEL[r.portal].label,
				header: "Portaal",
				size: 140,
				cell: (c) => <StatusPill tone={PORTAL_LABEL[c.row.original.portal].tone} label={PORTAL_LABEL[c.row.original.portal].label} />,
			},
		],
		[quality],
	);

	const open = rows.find((r) => r.id === openId) ?? null;

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Leveranciers"
				meta={`${rows.length} ${rows.length === 1 ? "leverancier" : "leveranciers"} · ${late === 0 ? "geen vertraging" : `${late} ${late === 1 ? "vertraagde bestelling" : "vertraagde bestellingen"}`} · ${live} met live voorraad · ${rows.filter((r) => r.portal === "active").length} in het portaal`}
			/>
			<div className="min-w-0 px-5 pb-6">
				{rows.length === 0 ? (
					<AreaEmpty area="suppliers" />
				) : (
					<DataTable
						columns={columns}
						data={rows}
						actions={ACTIONS}
						noun={["supplier", "suppliers"]}
						getRowId={(r) => r.id}
						searchPlaceholder="Leveranciers zoeken"
						initialSorting={[{ id: "delayed", desc: true }]}
						onRowClick={(r) => setOpenId(r.id)}
					/>
				)}
			</div>
			<ListClosing
				area="suppliers"
				empty={rows.length === 0}
				onInvite={() => {
					const next = rows.find((r) => r.portal !== "active");
					if (next) setInviting(next.supplier);
				}}
			/>
			<SupplierDialog row={open} products={products} onClose={() => setOpenId(null)} onInvite={(s) => setInviting(s)} />
			<PortalInviteDialog supplier={inviting} onClose={() => setInviting(null)} />
		</div>
	);
}

const STOCK_TONE: Record<Stock, string> = {
	available: "text-ink-3",
	low: "font-medium text-signal-amber",
	out: "font-medium text-signal-red",
};

function SupplierDialog({ row, products, onClose, onInvite }: { row: Row | null; products: ReadonlyArray<Product>; onClose: () => void; onInvite: (s: Supplier) => void }) {
	const orders = useWorkspace((s) => s.orders);
	const navigate = useNavigate();
	const theirs = useMemo(() => products.filter((p) => p.supplier_id === row?.id), [products, row?.id]);
	const late = useMemo(
		() =>
			orders.filter(
				(o) => row !== null && o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded" && o.line_items.some((li) => li.supplier_id === row.id),
			),
		[orders, row],
	);
	const low = theirs.filter((p) => stockOf(p) !== "available");

	return (
		<Dialog open={row !== null} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[620px]">
				{row ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-3">
								<span className="flex size-10 items-center justify-center rounded-lg bg-mist font-medium text-ink-2 text-md">{row.name.slice(0, 1)}</span>
								<div className="flex flex-col gap-0.5">
									<DialogTitle className="flex items-center gap-2">
										{row.name}
										{row.paused ? <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px font-medium text-signal-amber text-xs">Gepauzeerd</span> : null}
									</DialogTitle>
									<DialogDescription>
										{row.supplier.contact_email}
										{row.supplier.contact_phone ? ` · ${row.supplier.contact_phone}` : ""}
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>

						<dl className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-mist">
							{[
								["Op tijd", row.onTime === null ? "—" : `${Math.round(row.onTime * 100)}%`],
								["Open bestellingen", String(row.open)],
								["Vertraagd", String(row.delayed)],
								["Voorraadfeed", FEED[row.supplier.stock_indicator] ?? "Geen"],
							].map(([k, v]) => (
								<div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
									<dt className="text-xs text-ink-3">{k}</dt>
									<dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
								</div>
							))}
						</dl>

						<section className="flex flex-col gap-1">
							<h3 className="font-medium text-ink-3 text-xs">Hun producten · {theirs.length}</h3>
							<ul className="flex max-h-44 flex-col overflow-y-auto">
								{theirs.map((p, i) => {
									const st = stockOf(p);
									return (
										<li key={p.id}>
											<Link
												to="/products/$productId"
												params={{ productId: p.id }}
												onClick={onClose}
												className={cn("flex h-9 items-center gap-3 rounded-md px-2.5 text-base transition-colors hover:bg-ink/6", i % 2 === 0 && "bg-mist")}
											>
												<span className="min-w-0 flex-1 truncate text-ink">{p.title}</span>
												<span className="text-sm text-ink-3 tabular-nums">{unitsOf(p)} stuks</span>
												<span className={cn("w-20 text-right text-sm", STOCK_TONE[st])}>{st === "out" ? "Uitverkocht" : st === "low" ? "Laag" : "Op voorraad"}</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</section>

						{late.length > 0 ? (
							<section className="flex flex-col gap-1">
								<h3 className="font-medium text-ink-3 text-xs">Vertraagde bestellingen · {late.length}</h3>
								<div className="flex flex-wrap gap-1">
									{late.slice(0, 8).map((o) => (
										<Link
											key={o.id}
											to="/orders/$orderId"
											params={{ orderId: o.id }}
											onClick={onClose}
											className="rounded-sm bg-signal-red-bg px-1.5 py-0.5 font-medium text-signal-red text-xs tabular-nums hover:opacity-85"
										>
											{o.number}
										</Link>
									))}
								</div>
							</section>
						) : null}

						<ForwardPrefsSection supplierId={row.id} name={row.name} />

						<PortalSection supplier={row.supplier} onInvite={() => onInvite(row.supplier)} onClose={onClose} />

						<DialogFooter className="sm:justify-between">
							<button
								type="button"
								onClick={() => pauseOrResume([row])}
								className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								{row.paused ? <Play className="size-3.5" strokeWidth={1.75} /> : <Pause className="size-3.5" strokeWidth={1.75} />}
								{row.paused ? "Nieuwe bestellingen hervatten" : "Nieuwe bestellingen pauzeren"}
							</button>
							<div className="flex gap-2">
								<button
									type="button"
									disabled={low.length === 0}
									onClick={() => {
										const ws = useWorkspace.getState();
										const made = low.map((p) =>
											ws.createTicket({
												title: `${p.title} bijbestellen bij ${row.name}`,
												description: `Van ${p.title} zijn nog ${unitsOf(p)} stuks over. Vraag ${row.name} wanneer er nieuwe voorraad komt.`,
												priority: unitsOf(p) === 0 ? "high" : "medium",
												status: "awaiting_reply",
												tags: ["Leverancier"],
											}),
										);
										undoable(`${counted(made.length, "bijbestelling", "bijbestellingen")} gestuurd naar ${row.name}`, () =>
											useWorkspace.setState((s) => ({ tickets: s.tickets.filter((t) => !made.some((m) => m.id === t.id)) })),
										);
									}}
									className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4"
								>
									<Truck className="size-3.5" strokeWidth={1.75} />
									{low.length === 0 ? "Niets bij te bestellen" : `${low.length} bijbestellen`}
								</button>
								<button
									type="button"
									onClick={() => {
										onClose();
										const chat = SUPPLIER_CHAT[row.id];
										if (chat) void navigate({ to: "/chats", search: { id: chat } as never });
										else window.location.href = `mailto:${row.supplier.contact_email}`;
									}}
									className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
								>
									{SUPPLIER_CHAT[row.id] ? <MessagesSquare className="size-3.5" strokeWidth={1.75} /> : <Mail className="size-3.5" strokeWidth={1.75} />}
									Bericht aan {row.name.split(" ")[0]}
								</button>
							</div>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/**
 * Doorsturen (PLAN 24): how this supplier takes its orders — its portal, an e-mail or its API — and
 * whether a paid order goes to it at once. Each change applies with Undo.
 */
function ForwardPrefsSection({ supplierId, name }: { supplierId: string; name: string }) {
	const pref = useForwarding((s) => s.prefs[supplierId]) ?? { via: "portal" as const, auto: false };
	const gate = useGate("suppliers", 2);
	const set = (patch: Partial<typeof pref>, said: string) => {
		const before = pref;
		useForwarding.getState().setPref(supplierId, patch);
		undoable(said, () => useForwarding.getState().setPref(supplierId, before));
	};
	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-medium text-ink-3 text-xs">Doorsturen</h3>
			<div className="flex flex-wrap items-center gap-2">
				<span role="radiogroup" aria-label={`Hoe bestellingen naar ${name} gaan`} className="inline-flex h-8 items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
					{(["portal", "email", "api"] as const).map((v) => (
						<button
							key={v}
							type="button"
							role="radio"
							aria-checked={pref.via === v}
							disabled={!gate.ok}
							title={gate.ok ? undefined : gate.reason}
							onClick={() => set({ via: v }, `${name} krijgt bestellingen via ${VIA_LABEL[v].toLowerCase()}`)}
							className={cn("h-7 rounded-[5px] px-2.5 font-medium text-sm transition-colors disabled:cursor-not-allowed", pref.via === v ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 enabled:hover:text-ink")}
						>
							{VIA_LABEL[v]}
						</button>
					))}
				</span>
				<label className="flex items-center gap-2 text-ink-2 text-sm">
					<Switch checked={pref.auto} disabled={!gate.ok} onCheckedChange={(auto) => set({ auto }, auto ? `Betaalde bestellingen gaan meteen naar ${name}` : `Bestellingen voor ${name} wachten weer op doorsturen`)} aria-label="Betaalde bestellingen meteen doorsturen" />
					Betaalde bestellingen meteen doorsturen
				</label>
			</div>
		</section>
	);
}
