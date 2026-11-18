import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { PageHeader } from "../common/page-header";
import { StatusPill } from "../settings/setting-card";
import { DataTable } from "../table/data-table";
import { METHOD_LABEL, type PayoutMonthRow, useAffiliatePortal } from "./source";

type AffStatement = PayoutMonthRow;

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" });

/*
 * What the affiliate is paid, a month at a time. Nothing to request: Northwind pays every month's
 * commission on the 15th of the next, once the return window is over, to the method in settings.
 * The month still running leads; every month opens down to its orders.
 */
export function Payouts() {
	const navigate = useNavigate();
	const { money: formatCurrency, returnDays: RETURN_DAYS, usePayouts, usePayment } = useAffiliatePortal();
	const payment = usePayment();
	const page = usePayouts();
	const all = page.months;
	const current = page.current;
	const paid = page.paidLifetime;
	const approved = current?.approved ?? 0;
	const waiting = current?.waiting ?? 0;

	const columns = useMemo<Array<ColumnDef<AffStatement, unknown>>>(
		() => [
			{ id: "label", accessorKey: "label", header: "Maand", cell: (c) => <span className="font-medium text-ink">{c.row.original.label}</span> },
			{ id: "count", accessorFn: (s) => s.count, header: "Conversies", size: 120, cell: (c) => <span className="tabular-nums">{Number(c.getValue()).toLocaleString("nl-NL")}</span> },
			{ id: "gross", accessorKey: "gross", header: "Commissie", size: 130, cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.gross)}</span> },
			{ id: "reversed", accessorKey: "reversed", header: "Teruggedraaid", size: 130, cell: (c) => <span className="text-ink-2 tabular-nums">{c.row.original.reversed > 0 ? `−${formatCurrency(c.row.original.reversed)}` : "—"}</span> },
			{ id: "total", accessorKey: "total", header: "Uitbetaling", size: 130, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(c.row.original.total)}</span> },
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 210,
				cell: (c) => (
					<span className="flex items-center gap-2">
						<StatusPill tone={c.row.original.status === "paid" ? "success" : "info"} label={c.row.original.status === "paid" ? "Uitbetaald" : c.row.original.status === "approved" ? "Goedgekeurd" : "Loopt nog"} />
						<span className="text-ink-3 text-sm">{day.format(new Date(c.row.original.payDay))}</span>
					</span>
				),
			},
		],
		[formatCurrency],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader title="Uitbetalingen" meta={`Op de ${page.payoutDay}e, voor de maand ervoor`} />
			<div className="flex min-w-0 flex-col gap-8 px-5 pb-10">
				{current ? (
					<section aria-labelledby="current-title" className="grid gap-6 rounded-2xl bg-mist px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
						<div className="flex flex-col gap-1.5">
							<h2 id="current-title" className="text-ink-2 text-sm">
								{current.label} · loopt nog
							</h2>
							<p className="figure text-5xl text-ink">{formatCurrency(approved + waiting)}</p>
							<p className="text-ink-3 text-sm">
								{formatCurrency(approved)} goedgekeurd, {formatCurrency(waiting)} nog binnen de retourtermijn van {RETURN_DAYS} dagen. Uitbetaling op{" "}
								{day.format(new Date(current.payDay))} {payment.method ? `naar ${METHOD_LABEL[payment.method]}, ${payment.accountHint}.` : "zodra je betaalgegevens er zijn."}{" "}
								<Link to="/affiliate/settings/payment" className="font-medium text-arc-ink hover:underline">
									Wijzigen
								</Link>
							</p>
						</div>
						<dl className="flex gap-8 text-sm">
							<div className="flex flex-col gap-0.5">
								<dt className="text-ink-3">Uitbetaald sinds de start</dt>
								<dd className="font-medium text-base text-ink tabular-nums">{formatCurrency(paid)}</dd>
							</div>
						</dl>
					</section>
				) : null}
				<DataTable
					columns={columns}
					data={all}
					noun={["payout", "payouts"]}
					label={["uitbetaling", "uitbetalingen"]}
					getRowId={(s) => s.id}
					searchPlaceholder="Zoek een maand"
					onRowClick={(s) => navigate({ to: "/affiliate/payouts/$month", params: { month: s.id } })}
				/>
			</div>
		</div>
	);
}
