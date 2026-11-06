import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { useOnCreate } from "../stores/create-intent";
import type { Order } from "../lib/types/domain";
import { OrderPickDialog, StartReturnDialog } from "./order-returns";
import { Check, Download, ExternalLink, Send, Settings, User, XCircle } from "../../icons";
import { Gate } from "../access/gate";
import { useMyName, useNow } from "../ask/agent-parts";
import { OPEN_AS_MODAL, useOpenedAsModal } from "../common/detail-shell";
import { EmptyPage } from "../common/empty-page";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { PageHeader } from "../common/page-header";
import { useSearchCut } from "../filters/use-search-cut";
import { counted, exportCsv } from "../lib/bulk";
import { formatCurrency } from "../lib/format";
import { ME } from "../lib/assignees";
import { amountOf, pastDeadline, RESOLUTION_LABEL, type ReturnRecord, STATUS_LABEL } from "../lib/returns";
import { undoable } from "../lib/undo";
import { useStoreScope } from "../stores/access-store";
import { useReturns } from "../stores/returns-store";
import { useWorkspace } from "../stores/workspace-store";
import { DataTable, type Facet, facetFilter, type RowAction } from "../table/data-table";
import { KindWord, reasonLabel, RejectDialog, ReturnStatusBadge } from "./parts";

export type ReturnsSearch = { view?: string };

const GUIDE = [
	{ title: "Aanvragen uit het portaal", body: "Klanten zoeken hun bestelling op en kiezen een reden en een oplossing. Hier staat het met de reden, de foto's en wat de klant wil.", art: "portal" },
	{ title: "Zelf een retour starten", body: "Vanaf de bestelling, als een klant belt of mailt. Hij komt bij Te beoordelen, net als een aanvraag uit het portaal.", art: "parcel" },
] as const;

/** The portal's address: public, outside the console, one per store. */
export const portalHref = (handle: string) => `${import.meta.env.BASE_URL ?? "/"}retour/${handle}`.replace(/\/+/g, "/");

