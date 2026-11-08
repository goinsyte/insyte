import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertOctagon, AlertTriangle, Archive, CheckCircle2, ChevronDown, Clock, Copy, CornerDownLeft, LayoutList, Plus, Square, Trash2 } from "../../icons";
import { useCallback, useMemo, useState } from "react";
import { useOnCreate } from "../stores/create-intent";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import {
	DataTable,
	type Facet,
	facetFilter,
	type RowAction,
} from "../table/data-table";
import { copyLines, counted, patchMany } from "../lib/bulk";
import { personStyle } from "../lib/person-color";
import {
	NewTicketDialog,
	type NewTicketInput,
} from "./new-ticket-dialog";
import { TicketBoard } from "./ticket-board";
import { FilterButton, FilterChips } from "../filters/filter-bar";
import { useListFilter } from "../filters/use-list-filter";
import { type FilterField, matches } from "../lib/filter";
import { isAssignedTo, ME } from "../lib/assignees";
import { SourceMark } from "./source-mark";
import { inView, SOURCE, sourceOf, type TicketView, VIEW_LABEL } from "../lib/ticket-source";
import { TicketModal } from "./ticket-modal";
import { ticketsStore, useTickets } from "./tickets-store";
import type { Ticket, TicketStatus } from "../lib/types/domain";
import { DemoAreaEmpty as AreaEmpty } from "../marketing-sections/closings";
import { ListClosing } from "../marketing-sections/closings";
import { cn } from "../lib/utils";

const Route = Object.assign(getRouteApi("/_admin/tickets/"), { fullPath: "/tickets/" } as const);

type ViewMode = "board" | "list";

/** The three tickets an operator writes most, started rather than written from nothing. */
const TEMPLATES: Record<"refund" | "supplier" | "feedback", Partial<NewTicketInput>> = {
	refund: {
		title: "Verzoek om terugbetaling · ",
		description: "De klant vraagt om een terugbetaling. Controleer of de bestelling binnen de retourtermijn valt en of het artikel terug is, betaal dan terug en antwoord de klant.",
		priority: "medium",
		tags: ["Terugbetaling"],
	},
	supplier: {
		title: "Vertraging bij leverancier · ",
		description: "Een bestelling is over de overdrachtsdatum heen. Vraag de leverancier om een verzenddatum en track & trace, en laat het de klant weten zodra je die hebt.",
		priority: "high",
		tags: ["Leverancier"],
	},
	feedback: {
		title: "Feedback van klant · ",
		description: "Feedback die het doorgeven waard is. Noteer wat er gezegd is, waar, en wie in het team het moet zien.",
		priority: "low",
		tags: ["Feedback"],
	},
};

