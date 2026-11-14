import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Sparkles } from "../../icons";
import { EmptyPage } from "../common/empty-page";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { PageHeader } from "../common/page-header";
import { useSearchCut } from "../filters/use-search-cut";
import { type AgentLogEntry, canUndo, RECORD_LABEL, ranUnder, STATUS_LABEL } from "../lib/agent-log";
import { CATALOGUE, ENTRY } from "../lib/autonomy";
import { DataTable, type Facet, facetFilter } from "../table/data-table";
import { useAgentLogSource } from "./agent-log-source";
import { AgentLogDrawer, StatusWord, UndoControl, useNow } from "./agent-parts";
import { InsyteMark } from "./parts";

export type ActivitySearch = { view?: string; row?: string };

const statusOf = (e: AgentLogEntry, now: number) => (e.effect?.kind === "send" && e.status === "done" && canUndo(e, now) ? "sending" : e.status);

const GUIDE = [
	{ title: "Alles wat Insyte zelf deed", body: "Elke actie met waarom, wat Insyte las en onder welke regel. Klik een rij voor de details.", art: "log" },
	{ title: "Ongedaan maken", body: "Binnen 5 minuten draai je een actie terug. Daarna staat in de details hoe je het herstelt.", art: "undo" },
	{ title: "De regels", body: "Wat Insyte zelf mag, stel je in bij Zelfstandigheid.", art: "rules" },
] as const;

