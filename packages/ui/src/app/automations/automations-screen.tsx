import { useNavigate, getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Sparkles } from "../../icons";
import { useCallback, useMemo } from "react";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { flatNodes, NODE_VARIANTS, VARIANTS_BY_ID, type WorkflowState } from "./node-types";
import { StepTile } from "./step-tile";
import { BrandLogo } from "../marketplace/brand-logos";
import {
	useWorkflows,
	workflowStore,
} from "./workflow-store";
import { EmptyPage } from "../common/empty-page";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { PageHeader } from "../common/page-header";
import {
	DataTable,
	type Facet,
	facetFilter,
} from "../table/data-table";
import { automations } from "../../data-source";
import type { Automation as SeedAutomation } from "../lib/types/domain";
import { useOnCreate } from "../stores/create-intent";
import { useWorkspace } from "../stores/workspace-store";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { draftFromTemplate, HistoryView, RecommendedView, recommendations, TemplatesView, usesAi } from "./library";
import { TEMPLATES } from "../lib/automation-templates";
import { VIEWS } from "./automations-search";

const Route = getRouteApi("/_admin/automations/");
type View = (typeof VIEWS)[number];

const TITLE: Record<View, string> = {
	drafts: "Concepten",
	ai: "Met AI-stappen",
	history: "Geschiedenis",
	templates: "Sjablonen",
	recommended: "Aanbevolen",
};

const GUIDE = [
	{ title: "Wat een automatisering doet", body: "Ze let op iets, zoals een bestelling die te laat is of een geschil dat opent, en doet dan de volgende stappen voor je.", art: "flow" },
	{ title: "Begin met een sjabloon", body: "Een sjabloon maakt een concept dat je aanpast. Of beschrijf in één zin wat je wilt. Niets gaat vanzelf aan.", art: "rules" },
	{ title: "Aanbevolen", body: "Een sjabloon verschijnt als je bestellingen, voorraad of geschillen laten zien dat het werk zou hebben, en nog geen actieve flow dat doet.", art: "chart" },
	{ title: "AI-stappen", body: "Een AI-stap stelt een antwoord op, leest het sentiment of vat een gesprek samen. Voeg er een toe vanuit Stappen in de editor.", art: "chat" },
] as const;

/* The list reads the workflow store, so a draft, a rename, a pause or a run made in the builder shows
   here. The flows that shipped keep their written chips and platform; a flow drafted here reads its
   chips off its own steps. */
type Automation = SeedAutomation;

const SEED_BY_ID = new Map(automations.map((a) => [a.id, a]));

const FACETS: ReadonlyArray<Facet> = [
	{
		id: "status",
		label: "Status",
		options: [
			{ value: "active", label: "Actief" },
			{ value: "paused", label: "Gepauzeerd" },
			{ value: "draft", label: "Concept" },
		],
	},
];