export function TicketsPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const tickets = useTickets();
	const [mode, setView] = useState<ViewMode>("board");
	// One filter for both views, the same one the list's toolbar edits.
	const { filter, setFilter, saveView } = useListFilter("tickets");
	/* What the board and the list show: the view the area panel chose, the source if one was picked,
	   then the operator's own filter. */
	const ticketView: TicketView = search.view ?? "open";
	const shows = useMemo(
		() => (t: Ticket) =>
			inView(t, ticketView, (x) => isAssignedTo(x.assignee_ids, ME)) &&
			(search.source === undefined || sourceOf(t) === search.source) &&
			matches(t, filter, TICKET_FIELDS),
		[filter, ticketView, search.source],
	);
	const visible = useMemo(() => tickets.filter(shows), [tickets, shows]);
	// A board's columns are for tickets being worked; what is set aside reads as a list.
	const setAside = ticketView !== "open" && ticketView !== "mine" && ticketView !== "unassigned";
	const view: ViewMode = setAside ? "list" : mode;
	const [newOpen, setNewOpen] = useState(false);
	useOnCreate(
		"ticket",
		useCallback(() => {
			setTemplate(undefined);
			setNewOpen(true);
		}, []),
	);
	const [newDefaultStatus, setNewDefaultStatus] =
		useState<TicketStatus>("intake");
	const [template, setTemplate] = useState<Partial<NewTicketInput> | undefined>(undefined);
	const startFrom = (t?: Partial<NewTicketInput>) => {
		setTemplate(t);
		setNewDefaultStatus("intake");
		setNewOpen(true);
	};

	const openTicket = (id: string) =>
		navigate({ search: (s) => ({ ...s, ticket: id }) });
	const closeTicket = () =>
		navigate({ search: (s) => ({ ...s, ticket: undefined }) });

	function handleCreate(input: NewTicketInput) {
		const now = new Date().toISOString();
		const t: Ticket = {
			id: `ticket_new_${Date.now()}`,
			number: `TKT-${String(900 + tickets.length + 1).padStart(4, "0")}`,
			title: input.title,
			description: input.description,
			status: input.status,
			priority: input.priority,
			tags: input.tags,
			assignee_ids: input.assignee_ids,
			due_at: input.due_at,
			created_at: now,
			updated_at: now,
		};
		ticketsStore.add(t);
	}

	return (
		<div className="flex flex-col">
			<PageHeader
				title={search.source ? SOURCE[search.source].label : VIEW_LABEL[ticketView]}
				crumbs={ticketView === "open" && !search.source ? [] : [{ label: "Tickets", to: "/tickets" }]}
				meta={`${visible.length} ${visible.length === 1 ? "ticket" : "tickets"}`}
				actions={
					<div className="flex shrink-0 items-start gap-2.5">
						<div className={cn("flex h-8 items-center rounded-md bg-mist p-0.5", setAside && "hidden")}>
							<button
								type="button"
								onClick={() => setView("board")}
								className={cn(
									"flex h-7 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
									view === "board"
										? "bg-paper font-medium text-ink"
										: "font-medium text-ink-3 hover:text-ink",
								)}
							>
								<Square className="size-3.5" strokeWidth={1.75} />
								Bord
							</button>
							<button
								type="button"
								onClick={() => setView("list")}
								className={cn(
									"flex h-7 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
									view === "list"
										? "bg-paper font-medium text-ink"
										: "font-medium text-ink-3 hover:text-ink",
								)}
							>
								<LayoutList className="size-3.5" strokeWidth={1.75} />
								Lijst
							</button>
						</div>
						<div className="flex h-8 items-center overflow-hidden rounded-md bg-abyss text-mesh-ink shadow-primary">
							<button
								type="button"
								onClick={() => {
									setNewDefaultStatus("intake");
									setNewOpen(true);
								}}
								className="flex h-full items-center gap-1.5 px-2.5 transition-colors hover:bg-mesh-ink/12"
							>
								<Plus className="size-3.5" strokeWidth={2} />
								<span className="font-medium text-xs">Nieuw ticket</span>
							</button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										aria-label="Meer sjablonen"
										className="flex h-full w-7 items-center justify-center border-mesh-ink/10 border-l hover:bg-mesh-ink/12"
									>
										<ChevronDown className="size-4" strokeWidth={2} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<DropdownMenuLabel>Sjablonen</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => startFrom()}>Leeg ticket</DropdownMenuItem>
									<DropdownMenuItem onClick={() => startFrom(TEMPLATES.refund)}>Verzoek om terugbetaling</DropdownMenuItem>
									<DropdownMenuItem onClick={() => startFrom(TEMPLATES.supplier)}>Escalatie naar leverancier</DropdownMenuItem>
									<DropdownMenuItem onClick={() => startFrom(TEMPLATES.feedback)}>Feedback van klant</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				}
			/>
			<div className="flex flex-col gap-6 px-5 py-6">
				{tickets.length === 0 ? (
					<AreaEmpty area="tickets" />
				) : view === "board" ? (
					<div className="-mb-3 flex flex-col gap-2">
						<div className="flex items-center gap-1.5">
							<FilterButton fields={TICKET_FIELDS} rows={tickets} value={filter} onChange={setFilter} onSaveView={saveView} />
						</div>
						<FilterChips fields={TICKET_FIELDS} rows={tickets} value={filter} onChange={setFilter} />
					</div>
				) : null}
				{tickets.length === 0 ? null : view === "board" ? (
					<TicketBoard
						shows={shows}
						onCardClick={openTicket}
						onNewInColumn={(s) => {
							setNewDefaultStatus(s);
							setNewOpen(true);
						}}
					/>
				) : (
					<TicketList onRowClick={openTicket} tickets={visible} empty={setAside ? SET_ASIDE_EMPTY[ticketView as keyof typeof SET_ASIDE_EMPTY] : undefined} />
				)}

				<TicketModal
					ticketId={search.ticket ?? null}
					onClose={closeTicket}
					onUpdate={(t) => ticketsStore.update(t.id, t)}
				/>

				<NewTicketDialog
					open={newOpen}
					onOpenChange={setNewOpen}
					defaultStatus={newDefaultStatus}
					template={template}
					onCreate={handleCreate}
				/>
			</div>
			<ListClosing area="tickets" empty={tickets.length === 0} />
		</div>
	);
}