const FACETS: ReadonlyArray<Facet> = [
	{ id: "status", label: "Status", options: (["done", "sending", "undone", "failed"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
	{ id: "action", label: "Actie", options: CATALOGUE.map((e) => ({ value: e.id, label: e.label })) },
	{ id: "kind", label: "Record", options: Object.entries(RECORD_LABEL).map(([value, label]) => ({ value, label })) },
	{ id: "setting", label: "Instelling", options: [{ value: "Zelf doen", label: "Zelf doen" }, { value: "Na goedkeuring", label: "Na goedkeuring" }] },
];

/**
 * Wat Insyte deed (`/ask/activity`, PLAN 30): every action the agent took, with the setting it ran
 * under, what started it, and Ongedaan maken while the server's window is open. A row opens its
 * drawer: before and after, what it read, the policy and model versions. The list is the house
 * table, so its cuts are filters and can be saved as views. The rows and the way back are the host's
 * (`AgentLogSource`).
 */
export function ActivityPage() {
	const search = useSearch({ strict: false }) as ActivitySearch;
	const navigate = useNavigate();
	const { entries, today: counted, pages } = useAgentLogSource();
	const now = useNow(15_000);
	const [openId, setOpenId] = useState<string | null>(search.row ?? null);
	const open = openId ? (entries.find((e) => e.id === openId) ?? null) : null;

	useSearchCut("agent-actions", "view", {
		undoable: { field: "undoable", values: ["ja"] },
		undone: { field: "status", values: ["undone"] },
		failed: { field: "status", values: ["failed"] },
		auto: { field: "setting", values: ["Zelf doen"] },
	});

	const counts = useMemo(() => {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const t = entries.filter((e) => Date.parse(e.at) >= start.getTime());
		return { n: t.length, undone: t.filter((e) => e.status === "undone").length, failed: t.filter((e) => e.status === "failed").length };
	}, [entries]);
	const today = counted ?? counts;

	const columns = useMemo<Array<ColumnDef<AgentLogEntry, unknown>>>(
		() => [
			{
				id: "at",
				accessorKey: "at",
				header: "Tijd",
				size: 96,
				cell: (c) => <span className="text-ink-3 tabular-nums">{fmtTime(c.row.original.at)}</span>,
			},
			{
				id: "sentence",
				accessorKey: "sentence",
				header: "Wat Insyte deed",
				enableHiding: false,
				cell: (c) => (
					<span className="flex min-w-0 max-w-[min(460px,26vw)] items-center gap-2">
						<InsyteMark size={18} />
						<span className={c.row.original.status === "undone" ? "truncate text-ink-3 line-through decoration-ink-4" : "truncate text-ink"}>{c.row.original.sentence}</span>
						{/* Zelf doen is the usual case and goes unsaid; only an approval is worth a chip. */}
						{c.row.original.level === "auto" ? null : <span className="shrink-0 rounded-sm bg-mist px-1.5 py-px text-ink-2 text-xs">{ranUnder(c.row.original)}</span>}
					</span>
				),
			},
			{
				id: "record",
				accessorFn: (e) => (e.record ? `${RECORD_LABEL[e.record.kind]} ${e.record.label}` : ""),
				header: "Record",
				size: 150,
				cell: (c) => (c.row.original.record ? <span className="block max-w-[150px] truncate text-arc-ink text-sm">{c.getValue() as string}</span> : null),
			},
			{ id: "kind", accessorFn: (e) => e.record?.kind ?? "", header: "Soort record", filterFn: facetFilter },
			{ id: "action", accessorFn: (e) => e.action, header: "Actie", filterFn: facetFilter, cell: (c) => <span className="text-ink-2">{ENTRY[c.row.original.action]?.label}</span> },
			{
				id: "setting",
				accessorFn: (e) => (e.level === "auto" ? "Zelf doen" : "Na goedkeuring"),
				header: "Instelling",
				size: 150,
				filterFn: facetFilter,
			},
			{ id: "trigger", accessorKey: "trigger", header: "Aanleiding", size: 200, cell: (c) => <span className="truncate text-ink-2">{c.row.original.trigger}</span> },
			{ id: "status", accessorFn: (e) => statusOf(e, Date.now()), header: "Status", size: 140, filterFn: facetFilter, cell: (c) => <StatusWord e={c.row.original} now={Date.now()} /> },
			{ id: "undoable", accessorFn: (e) => (canUndo(e, Date.now()) ? "ja" : "nee"), header: "Kan nog terug" },
			{
				id: "undo",
				header: "",
				size: 96,
				enableSorting: false,
				cell: (c) => (
					<span className="flex justify-end">
						<UndoControl e={c.row.original} now={Date.now()} size="xs" />
					</span>
				),
			},
		],
		[],
	);

	if (entries.length === 0) {
		return (
			<div className="flex min-w-0 flex-col">
				<PageHeader title="Wat Insyte deed" />
				<EmptyPage
					kind="activity"
					count="0 acties"
					title="Insyte heeft nog niets zelf gedaan"
					body="Zet een actie op Zelf doen en ze verschijnt hier."
					action={{ label: "Zelfstandigheid instellen", onClick: () => void navigate({ to: "/settings/ai/autonomy" }) }}
					secondary={pages.ask ? { label: "Vraag Insyte openen", onClick: () => void navigate({ to: "/ask" as never }) } : undefined}
					starts={[
						{ id: "assign", label: "Laat Insyte toewijzen", body: "Bij de collega met het minste werk.", to: "/settings/ai/autonomy", search: { actie: "AssignTicket" } },
						{ id: "label", label: "Laat Insyte labelen", body: "Retour, Levering, Kwaliteit op elke mail.", to: "/settings/ai/autonomy", search: { actie: "ApplyLabel" } },
						{ id: "limits", label: "Zet een AI-budget", body: "Een maandlimiet, met een melding bij 80%.", to: "/settings/ai/limits" },
					]}
				/>
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title="Wat Insyte deed"
				meta={`${today.n} vandaag · ${today.undone} ongedaan gemaakt · ${today.failed} mislukt`}
				actions={
					<button
						type="button"
						onClick={() => void navigate({ to: "/settings/ai/autonomy" })}
						className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs transition-colors hover:field-hover"
					>
						<Sparkles className="size-3.5" strokeWidth={1.75} />
						Zelfstandigheid
					</button>
				}
			/>
			<div className="min-w-0 px-5 pb-6">
				<DataTable
					columns={columns}
					data={entries}
					facets={FACETS}
					noun={["agent action", "agent-actions"]}
					label={["actie", "acties"]}
					getRowId={(e) => e.id}
					pageSize={25}
					searchPlaceholder="Acties zoeken"
					initialVisibility={{ kind: false, action: false, undoable: false, setting: false, trigger: false }}
					initialSorting={[{ id: "at", desc: true }]}
					onRowClick={(e) => setOpenId(e.id)}
					empty={<EmptyState kind="activity" title="Geen acties voor deze filters." body="Pas de filters aan, of kijk bij alle acties." />}
				/>
			</div>
			<AgentLogDrawer
				e={open}
				onClose={() => {
					setOpenId(null);
					if (search.row) void navigate({ to: "/ask/activity", search: { view: search.view } });
				}}
			/>
			<PageGuide id="ask.activity" title="Wat Insyte deed" steps={GUIDE} />
			{/* Keeps the windows counting down in the table's cells. */}
			<span hidden>{now}</span>
		</div>
	);
}

function fmtTime(iso: string) {
	const d = new Date(iso);
	const today = new Date();
	const same = d.toDateString() === today.toDateString();
	return new Intl.DateTimeFormat("nl-NL", same ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}
