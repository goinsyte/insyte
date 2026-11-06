import { notFound, getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, Trash2 } from "../../icons";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { downloadQr, QrCode } from "./qr";
import { PageHeader } from "../common/page-header";
import { StatusPill } from "../settings/setting-card";
import { DataTable } from "../table/data-table";
import { COMMISSION, type Conversion, CONVERSION_STATUS, CONVERSIONS, weeklyFor } from "../../data-source";
import { formatCurrency } from "../lib/format";
import { referralLinks } from "../../data-source";
import { undoable } from "../lib/undo";
import { useAffiliate } from "../stores/affiliate-store";

const Route = getRouteApi("/_aff/affiliate/referrals/$linkId");
/* The list route's handle, which this screen imported from the list's route file: only its `to`
   is read, and a screen cannot import a host's route file. */
const Links = { to: "/affiliate/referrals" } as const;

const when = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

/*
 * One link: its address and QR code to share, what it did week by week, and every order that came
 * in through it. A link made in this browser can be removed; the seeded ones are the record.
 */
export function LinkDetail() {
	const { linkId } = Route.useParams();
	const navigate = Route.useNavigate();
	const made = useAffiliate((s) => s.links);
	const add = useAffiliate((s) => s.addLink);
	const remove = useAffiliate((s) => s.removeLink);
	const all = useMemo(() => [...made, ...referralLinks], [made]);
	const link = all.find((l) => l.id === linkId);
	const weeks = useMemo(() => weeklyFor(all, linkId), [all, linkId]);
	const rows = useMemo(() => CONVERSIONS.filter((c) => c.link === linkId), [linkId]);

	const columns = useMemo<Array<ColumnDef<Conversion, unknown>>>(
		() => [
			{ id: "at", accessorKey: "at", header: "Datum", size: 130, cell: (c) => <span className="text-ink-2 tabular-nums">{when.format(new Date(c.row.original.at))}</span> },
			{ id: "title", accessorKey: "title", header: "Bestelling", cell: (c) => <span className="truncate text-ink">{c.row.original.title}</span> },
			{ id: "total", accessorKey: "total", header: "Bedrag", size: 110, cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.total)}</span> },
			{ id: "commission", accessorKey: "commission", header: "Commissie", size: 120, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(c.row.original.commission)}</span> },
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 150,
				cell: (c) => <StatusPill tone={CONVERSION_STATUS[c.row.original.status].tone} label={CONVERSION_STATUS[c.row.original.status].label} />,
			},
		],
		[],
	);

	if (!link) throw notFound();
	const url = `https://${link.url}`;
	const own = made.some((l) => l.id === link.id);
	const figures = [
		{ label: "Klikken", value: link.clicks.toLocaleString("nl-NL") },
		{ label: "Conversies", value: link.conversions.toLocaleString("nl-NL") },
		{ label: "Ratio", value: `${(link.clicks === 0 ? 0 : (link.conversions / link.clicks) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%` },
		{ label: "Commissie", value: formatCurrency(link.revenue * COMMISSION) },
	];

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={link.label}
				crumbs={[{ label: "Links", to: "/affiliate/referrals" }]}
				meta={`Sinds ${when.format(new Date(link.created_at))}`}
				actions={
					<div className="flex items-center gap-1">
						{own ? (
							<button
								type="button"
								onClick={() => {
									remove(link.id);
									void navigate({ to: Links.to });
									undoable(`Link “${link.label}” verwijderd`, () => add(link));
								}}
								className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink"
							>
								<Trash2 className="size-3.5" strokeWidth={1.75} />
								Verwijderen
							</button>
						) : null}
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard?.writeText(url);
								toast("Link gekopieerd", { description: link.url });
							}}
							className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
						>
							<Copy className="size-3.5" strokeWidth={2} />
							Link kopiëren
						</button>
					</div>
				}
			/>

			<div className="grid gap-10 px-5 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_280px]">
				<div className="flex min-w-0 flex-col gap-8">
					<dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
						{figures.map((f) => (
							<div key={f.label} className="flex flex-col gap-1">
								<dt className="text-ink-3 text-sm">{f.label}</dt>
								<dd className="figure text-3xl text-ink">{f.value}</dd>
							</div>
						))}
					</dl>

					<section aria-labelledby="link-weeks" className="flex flex-col gap-2">
						<h2 id="link-weeks" className="font-medium text-ink text-lg">
							Per week
						</h2>
						<div className="h-[200px]">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
									<defs>
										<linearGradient id="link-a" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--arc)" stopOpacity={0.18} />
											<stop offset="100%" stopColor="var(--arc)" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
									<YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
									<Tooltip
										cursor={{ stroke: "var(--arc)", strokeWidth: 1, strokeDasharray: "3 3" }}
										content={({ active, payload, label }) =>
											active && payload?.[0] ? (
												<div className="panel-raised rounded-lg px-3 py-2 text-sm">
													<p className="font-medium text-ink">Week tot {String(label)}</p>
													<p className="text-ink-2 tabular-nums">
														{String(payload[0].value)} conversies · {formatCurrency((payload[0].payload as { earned: number }).earned)}
													</p>
												</div>
											) : null
										}
									/>
									<Area dataKey="conversions" stroke="var(--arc)" strokeWidth={2} fill="url(#link-a)" dot={false} activeDot={{ r: 4 }} />
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</section>

					<section aria-labelledby="link-orders" className="flex min-w-0 flex-col gap-2">
						<h2 id="link-orders" className="font-medium text-ink text-lg">
							Bestellingen via deze link
						</h2>
						<DataTable
							columns={columns}
							data={rows}
							noun={["conversion", "conversions"]}
							label={["conversie", "conversies"]}
							getRowId={(c) => c.id}
							searchPlaceholder="Zoek een bestelling"
							pageSize={10}
							empty={<p className="py-10 text-center text-ink-3 text-sm">Nog geen bestellingen. Deel de link en de eerste verschijnt hier.</p>}
						/>
					</section>
				</div>

				<aside className="flex flex-col gap-3">
					<h2 className="font-medium text-ink-3 text-sm">Delen</h2>
					<QrCode text={url} size={200} className="rounded-xl" />
					<p className="break-all text-ink-2 text-sm">{url}</p>
					<button
						type="button"
						onClick={() => {
							downloadQr(url, link.id);
							toast("QR-code gedownload");
						}}
						className="flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-arc-ink text-sm hover:bg-arc-tint"
					>
						<Download className="size-3.5" strokeWidth={1.75} />
						QR-code downloaden
					</button>
				</aside>
			</div>
		</div>
	);
}