export function AutomationsPage() {
	const ask = useAskInsyte();
	const navigate = useNavigate();
	const workflows = useWorkflows();
	const view = Route.useSearch().view;
	const orders = useWorkspace((s) => s.orders);
	const { data: products } = useProducts();
	const { data: customers } = useCustomers();
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const tickets = useWorkspace((s) => s.tickets);
	const recommended = useMemo(
		() => recommendations({ orders, products, customers, chargebacks, tickets }, workflows),
		[orders, products, customers, chargebacks, tickets, workflows],
	);

	const rows = useMemo<Automation[]>(
		() =>
			Object.values(workflows).map((w) => {
				const seed = SEED_BY_ID.get(w.automationId);
				const labels = w.nodes.map(
					(n) => VARIANTS_BY_ID[n.variantId]?.label ?? "",
				);
				return {
					id: w.automationId,
					name: w.name,
					description: w.description || "Concept · draait nog niet",
					trigger: labels[0] ?? "Nog geen trigger",
					trigger_label: seed?.trigger_label ?? labels[0] ?? "Nog geen trigger",
					actions: labels.slice(1),
					flow_steps: seed ? seed.flow_steps : labels,
					platform: seed?.platform ?? "Insyte",
					total_runs: w.runs,
					status: w.status,
					runs_30d: w.runs,
					created_at: w.createdAt,
				};
			}),
		[workflows],
	);

	const shown = useMemo(
		() => (view === "drafts" ? rows.filter((a) => a.status === "draft") : view === "ai" ? rows.filter((a) => workflows[a.id] && usesAi(workflows[a.id])) : rows),
		[rows, view, workflows],
	);
	const runCount = useMemo(() => Object.values(workflows).reduce((n, w) => n + w.history.length, 0), [workflows]);

	const standing = useMemo(() => {
		const active = rows.filter((a) => a.status === "active").length;
		const draft = rows.filter((a) => a.status === "draft").length;
		const runs = rows.reduce((sum, a) => sum + (a.total_runs ?? 0), 0);
		return `${active} actief · ${
			rows.length - active - draft
		} gepauzeerd · ${draft} ${draft === 1 ? "concept" : "concepten"} · ${runs.toLocaleString("nl-NL")} ${runs === 1 ? "uitvoering" : "uitvoeringen"} in totaal`;
	}, [rows]);

	// A blank draft, opened in the builder with "Describe the flow" up.
	const newAutomation = useCallback(() => {
		const id = workflowStore.create();
		navigate({ to: "/automations/$automationId", params: { automationId: id } });
	}, [navigate]);
	useOnCreate("automation", newAutomation);

	const columns = useMemo<Array<ColumnDef<Automation, unknown>>>(
		() => [
			{
				id: "flow",
				accessorFn: (a) => `${a.name} ${(a.flow_steps ?? []).join(" ")}`,
				header: "Flow",
				size: 320,
				enableHiding: false,
				cell: (c) => <FlowCell name={c.row.original.name} workflow={workflows[c.row.original.id]} />,
			},
			{
				id: "description",
				accessorKey: "description",
				header: "Beschrijving",
				cell: (c) => (
					<span className="block max-w-[380px] truncate">
						{c.row.original.description}
					</span>
				),
			},
			{
				id: "trigger",
				accessorFn: (a) => a.trigger_label ?? a.trigger,
				header: "Trigger",
				size: 180,
				cell: (c) => (
					<Chip>{c.row.original.trigger_label ?? c.row.original.trigger}</Chip>
				),
			},
			{
				id: "platform",
				accessorFn: (a) => brandsOf(workflows[a.id]).join(" "),
				header: "Koppelingen",
				size: 140,
				cell: (c) => <Brands workflow={workflows[c.row.original.id]} />,
			},
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 104,
				filterFn: facetFilter,
				cell: (c) => <StatusDot status={c.row.original.status} />,
			},
			{
				id: "runs",
				accessorFn: (a) => a.total_runs ?? a.runs_30d,
				header: "Uitvoeringen",
				size: 88,
				cell: (c) => (
					<span className="tabular-nums">
						{(
							c.row.original.total_runs ?? c.row.original.runs_30d
						).toLocaleString("nl-NL")}
					</span>
				),
			},
		],
		[workflows],
	);

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={view ? TITLE[view] : "Automatiseringen"}
				crumbs={view ? [{ label: "Automatiseringen", to: "/automations" }] : []}
				meta={
					view === "templates"
						? `${TEMPLATES.length} sjablonen · elk maakt een concept`
						: view === "recommended"
							? `${recommended.length} de moeite waard om in te stellen, volgens je eigen gegevens`
							: view === "history"
								? `${runCount} recente ${runCount === 1 ? "uitvoering" : "uitvoeringen"}`
								: view === "drafts"
									? `${shown.length} ${shown.length === 1 ? "concept" : "concepten"} · niet actief`
									: view === "ai"
										? `${shown.length} ${shown.length === 1 ? "flow laat" : "flows laten"} Insyte iets opstellen of lezen`
										: standing
				}
				actions={
					<button
						type="button"
						onClick={newAutomation}
						className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
					>
						<Plus className="size-3.5" strokeWidth={2} />
						Nieuwe automatisering
					</button>
				}
			/>

			<div className="min-w-0 px-5 pb-6">
				{view === "templates" ? (
					<TemplatesView />
				) : view === "recommended" ? (
					<RecommendedView items={recommended} />
				) : view === "history" ? (
					<HistoryView workflows={workflows} />
				) : rows.length === 0 ? (
					<EmptyPage
						kind="automations"
						count="0 automatiseringen"
						title="Nog geen automatiseringen"
						body="Begin met een sjabloon of beschrijf wat je wilt."
						action={{ label: "Beschrijf het", icon: <Sparkles className="size-3.5" strokeWidth={1.75} />, onClick: () => ask.open() }}
						secondary={{ label: "Leeg beginnen", onClick: newAutomation }}
						startsTitle="Begin met een sjabloon"
						starts={[
							...TEMPLATES.slice(0, 4).map((t) => ({
								id: t.id,
								label: t.name,
								body: t.description,
								onClick: () => navigate({ to: "/automations/$automationId", params: { automationId: draftFromTemplate(t) } }),
							})),
							{ id: "all", label: `Alle ${TEMPLATES.length} sjablonen`, body: "Per soort: bestellingen, klanten, klantenservice, voorraad en geschillen.", to: "/automations", search: { view: "templates" } },
						]}
					/>
				) : (
				<DataTable
					columns={columns}
					data={shown}
					facets={view === "drafts" || view === "ai" ? [] : FACETS}
					searchPlaceholder="Zoek op flow, trigger, platform"
					initialSorting={[{ id: "runs", desc: true }]}
					initialVisibility={{ description: false }}
					onRowClick={(a) =>
						navigate({
							to: "/automations/$automationId",
							params: { automationId: a.id },
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
							kind="automations"
							title={
								rows.length === 0
									? "Nog geen automatiseringen."
									: view === "drafts"
										? "Geen concepten."
										: view === "ai"
											? "Geen flow met een AI-stap."
											: "Geen flow past bij deze filters."
							}
							body={
								view === "ai" && rows.length > 0
									? "Voeg een AI-stap toe vanuit Stappen in de editor."
									: "Begin leeg of vanuit een sjabloon."
							}
							action={{
								label: "Nieuwe automatisering",
								onClick: newAutomation,
							}}
							secondary={{ label: "Sjablonen bekijken", onClick: () => navigate({ to: "/automations", search: { view: "templates" } }) }}
						/>
					}
				/>
				)}
			</div>
			<PageGuide id="automations.list" title="Automatiseringen" steps={GUIDE} />
		</div>
	);
}