const FACETS: ReadonlyArray<Facet> = [
	{ id: "status", label: "Status", options: (Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
	{ id: "kind", label: "Soort", options: [{ value: "return", label: "Retour" }, { value: "claim", label: "Claim" }] },
	{ id: "store", label: "Winkel", options: [{ value: "store_us", label: "Northwind US" }, { value: "store_eu", label: "Northwind EU" }] },
];

/**
 * Retouren (`/returns`, PLAN 25): returns and claims in one queue, the house table with its
 * filters, views and selection bar. A row opens the return as a modal over the list, like an order.
 */
export function ReturnsLayout() {
	const asModal = useOpenedAsModal();
	const atIndex = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") === "/returns" });
	return (
		<>
			{atIndex || asModal ? <ReturnsList /> : null}
			<Outlet />
		</>
	);
}

function ReturnsList() {
	const navigate = useNavigate();
	const all = useReturns((s) => s.records);
	const settings = useReturns((s) => s.settings);
	const scope = useStoreScope();
	const records = useMemo(() => (scope ? all.filter((r) => scope.includes(r.storeId)) : all), [all, scope]);
	const members = useWorkspace((s) => s.members);
	const now = useNow(60_000);
	const me = useMyName();
	const [rejecting, setRejecting] = useState<ReturnRecord[] | null>(null);
	const [picking, setPicking] = useState(false);
	const [starting, setStarting] = useState<Order | null>(null);
	useOnCreate("return", useCallback(() => setPicking(true), []));

	useSearchCut("returns", "view", {
		review: { field: "status", values: ["review"] },
		awaiting: { field: "status", values: ["awaiting_parcel", "in_transit"] },
		received: { field: "status", values: ["received"] },
		ready: { field: "status", values: ["ready"] },
		resolved: { field: "status", values: ["resolved"] },
		rejected: { field: "status", values: ["rejected"] },
		returns: { field: "kind", values: ["return"] },
		claims: { field: "kind", values: ["claim"] },
	});

	const meta = useMemo(() => {
		const review = records.filter((r) => r.status === "review");
		const late = review.filter((r) => pastDeadline(r.status, r.deadline, now)).length;
		const waiting = records.filter((r) => r.status === "awaiting_parcel" || r.status === "in_transit").length;
		return `${review.length} te beoordelen${late ? ` · ${late} over de deadline` : ""} · ${waiting} wachten op pakket`;
	}, [records, now]);

	const actions = useMemo<ReadonlyArray<RowAction<ReturnRecord>>>(
		() => [
			{
				id: "approve",
				label: "Goedkeuren",
				icon: Check,
				group: "Beoordelen",
				shortcut: "a",
				bar: true,
				needs: { perm: "returns.approve" },
				applies: (r) => r.status === "review",
				run: (rows) => {
					const undo = useReturns.getState().approve(rows.map((r) => r.id), me);
					undoable(`${counted(rows.length, "retour", "retouren")} goedgekeurd`, undo, "Ze wachten nu op hun pakket. Stuur het label om de klant te laten beginnen.");
				},
			},
			{
				id: "reject",
				label: "Afwijzen",
				icon: XCircle,
				group: "Beoordelen",
				needs: { perm: "returns.approve" },
				applies: (r) => r.status === "review",
				run: (rows) => setRejecting([...rows]),
			},
			{
				id: "label",
				label: "Label versturen",
				icon: Send,
				group: "Afhandeling",
				shortcut: "l",
				bar: true,
				needs: { perm: "returns", arg: 2 },
				applies: (r) => r.status === "awaiting_parcel" && !r.label,
				run: (rows) => {
					const undo = useReturns.getState().sendLabel(rows.map((r) => r.id), me);
					undoable("Wordt verstuurd…", undo, `${counted(rows.length, "retourlabel", "retourlabels")} naar de klant. Ongedaan maken kan tot het vertrekt.`);
				},
			},
			{
				id: "assign",
				label: "Aan mij toewijzen",
				icon: User,
				group: "Ordenen",
				shortcut: "m",
				needs: { perm: "returns", arg: 2 },
				run: (rows) => {
					const undo = useReturns.getState().assign(rows.map((r) => r.id), ME, me);
					undoable(`${counted(rows.length, "retour", "retouren")} aan jou toegewezen`, undo);
				},
			},
			{
				id: "csv",
				label: "Exporteren als CSV",
				icon: Download,
				group: "Exporteren",
				needs: { perm: "data.export" },
				run: (rows) =>
					exportCsv(
						"retouren",
						["Nummer", "Bestelling", "Klant", "Soort", "Reden", "Oplossing", "Status", "Bedrag", "Aangemaakt"],
						rows.map((r) => [r.number, r.orderNumber, r.customerName, r.kind === "claim" ? "Claim" : "Retour", reasonLabel(settings.reasons, r.reason), RESOLUTION_LABEL[r.requested], STATUS_LABEL[r.status], amountOf(r), r.createdAt]),
					),
			},
		],
		[me, settings.reasons],
	);

	const columns = useMemo<Array<ColumnDef<ReturnRecord, unknown>>>(
		() => [
			{ id: "number", accessorKey: "number", header: "Nummer", size: 88, enableHiding: false, cell: (c) => <span className="font-medium text-ink tabular-nums">{c.row.original.number}</span> },
			{ id: "order", accessorKey: "orderNumber", header: "Bestelling", size: 104, cell: (c) => <span className="tabular-nums">{c.row.original.orderNumber}</span> },
			{ id: "customer", accessorKey: "customerName", header: "Klant", cell: (c) => <span className="block max-w-[200px] truncate text-ink">{c.row.original.customerName}</span> },
			{ id: "kind", accessorKey: "kind", header: "Soort", size: 80, filterFn: facetFilter, cell: (c) => <KindWord kind={c.row.original.kind} /> },
			{ id: "reason", accessorFn: (r) => reasonLabel(settings.reasons, r.reason), header: "Reden", size: 150, cell: (c) => <span className="block max-w-[160px] truncate" title={c.row.original.note}>{c.getValue() as string}</span> },
			{ id: "requested", accessorFn: (r) => RESOLUTION_LABEL[r.requested], header: "Gewenst", size: 120 },
			{ id: "status", accessorKey: "status", header: "Status", size: 190, filterFn: facetFilter, cell: (c) => <ReturnStatusBadge status={c.row.original.status} late={pastDeadline(c.row.original.status, c.row.original.deadline, now)} /> },
			{ id: "items", accessorFn: (r) => r.items.reduce((n, i) => n + i.qty, 0), header: "Artikelen", size: 72, cell: (c) => <span className="tabular-nums">{c.getValue() as number}</span> },
			{ id: "amount", accessorFn: amountOf, header: "Bedrag", size: 96, cell: (c) => <span className="font-medium text-ink tabular-nums">{formatCurrency(c.getValue() as number, c.row.original.currency)}</span> },
			{ id: "store", accessorKey: "storeId", header: "Winkel", filterFn: facetFilter },
			{ id: "assignee", accessorFn: (r) => members.find((m) => m.id === r.assignee)?.name ?? "", header: "Toegewezen aan" },
			{ id: "created", accessorKey: "createdAt", header: "Aangemaakt", size: 120, cell: (c) => <span className="tabular-nums">{short(c.row.original.createdAt)}</span> },
			{
				id: "deadline",
				accessorKey: "deadline",
				header: "Deadline",
				size: 120,
				cell: (c) =>
					c.row.original.status === "review" ? <span className={pastDeadline("review", c.row.original.deadline, now) ? "font-medium text-signal-red tabular-nums" : "tabular-nums"}>{short(c.row.original.deadline)}</span> : <span className="text-ink-3">—</span>,
			},
		],
		[settings.reasons, members, now],
	);

	if (all.length === 0) {
		return (
			<div className="flex min-w-0 flex-col">
				<PageHeader title="Retouren" />
				<EmptyPage
					kind="returns"
					count="0 retouren"
					title="Nog geen retouren"
					body={
						settings.portal.on
							? "Je retourportaal staat aan."
							: "Zet je retourportaal aan om aanvragen te ontvangen."
					}
					action={{ label: settings.portal.on ? "Instellingen bekijken" : "Portaal instellen", onClick: () => void navigate({ to: "/settings/returns" }) }}
					secondary={{ label: "Retourportaal bekijken", onClick: () => window.open(portalHref(settings.portal.handle), "_blank", "noopener") }}
					starts={[
						{ id: "windows", label: "Termijnen kiezen", body: "30 dagen voor een retour en 60 voor een claim, of wat bij je winkel past.", to: "/settings/returns" },
						{ id: "rules", label: "Uitzonderingen per product", body: "Sale-artikelen niet, mutsen om hygiënische redenen ook niet.", to: "/settings/returns" },
						{ id: "orders", label: "Een retour starten voor een klant", body: "Vanaf de bestelling, als een klant belt of mailt.", to: "/orders" },
					]}
				/>
				<PageGuide id="returns" title="Retouren" steps={GUIDE} />
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Retouren"
				meta={meta}
				actions={
					<>
						<button
							type="button"
							onClick={() => window.open(portalHref(settings.portal.handle), "_blank", "noopener")}
							className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
						>
							<ExternalLink className="size-3.5" strokeWidth={1.75} />
							Retourportaal
						</button>
						<Gate perm="returns" arg={3}>
							<button
								type="button"
								onClick={() => void navigate({ to: "/settings/returns" })}
								className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs transition-colors hover:field-hover disabled:pointer-events-none disabled:opacity-45"
							>
								<Settings className="size-3.5" strokeWidth={1.75} />
								Instellingen
							</button>
						</Gate>
					</>
				}
			/>
			<div className="min-w-0 px-5 pb-6">
				<DataTable
					columns={columns}
					data={records}
					facets={FACETS}
					actions={actions}
					noun={["return", "returns"]}
					label={["retour", "retouren"]}
					getRowId={(r) => r.id}
					searchPlaceholder="Retouren zoeken"
					initialVisibility={{ store: false, assignee: false, items: false, requested: false }}
					initialSorting={[{ id: "created", desc: true }]}
					onRowClick={(r) => navigate({ to: "/returns/$returnId", params: { returnId: r.id }, state: OPEN_AS_MODAL })}
					empty={<EmptyState kind="returns" title="Geen retouren voor deze filters." body="Pas de filters aan, of bekijk alle retouren." />}
				/>
			</div>
			<OrderPickDialog open={picking} onClose={() => setPicking(false)} onPick={(o) => {
				setPicking(false);
				setStarting(o);
			}} />
			{starting ? <StartReturnDialog order={starting} open onClose={() => setStarting(null)} /> : null}
			<RejectDialog
				count={rejecting?.length ?? 0}
				open={rejecting !== null}
				onClose={() => setRejecting(null)}
				onReject={(reason) => {
					const rows = rejecting ?? [];
					const undo = useReturns.getState().reject(rows.map((r) => r.id), reason, me);
					undoable(`${counted(rows.length, "retour", "retouren")} afgewezen`, undo, "De klant krijgt de reden per mail zodra dit venster sluit.");
				}}
			/>
			<PageGuide id="returns" title="Retouren" steps={GUIDE} />
		</div>
	);
}

const short = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