/** What an empty set-aside view says: what lands there, and how it comes back. */
const SET_ASIDE_EMPTY = {
	snoozed: { title: "Niets uitgesteld.", body: "Een uitgesteld ticket komt vanzelf terug op het moment dat je kiest." },
	done: { title: "Nog niets klaar.", body: "Tickets die naar Klaar gaan, staan hier, nieuwste eerst." },
	archived: { title: "Niets gearchiveerd.", body: "Gearchiveerde tickets staan hier en zijn terug te halen." },
	spam: { title: "Geen spam.", body: "Tickets die je als spam meldt, staan hier." },
	trash: { title: "De prullenbak is leeg.", body: "Selecteer een ticket en kies Nu terugzetten om het te herstellen." },
} as const;

function TicketList({
	tickets,
	onRowClick,
	empty,
}: {
	tickets: Ticket[];
	onRowClick: (id: string) => void;
	empty?: { title: string; body: string };
}) {
	const columns = useMemo<Array<ColumnDef<Ticket, unknown>>>(
		() => [
			{
				id: "number",
				accessorKey: "number",
				header: "Ticket",
				size: 112,
				enableHiding: false,
				cell: (c) => (
					<span className="flex items-center gap-2">
						<SourceMark source={sourceOf(c.row.original)} />
						<span className="font-medium text-ink">{c.row.original.number}</span>
					</span>
				),
			},
			{ id: "source", accessorFn: (t) => SOURCE[sourceOf(t)].label, header: "Bron", size: 130 },
			{
				id: "title",
				accessorKey: "title",
				header: "Titel",
				cell: (c) => (
					<span className="block max-w-[420px] truncate text-ink">
						{c.row.original.title}
					</span>
				),
			},
			{
				id: "assignee",
				accessorFn: (t) => t.assignee_ids.join(", "),
				header: "Toegewezen aan",
				size: 160,
				cell: (c) => (
					<span className="flex items-center gap-1">
						{c.row.original.assignee_ids.map((id) => (
							<span
								key={id}
								className="flex size-5 items-center justify-center rounded-full font-medium text-2xs"
								style={personStyle(id)}
							>
								{id.slice(0, 2).toUpperCase()}
							</span>
						))}
					</span>
				),
			},
			{
				id: "status",
				accessorKey: "status",
				header: "Status",
				size: 136,
				filterFn: facetFilter,
				cell: (c) => STATUS_LABEL[c.row.original.status],
			},
			{
				id: "priority",
				accessorKey: "priority",
				header: "Prioriteit",
				size: 96,
				filterFn: facetFilter,
				cell: (c) => {
					const prio = PRIORITY[c.row.original.priority];
					return (
						<span
							className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
							style={{ backgroundColor: prio.bg, color: prio.fg }}
						>
							{prio.label}
						</span>
					);
				},
			},
			{
				id: "updated",
				accessorKey: "updated_at",
				header: "Bijgewerkt",
				size: 124,
				cell: (c) => (
					<span className="tabular-nums">
						{new Intl.DateTimeFormat("nl-NL", {
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						}).format(new Date(c.row.original.updated_at))}
					</span>
				),
			},
		],
		[],
	);

	return (
		<DataTable
			columns={columns}
			data={tickets}
			facets={TICKET_FACETS}
			actions={TICKET_ACTIONS}
			noun={["ticket", "tickets"]}
			getRowId={(t) => t.id}
			searchPlaceholder="Tickets zoeken"
			initialSorting={[{ id: "updated", desc: true }]}
			onRowClick={(t) => onRowClick(t.id)}
			empty={
				<EmptyState
					kind="tickets"
					title={empty?.title ?? "Geen tickets voor deze filters."}
					body={empty?.body ?? "Pas de filters aan of wis ze."}
				/>
			}
		/>
	);
}