/** The flow as its steps' marks, then its name: the logos say at a glance what it touches. */
function FlowCell({ name, workflow }: { name: string; workflow?: WorkflowState }) {
	const steps = workflow ? flatNodes(workflow.nodes).slice(0, 6) : [];
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<span className="flex w-[118px] shrink-0 items-center gap-0.5">
				{steps.map((n) => {
					const v = VARIANTS_BY_ID[n.variantId];
					return v ? <StepTile key={n.id} variant={v} size={18} /> : null;
				})}
			</span>
			<span className="min-w-0 truncate font-medium text-ink">{name}</span>
		</span>
	);
}

const brandsOf = (w?: WorkflowState) => [...new Set((w ? flatNodes(w.nodes) : []).map((n) => VARIANTS_BY_ID[n.variantId]?.brand).filter((b): b is string => Boolean(b)))];

function Brands({ workflow }: { workflow?: WorkflowState }) {
	const brands = brandsOf(workflow);
	if (brands.length === 0) return <span className="text-ink-3">Alleen Insyte</span>;
	return (
		<span className="flex items-center gap-1">
			{brands.map((b) => (
				<BrandLogo key={b} brand={b} name={NODE_VARIANTS.find((v) => v.brand === b)?.category ?? b} size={18} />
			))}
		</span>
	);
}

/* Status is a dot and a word rather than a filled badge: it is true of the flow all the time, and a
   row of eight coloured pills competes with the chips that carry the flow itself. */
function StatusDot({ status }: { status: string }) {
	const tone =
		status === "active"
			? "var(--signal-green)"
			: status === "draft"
				? "var(--ink-4)"
				: "var(--signal-amber)";
	return (
		<span className="flex items-center gap-1.5">
			<span
				className="size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: tone }}
				aria-hidden
			/>
			{status === "active" ? "Actief" : status === "draft" ? "Concept" : "Gepauzeerd"}
		</span>
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex h-[20px] max-w-full items-center truncate rounded-sm bg-ink/6 px-1.5 font-medium text-xs text-ink-2 leading-none">
			{children}
		</span>
	);
}
