import { notFound, useParams } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "../../icons";
import { useMemo } from "react";
import { toast } from "sonner";
import { PageHeader } from "../common/page-header";
import { StatusPill } from "../settings/setting-card";
import { DataTable } from "../table/data-table";
import { cn } from "../lib/utils";
import { CONVERSION_STATUS, METHOD_LABEL, type PayoutMonthView, type PortalConversion, type ProfileView, useAffiliatePortal } from "./source";

type Conversion = PortalConversion;

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" });
const long = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One month: every order that came in through the affiliate's links, and the statement for it. */
export function PayoutMonth() {
	const { month } = useParams({ strict: false }) as { month: string };
	const { brand, money: formatCurrency, usePayout, useProfile } = useAffiliatePortal();
	const view = usePayout(month);
	const profile = useProfile();
	const columns = useMemo<Array<ColumnDef<Conversion, unknown>>>(
		() => [
			{ id: "order", accessorKey: "order", header: "Bestelling", size: 120, cell: (c) => <span className="font-medium text-ink tabular-nums">{c.row.original.order}</span> },
			{ id: "at", accessorKey: "at", header: "Dag", size: 90, cell: (c) => <span className="tabular-nums">{day.format(new Date(c.row.original.at))}</span> },
			{ id: "title", accessorKey: "title", header: "Artikel", cell: (c) => <span className="truncate">{c.row.original.title}</span> },
			{ id: "link", accessorFn: (c) => c.via ?? "Kortingscode", header: "Via", size: 200, cell: (c) => <span className="truncate text-ink-2">{String(c.getValue())}</span> },
			{ id: "total", accessorKey: "total", header: "Bedrag", size: 100, cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.total)}</span> },
			{
				id: "commission",
				accessorKey: "commission",
				header: "Commissie",
				size: 110,
				cell: (c) => (
					<span className={cn("font-medium tabular-nums", c.row.original.status === "reversed" ? "text-ink-3 line-through" : "text-ink")}>{formatCurrency(c.row.original.commission)}</span>
				),
			},
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 150,
				cell: (c) => <StatusPill tone={CONVERSION_STATUS[c.row.original.status].tone} label={CONVERSION_STATUS[c.row.original.status].label} />,
			},
		],
		[formatCurrency],
	);

	if (!view) throw notFound();
	const s = { ...view.row, rows: view.rows };
	const method = view.method;

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={s.label}
				crumbs={[{ label: "Uitbetalingen", to: "/affiliate/payouts" }]}
				meta={<StatusPill tone={s.status === "paid" ? "success" : "info"} label={s.status === "paid" ? "Uitbetaald" : s.status === "approved" ? "Goedgekeurd" : "Loopt nog"} />}
				actions={
					<button
						type="button"
						onClick={() => {
							downloadStatement(view, profile, brand, formatCurrency);
							toast("Overzicht gedownload");
						}}
						className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
					>
						<Download className="size-3.5" strokeWidth={1.75} />
						Overzicht downloaden
					</button>
				}
			/>
			<div className="flex min-w-0 flex-col gap-6 px-5 pb-10">
				<dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
					{[
						["Commissie", formatCurrency(s.gross)],
						["Teruggedraaid", s.reversed > 0 ? `−${formatCurrency(s.reversed)}` : formatCurrency(0)],
						["Uitbetaling", formatCurrency(s.total)],
						[s.status === "paid" ? `Betaald op` : "Betaling op", long.format(new Date(s.payDay))],
					].map(([k, v]) => (
						<div key={k} className="flex flex-col gap-1">
							<dt className="text-ink-3 text-sm">{k}</dt>
							<dd className="figure text-3xl text-ink">{v}</dd>
						</div>
					))}
				</dl>
				<p className="text-ink-3 text-sm">
					{s.rows.length.toLocaleString("nl-NL")} bestellingen via je links · {s.status === "paid" ? "betaald" : "wordt betaald"} via {method ? METHOD_LABEL[method] : "de betaalmethode in je instellingen"}
				</p>
				<DataTable
					columns={columns}
					data={s.rows}
					noun={["conversion", "conversions"]}
					label={["conversie", "conversies"]}
					getRowId={(c) => c.id}
					searchPlaceholder="Zoek een bestelling of artikel"
					pageSize={25}
				/>
			</div>
		</div>
	);
}

/** The month as a file the affiliate keeps for its books: from the brand, with every order. */
function downloadStatement(v: PayoutMonthView, who: ProfileView, brand: string, usd: (n: number) => string) {
	const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
	const s = v.row;
	const rows = v.rows
		.map((c) => `<tr><td>${esc(c.order)}</td><td>${day.format(new Date(c.at))}</td><td>${esc(c.title)}</td><td>${usd(c.total)}</td><td>${c.status === "reversed" ? `−${usd(c.commission)}` : usd(c.commission)}</td></tr>`)
		.join("");
	const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Uitbetalingsoverzicht ${esc(s.label)}</title><style>body{font:13px/1.5 system-ui,sans-serif;margin:40px;color:#111}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}td:nth-child(n+4),th:nth-child(n+4){text-align:right}h1{font-size:20px;margin:0}.tot{font-size:16px;font-weight:600;text-align:right;margin-top:16px}</style></head><body><h1>Uitbetalingsoverzicht · ${esc(s.label)}</h1><p>Van ${esc(brand)} aan ${esc(who.name)} (${esc(who.code)})<br>${s.status === "paid" ? "Betaald" : "Te betalen"} op ${long.format(new Date(s.payDay))}${v.method ? ` via ${esc(METHOD_LABEL[v.method])}` : ""}${v.taxId ? `<br>Btw-nummer ${esc(v.taxId)}` : ""}</p><table><thead><tr><th>Bestelling</th><th>Dag</th><th>Artikel</th><th>Bedrag</th><th>Commissie</th></tr></thead><tbody>${rows}</tbody></table><p class="tot">Commissie ${usd(s.gross)} · teruggedraaid ${usd(s.reversed)} · uitbetaling ${usd(s.total)}</p></body></html>`;
	const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = `uitbetaling-${s.id}.html`;
	a.click();
	URL.revokeObjectURL(url);
}
