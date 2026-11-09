import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, GitMerge, Plus, Sparkles } from "../../icons";
import { TagDialog } from "../common/tag-dialog";
import type { DuplicateGroup } from "../lib/duplicates";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchCut } from "../filters/use-search-cut";
import { useOnCreate } from "../stores/create-intent";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { EmptyState } from "../common/empty-state";
import { AreaEmpty } from "../common/area-empty";
import { PageHeader } from "../common/page-header";
import { PageGuide } from "../common/page-guide";
import { Blocked } from "../access/blocked";
import { CustomerStatusBadge } from "./customer-status-badge";
import { DataTable, type Facet, facetFilter } from "../table/data-table";
import { formatCurrency, initials } from "../lib/format";
import { countryFlag, countryName } from "../lib/format-flag";
import { personStyle } from "../lib/person-color";
import type { Customer } from "../lib/types/domain";
import { type CustomerRow as Row, type TeamGate, useCustomersSource } from "./source";

/** A control the role may not use: disabled, with what is missing, from the host's answer. */
function GateBy({ gate, children }: { gate: TeamGate; children: ReactElement }) {
	return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>;
}

/*
 * The line beside the title is counted from the profiles on screen: how many, how many are new, and
 * how many look like the same person twice — the last a pile of work with a name on it, and a facet
 * you can click. It used to be "42.318 customers · 38 look like duplicates", figures nobody could
 * trace to anything.
 *
 * Store-free: the profiles, what they may become and the dialogs that change them come from the host (`source.tsx`;
 * the design app's `demo-source.tsx`, the console's over `Customers.list`).
 */


const GUIDE = [
	{ title: "Al je klanten", body: "Elke klant die bij een gekoppelde winkel bestelde, staat hier, met bestellingen, tickets en chargebacks al gekoppeld.", art: "people" },
	{ title: "Dubbele profielen", body: "Hetzelfde e-mailadres, of dezelfde naam in hetzelfde land. Er wordt niets samengevoegd tot jij dat zegt.", art: "link" },
	{ title: "Labels", body: "Labels gaan mee met het profiel, naar segmenten, automatiseringen en Klaviyo.", art: "rules" },
] as const;

const FACETS: ReadonlyArray<Facet> = [
	{
		id: "status",
		label: "Status",
		options: [
			{ value: "loyal", label: "Trouw" },
			{ value: "new", label: "Nieuw" },
			{ value: "at_risk", label: "Risico" },
			{ value: "duplicate", label: "Dubbel" },
		],
	},
	{
		id: "country",
		label: "Land",
		options: [
			{ value: "US", label: "Verenigde Staten" },
			{ value: "NL", label: "Nederland" },
			{ value: "DE", label: "Duitsland" },
			{ value: "GB", label: "Verenigd Koninkrijk" },
			{ value: "FR", label: "Frankrijk" },
			{ value: "BE", label: "België" },
		],
	},
];

