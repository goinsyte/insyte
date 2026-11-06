import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, Plus } from "../../icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NewLinkDialog } from "./new-link-dialog";
import { downloadQr } from "./qr";
import { PageHeader } from "../common/page-header";
import { DataTable, type RowAction } from "../table/data-table";
import { COMMISSION } from "../../data-source";
import { formatCurrency } from "../lib/format";
import { referralLinks } from "../../data-source";
import type { ReferralLink } from "../lib/types/domain";
import { useAffiliate } from "../stores/affiliate-store";

const since = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const rate = (l: ReferralLink) => (l.clicks === 0 ? 0 : (l.conversions / l.clicks) * 100);
const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

export function copyLink(l: ReferralLink) {
	void navigator.clipboard?.writeText(`https://${l.url}`);
	toast("Link gekopieerd", { description: l.url });
}

/*
 * Every link the affiliate shares, with what it did. A new one is made here, tagged so the brand
 * sees where the click came from, and opens on its own page with the orders it brought in.
 */
export function AffiliateLinks() {
	const navigate = useNavigate();
	const made = useAffiliate((s) => s.links);
	const links = useMemo(() => [...made, ...referralLinks], [made]);
	const [open, setOpen] = useState(false);

	const totals = links.reduce((t, l) => ({ clicks: t.clicks + l.clicks, conversions: t.conversions + l.conversions, revenue: t.revenue + l.revenue }), { clicks: 0, conversions: 0, revenue: 0 });

	const columns = useMemo<Array<ColumnDef<ReferralLink, unknown>>>(
		() => [
			{
				id: "label",
				accessorKey: "label",
				header: "Link",
				cell: (c) => (
					<span className="flex min-w-0 flex-col">
						<span className="truncate font-medium text-ink">{c.row.original.label}</span>
						<span className="truncate text-ink-3 text-sm">{c.row.original.url}</span>
					</span>
				),
			},
			{ id: "clicks", accessorKey: "clicks", header: "Klikken", size: 110, cell: (c) => <span className="tabular-nums">{c.row.original.clicks.toLocaleString("nl-NL")}</span> },
			{ id: "conversions", accessorKey: "conversions", header: "Conversies", size: 120, cell: (c) => <span className="tabular-nums">{c.row.original.conversions.toLocaleString("nl-NL")}</span> },
			{ id: "rate", accessorFn: rate, header: "Ratio", size: 90, cell: (c) => <span className="text-ink-2 tabular-nums">{pct(Number(c.getValue()))}</span> },
			{ id: "revenue", accessorKey: "revenue", header: "Omzet", size: 120, cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.revenue)}</span> },
			{ id: "earned", accessorFn: (l) => l.revenue * COMMISSION, header: "Commissie", size: 120, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(Number(c.getValue()))}</span> },
			{ id: "created", accessorKey: "created_at", header: "Sinds", size: 120, cell: (c) => <span className="text-ink-3 tabular-nums">{since.format(new Date(c.row.original.created_at))}</span> },
		],
		[],
	);

	const actions = useMemo<ReadonlyArray<RowAction<ReferralLink>>>(
		() => [
			{ id: "copy", label: "Link kopiëren", icon: Copy, bar: true, shortcut: "c", applies: () => true, run: (rs) => rs[0] && copyLink(rs[0]) },
			{
				id: "qr",
				label: "QR-code downloaden",
				icon: Download,
				bar: true,
				shortcut: "q",
				applies: () => true,
				run: (rs) => {
					for (const l of rs) downloadQr(`https://${l.url}`, l.id);
					toast(rs.length === 1 ? "QR-code gedownload" : `${rs.length} QR-codes gedownload`);
				},
			},
		],
		[],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Links"
				meta={`${totals.clicks.toLocaleString("nl-NL")} klikken · ${pct(totals.clicks === 0 ? 0 : (totals.conversions / totals.clicks) * 100)} wordt een bestelling`}
				actions={
					<button
						type="button"
						onClick={() => setOpen(true)}
						className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
					>
						<Plus className="size-3.5" strokeWidth={2} />
						Nieuwe link
					</button>
				}
			/>
			<div className="flex min-w-0 flex-col px-5 pb-10">
				<DataTable
					columns={columns}
					data={links}
					actions={actions}
					selectable
					noun={["link", "links"]}
					label={["link", "links"]}
					getRowId={(l) => l.id}
					searchPlaceholder="Zoek een link"
					initialSorting={[{ id: "revenue", desc: true }]}
					onRowClick={(l) => navigate({ to: "/affiliate/referrals/$linkId", params: { linkId: l.id } })}
				/>
			</div>
			<NewLinkDialog open={open} onOpenChange={setOpen} />
		</div>
	);
}