const PRIORITY: Record<string, { bg: string; fg: string; label: string }> = {
	high: { bg: "var(--signal-red-bg)", fg: "var(--signal-red)", label: "Hoog" },
	medium: {
		bg: "var(--signal-amber-bg)",
		fg: "var(--signal-amber)",
		label: "Gemiddeld",
	},
	low: {
		bg: "var(--signal-green-bg)",
		fg: "var(--signal-green)",
		label: "Laag",
	},
};

const STATUS_LABEL: Record<string, string> = {
	intake: "Nieuw",
	in_progress: "Bezig",
	awaiting_reply: "Wacht op antwoord",
	done: "Klaar",
};

const moveTo = (status: TicketStatus) => (rows: Array<Ticket>) =>
	patchMany(
		"tickets",
		rows.map((t) => t.id),
		(t) => ({ ...t, status }),
		`${counted(rows.length, "ticket", "tickets")} verplaatst naar ${STATUS_LABEL[status]?.toLowerCase()}`,
	);

/* The selection bar's actions on tickets: the board's columns as moves, priority, and archive —
   every one of them taken back with one Undo. */
const TICKET_ACTIONS: ReadonlyArray<RowAction<Ticket>> = [
	{
		id: "done",
		needs: { perm: "support", arg: 2 },
		label: "Markeren als klaar",
		icon: CheckCircle2,
		group: "Verplaatsen naar",
		shortcut: "x",
		bar: true,
		applies: (t) => t.status !== "done",
		run: moveTo("done"),
	},
	{
		id: "progress",
		needs: { perm: "support", arg: 2 },
		label: "Bezig",
		icon: Clock,
		group: "Verplaatsen naar",
		applies: (t) => t.status !== "in_progress",
		run: moveTo("in_progress"),
	},
	{
		id: "awaiting",
		needs: { perm: "support", arg: 2 },
		label: "Wacht op antwoord",
		icon: Clock,
		group: "Verplaatsen naar",
		applies: (t) => t.status !== "awaiting_reply",
		run: moveTo("awaiting_reply"),
	},
	{
		id: "high",
		needs: { perm: "support", arg: 2 },
		label: "Prioriteit hoog",
		icon: AlertTriangle,
		group: "Prioriteit",
		shortcut: "h",
		bar: true,
		applies: (t) => t.priority !== "high",
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, priority: "high" }),
				`${counted(rows.length, "ticket", "tickets")} op prioriteit hoog gezet`,
			),
	},
	{
		id: "medium",
		needs: { perm: "support", arg: 2 },
		label: "Prioriteit gemiddeld",
		group: "Prioriteit",
		applies: (t) => t.priority !== "medium",
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, priority: "medium" }),
				`${counted(rows.length, "ticket", "tickets")} op prioriteit gemiddeld gezet`,
			),
	},
	{
		id: "copy",
		label: "Ticketnummers kopiëren",
		icon: Copy,
		group: "Exporteren",
		shortcut: "c",
		run: (rows) => copyLines(rows.map((t) => `${t.number} ${t.title}`), counted(rows.length, "ticket", "tickets")),
	},
	{
		id: "archive",
		needs: { perm: "support", arg: 2 },
		label: "Archiveren",
		icon: Archive,
		group: "Opruimen",
		destructive: true,
		applies: (t) => t.archived_at === undefined && t.deleted_at === undefined,
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, archived_at: new Date().toISOString() }),
				`${counted(rows.length, "ticket", "tickets")} gearchiveerd`,
			),
	},
	{
		id: "spam",
		needs: { perm: "support", arg: 2 },
		label: "Melden als spam",
		icon: AlertOctagon,
		group: "Opruimen",
		destructive: true,
		applies: (t) => t.spam_at === undefined && t.deleted_at === undefined,
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, spam_at: new Date().toISOString() }),
				`${counted(rows.length, "ticket", "tickets")} gemeld als spam`,
			),
	},
	{
		id: "trash",
		needs: { perm: "support", arg: 3 },
		label: "Naar prullenbak",
		icon: Trash2,
		group: "Opruimen",
		destructive: true,
		applies: (t) => t.deleted_at === undefined,
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, deleted_at: new Date().toISOString() }),
				`${counted(rows.length, "ticket", "tickets")} naar de prullenbak`,
			),
	},
	{
		id: "snooze",
		needs: { perm: "support", arg: 2 },
		label: "Uitstellen tot morgen",
		icon: Clock,
		group: "Later",
		shortcut: "z",
		applies: (t) => t.archived_at === undefined && t.status !== "done",
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, snoozed_until: new Date(Date.now() + 86_400_000).toISOString() }),
				`${counted(rows.length, "ticket", "tickets")} uitgesteld tot morgen`,
			),
	},
	{
		id: "wake",
		needs: { perm: "support", arg: 2 },
		label: "Nu terugzetten",
		icon: CornerDownLeft,
		group: "Later",
		applies: (t) => t.snoozed_until !== undefined || t.archived_at !== undefined || t.deleted_at !== undefined || t.spam_at !== undefined,
		run: (rows) =>
			patchMany(
				"tickets",
				rows.map((t) => t.id),
				(t) => ({ ...t, snoozed_until: undefined, archived_at: undefined, deleted_at: undefined, spam_at: undefined }),
				`${counted(rows.length, "ticket", "tickets")} terug op het bord`,
			),
	},
];