export function CustomersPage() {
	const ask = useAskInsyte();
	const source = useCustomersSource();
	const { customers, loading, NewCustomer, Klaviyo, Merge, Closing } = source;
	const [newOpen, setNewOpen] = useState(false);
	useOnCreate("customer", useCallback(() => setNewOpen(true), []));
	// Adding a customer, where the host can: the button and the empty states offer it then.
	const create = NewCustomer === undefined ? undefined : { label: "Klant toevoegen", onClick: () => setNewOpen(true) };
	useSearchCut("customers", "segment", {
		new: { field: "status", values: ["new"] },
		vip: { field: "status", values: ["loyal"] },
		at_risk: { field: "status", values: ["at_risk"] },
		blocked: { field: "status", values: ["duplicate"] },
	});

	const groups = source.duplicates;
	const rows = useMemo<Array<Row>>(() => {
		const dup = new Set(groups.flatMap((g) => g.ids));
		return customers.map((c) => ({
			...c,
			status: dup.has(c.id) ? "duplicate" : source.statusOf(c),
			aov: c.orders_count ? c.lifetime_value / c.orders_count : 0,
		}));
	}, [customers, groups, source.statusOf]);
	const standing = useMemo(() => {
		const fresh = rows.filter((r) => r.status === "new").length;
		const dup = groups.reduce((n, g) => n + g.ids.length, 0);
		return `${rows.length} ${rows.length === 1 ? "klant" : "klanten"} · ${fresh} nieuw · ${dup === 0 ? "geen dubbele profielen" : `${dup} lijken dubbel`}`;
	}, [rows, groups]);
	const knownTags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))], [rows]);

	const [tagging, setTagging] = useState<Row[] | null>(null);
	const [syncing, setSyncing] = useState<Row[] | null>(null);
	const [review, setReview] = useState<{ groups: DuplicateGroup[] } | null>(null);
	const actions = useMemo(
		() =>
			source.actions({
				tag: setTagging,
				klaviyo: setSyncing,
				merge: (picked) => {
					if (picked.length >= 2) {
						setReview({ groups: [{ key: picked.map((p) => p.id).sort().join(","), ids: picked.map((p) => p.id), match: "same name" }] });
						return;
					}
					const g = groups.find((x) => picked[0] && x.ids.includes(picked[0].id));
					if (g) setReview({ groups: [g] });
					else toast("Kies twee of meer profielen om samen te voegen, of bekijk de profielen die Insyte vond.");
				},
			}),
		[groups, source.actions],
	);

	const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
		() => [
			{
				id: "customer",
				accessorFn: (c) => `${c.name} ${c.email}`,
				header: "Klant",
				enableHiding: false,
				cell: (ctx) => {
					const c = ctx.row.original;
					return (
						<div className="flex items-center gap-2.5">
							<span
								className="flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-2xs"
								style={personStyle(c.id)}
							>
								{initials(c.name)}
							</span>
							<span className="flex min-w-0 items-center gap-1.5">
								<span className="truncate font-medium text-ink">
									{c.name}
								</span>
								{c.tags.slice(0, 2).map((t) => (
									<span key={t} className="shrink-0 rounded-sm bg-mist px-1.5 py-px text-xs text-ink-2">
										{t}
									</span>
								))}
								{c.tags.length > 2 ? <span className="shrink-0 text-xs text-ink-3">+{c.tags.length - 2}</span> : null}
							</span>
						</div>
					);
				},
			},
			{
				id: "email",
				accessorKey: "email",
				header: "E-mail",
				cell: (ctx) => (
					<span className="block max-w-[220px] truncate">
						{ctx.row.original.email}
					</span>
				),
			},
			{
				id: "country",
				accessorFn: (c) => c.address?.country ?? "US",
				header: "Land",
				size: 152,
				filterFn: facetFilter,
				cell: (ctx) => {
					const code = ctx.row.original.address?.country ?? "US";
					return (
						<span className="flex items-center gap-2">
							<span className="leading-none">{countryFlag(code)}</span>
							{countryName(code)}
						</span>
					);
				},
			},
			{
				id: "orders",
				accessorKey: "orders_count",
				header: "Bestellingen",
				size: 76,
				cell: (ctx) => (
					<span className="tabular-nums">{ctx.row.original.orders_count}</span>
				),
			},
			{
				id: "clv",
				accessorKey: "lifetime_value",
				header: "CLV",
				size: 100,
				cell: (ctx) => (
					<span className="font-medium text-ink tabular-nums">
						{formatCurrency(ctx.row.original.lifetime_value, source.currencyOf?.(ctx.row.original))}
					</span>
				),
			},
			{
				id: "aov",
				accessorKey: "aov",
				header: "Gem. bestelling",
				size: 100,
				cell: (ctx) => (
					<span className="tabular-nums">
						{formatCurrency(ctx.row.original.aov, source.currencyOf?.(ctx.row.original))}
					</span>
				),
			},
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 116,
				filterFn: facetFilter,
				cell: (ctx) => <CustomerStatusBadge status={ctx.row.original.status} />,
			},
			{
				id: "last_order",
				accessorKey: "created_at",
				header: "Laatste bestelling",
				size: 124,
				cell: (ctx) => (
					<span className="tabular-nums">{source.lastOrder(ctx.row.original)}</span>
				),
			},
		],
		[source.lastOrder, source.currencyOf],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Klanten"
				meta={standing}
				actions={
					<>
						<GateBy gate={source.canCreate}>
							<button
								type="button"
								onClick={() => setNewOpen(true)}
								className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
							>
								<Plus className="size-3.5" strokeWidth={2} />
								Nieuwe klant
							</button>
						</GateBy>
					</>
				}
			/>

			<div className="min-w-0 px-5 pb-6">
				{groups.length > 0 ? (
					<button
						type="button"
						onClick={() => setReview({ groups: [...groups] })}
						className="group/dup mb-3 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-arc-tint px-3.5 py-2.5 text-left text-base text-arc-ink transition-colors hover:bg-arc/15"
					>
						<GitMerge className="size-4 shrink-0" strokeWidth={1.75} />
						<span className="min-w-0 flex-1">
							<span className="font-medium">
								{groups.length} {groups.length === 1 ? "persoon staat" : "personen staan"} er meer dan één keer in.
							</span>
						</span>
						<span className="flex shrink-0 items-center gap-1 font-medium">
							Bekijken
							<ArrowRight className="size-3.5 transition-transform group-hover/dup:translate-x-0.5" strokeWidth={2} />
						</span>
					</button>
				) : null}
				{!loading && customers.length === 0 ? (
					<AreaEmpty area="customers" action={create} starts={source.starts} />
				) : (
					<DataTable
						columns={columns}
						data={rows}
						loading={loading}
						facets={FACETS}
						actions={actions}
						noun={["customer", "customers"]}
						getRowId={(r) => r.id}
						searchPlaceholder="Klanten zoeken"
						initialSorting={[{ id: "clv", desc: true }]}
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
								kind="customers"
								title="Geen klanten voor deze filters."
								body="Pas de filters aan of wis ze."
								action={create && { ...create, label: "Nieuwe klant" }}
							/>
						}
					/>
				)}
			</div>
			{Closing ? <Closing empty={customers.length === 0} /> : null}

			{NewCustomer ? <NewCustomer open={newOpen} onOpenChange={setNewOpen} /> : null}
			<TagDialog
				open={tagging !== null}
				onOpenChange={(v) => !v && setTagging(null)}
				picked={tagging ?? []}
				known={knownTags}
				noun={["klant", "klanten"]}
				description="Labels gaan mee met het profiel, naar segmenten, automatiseringen en Klaviyo."
				onApply={(tags, mode) => source.applyTags?.(tagging ?? [], tags, mode)}
			/>
			{Klaviyo ? <Klaviyo open={syncing !== null} onOpenChange={(v) => !v && setSyncing(null)} picked={syncing ?? []} /> : null}
			{Merge ? (
				<Merge open={review !== null} onOpenChange={(v) => !v && setReview(null)} groups={review?.groups ?? []} customers={customers as Customer[]} />
			) : null}
			<PageGuide id="customers.list" title="Klanten" steps={GUIDE} />
		</div>
	);
}