/* The board's filter fields; the list derives the same ones from its columns. */
const TICKET_FIELDS: ReadonlyArray<FilterField<Ticket>> = [
	{
		id: "status",
		label: "Status",
		type: "option",
		options: [
			{ value: "intake", label: "Nieuw" },
			{ value: "in_progress", label: "Bezig" },
			{ value: "awaiting_reply", label: "Wacht op antwoord" },
			{ value: "done", label: "Klaar" },
		],
		get: (t) => t.status,
	},
	{
		id: "priority",
		label: "Prioriteit",
		type: "option",
		options: [
			{ value: "high", label: "Hoog" },
			{ value: "medium", label: "Gemiddeld" },
			{ value: "low", label: "Laag" },
		],
		get: (t) => t.priority,
	},
	{ id: "title", label: "Titel", type: "text", get: (t) => t.title },
	{
		id: "source",
		label: "Bron",
		type: "option",
		options: (Object.keys(SOURCE) as Array<keyof typeof SOURCE>).map((k) => ({ value: SOURCE[k].label, label: SOURCE[k].label })),
		get: (t) => SOURCE[sourceOf(t)].label,
	},
	{ id: "assignee", label: "Toegewezen aan", type: "text", get: (t) => t.assignee_ids.join(", ") },
	{ id: "tag", label: "Label", type: "option", get: (t) => t.tags[0] ?? "" },
	{ id: "updated", label: "Bijgewerkt", type: "date", get: (t) => t.updated_at },
];

const TICKET_FACETS: ReadonlyArray<Facet> = [
	{
		id: "status",
		label: "Status",
		options: [
			{ value: "intake", label: "Nieuw" },
			{ value: "in_progress", label: "Bezig" },
			{ value: "awaiting_reply", label: "Wacht op antwoord" },
			{ value: "done", label: "Klaar" },
		],
	},
	{
		id: "priority",
		label: "Prioriteit",
		options: [
			{ value: "high", label: "Hoog" },
			{ value: "medium", label: "Gemiddeld" },
			{ value: "low", label: "Laag" },
		],
	},
];
