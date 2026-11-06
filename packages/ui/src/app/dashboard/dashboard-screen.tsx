import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "../../icons";
import {
	PlateEmpty,
	type PlatePhase,
	PlateView,
} from "./plate";
import { ActivityFeed } from "./activity";
import { Agenda } from "./agenda";
import { Areas } from "./areas";
import { DashboardClosing } from "../marketing-sections/closings";
import { FirstRun } from "./first-run";
import { HomeBoard } from "./home-board";
import { Hero } from "./hero";
import { MyWork } from "./my-work";
import { Pulse } from "./pulse";
import {
	AddCardMenu,
	CustomizeButton,
	EditTools,
	RefreshControl,
	ViewTabs,
	WindowMenu,
} from "./toolbar";
import { useDay } from "./use-day";
import { groupOf } from "../lib/home/day";
import { dayKey } from "../lib/home/dates";
import { hasHistory } from "../lib/home/pulse";
import { SCENARIO } from "../../data-source";
import { type HomeView, useHome } from "../stores/home-store";
import { useLiveFeed } from "../stores/live-store";
import { FilterButton, FilterChips } from "../filters/filter-bar";
import { useListFilter } from "../filters/use-list-filter";
import { applyFilter, type FilterField } from "../lib/filter";
import type { Signal } from "../../data-source";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import {
	isDrawn,
	isNeedsYou,
	type QueueItem as QueueRow,
	useWorkspace,
} from "../stores/workspace-store";
import { KpiStrip } from "../loading/page-skeletons";
import { Stream } from "../loading/stream";

const Route = Object.assign(getRouteApi("/_admin/dashboard"), { fullPath: "/dashboard" } as const);

type QueueFilterId = "needs-you" | "drawn" | "everything";

/* What the queue can be filtered by. The row's kind is the first word of what happened, which is
   how the queue already writes it: "Chargeback DSP-2214 …", "Supplier Linyi …". */
const SIGNAL_LABEL: Record<Signal, string> = { red: "Binnen enkele uren", amber: "Vandaag", green: "Op schema", idle: "Geen deadline" };
const QUEUE_FIELDS: ReadonlyArray<FilterField<QueueRow>> = [
	{
		id: "signal",
		label: "Urgentie",
		type: "option",
		options: (Object.keys(SIGNAL_LABEL) as Signal[]).map((v) => ({ value: v, label: SIGNAL_LABEL[v] })),
		get: (r) => r.signal,
	},
	{ id: "kind", label: "Soort", type: "option", get: (r) => r.title.split(" ")[0] ?? "" },
	{ id: "store", label: "Winkel", type: "option", get: (r) => r.store },
	{
		id: "drawn",
		label: "Voorstel",
		type: "option",
		options: [
			{ value: "yes", label: "Getekend door Insyte" },
			{ value: "no", label: "Jij moet beginnen" },
		],
		get: (r) => (r.plate ? "yes" : "no"),
	},
	{ id: "title", label: "Wat er gebeurde", type: "text", get: (r) => r.title },
	{
		id: "value",
		label: "Waarde",
		type: "number",
		get: (r) => Number.parseFloat(r.value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
	},
];

/** How long a filed plate stays on the board, stamped and slackened, before the next one draws. */
const SETTLE_MS = 900;

/**
 * The day, as one number and one queue.
 *
 * What was here: a drenched mesh hero, a four-tile KPI strip, and nine widgets in a two-column
 * masonry — the hero-metric-over-widget-wall dashboard that PRODUCT.md's own anti-reference list
 * already names. It answered "how is the business doing", which is a question an operator asks once
 * a month, and buried the one they ask every morning: what needs me before the day ends.
 *
 * So the screen is now that question. One figure, set in Archivo at 60px because it is the only
 * number on the page that matters. Beneath it the queue, dense and ranked by time left, 34px rows
 * banded `paper` / `mist` so the eye tracks across without a single rule being drawn. Selecting a row
 * floods it `abyss` and draws its plate on the right.
 *
 * And the queue WORKS. It used to be a picture of one: File it as drawn, Redraw and Discard had no
 * handlers, so the screen's whole premise — the operator decides and nothing changes until they do —
 * could not be acted on. Now filing stamps the plate, slackens its line, takes the row out of the
 * list and rolls the figure down, then draws the next row's plate, because triage is a run of
 * decisions and the board should already be on the next one. Every decision can be taken back for
 * six seconds. J and K move, E files, R redraws, D discards.
 *
 * The queue is the first widget on the home board (`home-board.tsx`), pinned top-left and two
 * columns wide, with the operator's own widgets packed around it. Selecting a row slides its plate in
 * over the right of the board; Escape puts it away.
 */
export function DashboardPage() {
	const queue = useWorkspace((s) => s.queue);
	const fileQueue = useWorkspace((s) => s.fileQueue);
	const discardQueue = useWorkspace((s) => s.discardQueue);
	const restoreQueue = useWorkspace((s) => s.restoreQueue);
	const redrawQueue = useWorkspace((s) => s.redrawQueue);
	const restoreChargeback = useWorkspace((s) => s.restoreChargeback);

	const still = useReducedMotion();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const storedView = useHome((s) => s.view);
	const setStoredView = useHome((s) => s.setView);
	const boardOnFirstDay = useHome((s) => s.boardOnFirstDay);
	const view: HomeView = search.view ?? storedView;
	const [editing, setEditing] = useState(false);
	const { now, moments, work } = useDay();
	useLiveFeed();
	const [filter, setFilter] = useState<QueueFilterId>("needs-you");
	// Starts null on purpose: see `PlateUnselected`. The first pick is what draws the plate.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// The decision just taken, held on the board for SETTLE_MS so it can be seen to have happened.
	const [settling, setSettling] = useState<{ id: string; phase: PlatePhase } | null>(null);

	const needsYou = queue.filter(isNeedsYou);
	const drawn = queue.filter(isDrawn);
	const filters: Array<{ id: QueueFilterId; label: string; count: number }> = [
		{ id: "needs-you", label: "Wacht op jou", count: needsYou.length },
		{ id: "drawn", label: "Getekend", count: drawn.length },
		{ id: "everything", label: "Alles", count: queue.length },
	];

	const { filter: refine, setFilter: setRefine, saveView } = useListFilter("queue");

	// A settling row stays in its list until it has been seen to settle, then the list closes over it.
	const rows = useMemo(() => {
		const keep = (q: QueueRow) => q.id === settling?.id;
		const tab =
			filter === "needs-you"
				? queue.filter((q) => isNeedsYou(q) || keep(q))
				: filter === "drawn"
					? queue.filter((q) => isDrawn(q) || keep(q))
					: queue;
		return applyFilter(tab, refine, QUEUE_FIELDS);
	}, [queue, filter, settling, refine]);

	const selected = rows.find((r) => r.id === selectedId) ?? null;

	/** The next row the operator has not decided yet, after `id` in the list they are working. */
	const nextAfter = useCallback(
		(id: string) => {
			const open = rows.filter((r) => r.state === "open" && r.id !== id);
			const at = rows.findIndex((r) => r.id === id);
			return open.find((r) => rows.indexOf(r) > at) ?? open[0] ?? null;
		},
		[rows],
	);

	const decide = useCallback(
		(row: QueueRow, phase: Exclude<PlatePhase, "drawn">) => {
			const cb =
				phase === "filed" && row.plate
					? useWorkspace.getState().chargebacks.find((c) => c.case_number === row.plate?.number)
					: undefined;
			const before = phase === "filed" ? fileQueue(row.id) : discardQueue(row.id);
			if (before === undefined) return;
			setSettling({ id: row.id, phase });
			const next = nextAfter(row.id);
			window.setTimeout(() => {
				setSettling(null);
				setSelectedId(next?.id ?? null);
			}, SETTLE_MS);
			undoable(
				phase === "filed"
					? `${row.plate?.number ?? "Regel"} uitgevoerd`
					: `${row.plate?.number ?? "Regel"} genegeerd`,
				() => {
					restoreQueue(row.id, before);
					if (cb) restoreChargeback(cb);
					setSelectedId(row.id);
				},
				phase === "filed" ? row.plate?.after.value : "Er is niets aan het record veranderd.",
			);
		},
		[fileQueue, discardQueue, restoreQueue, restoreChargeback, nextAfter],
	);

	// Arriving with `?row=` (from the agenda or My work) opens that row's plate on the board.
	useEffect(() => {
		if (!search.row) return;
		const row = queue.find((q) => q.id === search.row);
		if (row) {
			if (!isNeedsYou(row)) setFilter("everything");
			setSelectedId(row.id);
		}
		navigate({ search: (s) => ({ ...s, row: undefined }), replace: true });
	}, [search.row, queue, navigate]);

	const pickView = (v: HomeView) => {
		setStoredView(v);
		setEditing(false);
		navigate({ search: (s) => ({ ...s, view: v }) });
	};

	// The keyboard is how a queue is worked. Inert while typing, and while a dialog owns the keys.
	useEffect(() => {
		if (view !== "overzicht") return;
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
			const open = rows.filter((r) => r.state === "open");
			const at = open.findIndex((r) => r.id === selectedId);
			const k = e.key.toLowerCase();
			if (e.key === "Escape" && selectedId !== null) {
				setSelectedId(null);
			} else if (k === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedId((open[at + 1] ?? open[0])?.id ?? null);
			} else if (k === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedId((open[at - 1] ?? open[open.length - 1])?.id ?? null);
			} else if (selected && !settling) {
				if (k === "e" && selected.plate) decide(selected, "filed");
				else if (k === "d" || e.key === "Backspace") decide(selected, "discarded");
				else if (k === "r" && selected.plate) redrawQueue(selected.id);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [view, rows, selectedId, selected, settling, decide, redrawQueue]);

	const phase: PlatePhase = settling && settling.id === selected?.id ? settling.phase : "drawn";

	const queueFilter = (
		<FilterButton
			fields={QUEUE_FIELDS}
			rows={queue}
			value={refine}
			onChange={(g) => {
				setRefine(g);
				setSelectedId(null);
			}}
			onSaveView={saveView}
			tone="mesh"
		/>
	);
	const queueChips = (
		<FilterChips fields={QUEUE_FIELDS} rows={queue} value={refine} onChange={setRefine} tone="mesh" className="px-4 pb-2" />
	);

	const queueBody = (
		<div className="-mx-4 -mb-4 flex min-h-0 flex-col">
			<div className="flex items-center gap-1 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Filter wachtrij">
				{filters.map((f) => {
					const on = f.id === filter;
					return (
						<button
							key={f.id}
							type="button"
							role="tab"
							aria-selected={on}
							onClick={() => {
								setFilter(f.id);
								// Changing filter clears the selection rather than guessing a new
								// one: the plate beside it belongs to a row the operator chose.
								setSelectedId(null);
							}}
							className={cn(
								"relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-base transition-colors",
								on ? "font-medium text-mesh-ink" : "text-mesh-ink-2 hover:bg-white/8 hover:text-mesh-ink",
							)}
						>
							{on ? (
								<motion.span
									layoutId="queue-filter"
									className="absolute inset-0 rounded-md bg-white/14"
									transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
									aria-hidden
								/>
							) : null}
							<span className="relative">{f.label}</span>
							<span className="relative tabular-nums opacity-70">{f.count}</span>
						</button>
					);
				})}
				<div className="ml-auto">{queueFilter}</div>
			</div>
			{queueChips}

			<div className="flex h-6 items-center gap-3.5 px-4 text-sm text-mesh-ink-2" role="presentation">
				<span className="w-[7px] shrink-0" />
				<span className="min-w-0 flex-1">Wat er gebeurde</span>
				<span className="hidden w-[116px] shrink-0 md:block">Winkel</span>
				<span className="hidden w-[88px] shrink-0 sm:block">Waarde</span>
				<span className="w-[66px] shrink-0">Resterend</span>
			</div>

			<div className="flex min-h-0 flex-1 flex-col" role="listbox" aria-label="Zaken die op jou wachten" tabIndex={-1}>
				<AnimatePresence initial={false}>
					{rows.map((row, i) => (
						<QueueItem
							key={row.id}
							row={row}
							banded={i % 2 === 0}
							selected={row.id === selected?.id}
							onSelect={() => setSelectedId(row.id)}
						/>
					))}
				</AnimatePresence>
				<p className="px-4 pt-3 pb-4 text-sm text-mesh-ink-2" role="presentation">
					{rows.length === 0
						? "Niets gevonden. Nieuwe zaken verschijnen bovenaan."
						: "Dat is alles. Nieuwe zaken verschijnen bovenaan."}
				</p>
			</div>
		</div>
	);

	const today = dayKey(now);
	const dueToday = work.filter((w) => {
		const g = groupOf(w, now);
		return g === "late" || g === "today";
	}).length;
	const ahead = moments.filter((m) => !m.allDay && dayKey(m.at) === today && m.at > now).length;
	const firstDay = SCENARIO === "empty" && !boardOnFirstDay;

	return (
		<>
			<section aria-label="Start" className="min-h-full shrink-0 bg-glacier px-4 pt-5 pb-12 sm:px-6">
				<header className="flex flex-col gap-3">
					<Hero needsYou={needsYou.length} />
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<ViewTabs view={view} onView={pickView} counts={{ werk: dueToday, agenda: ahead }} />
						<div className="ml-auto flex flex-wrap items-center gap-1">
							{view === "overzicht" && !firstDay ? (
								editing ? (
									<>
										<EditTools />
										<AddCardMenu />
									</>
								) : (
									<>
										<RefreshControl />
										<WindowMenu />
									</>
								)
							) : (
								<RefreshControl />
							)}
							{view === "overzicht" && !firstDay ? (
								<>
									<CustomizeButton editing={editing} onEditing={setEditing} />
									{editing ? null : <AddCardMenu />}
								</>
							) : null}
						</div>
					</div>
				</header>

				<div role="tabpanel" id={`home-panel-${view}`} aria-labelledby={`home-tab-${view}`} className="mt-4">
					{view === "overzicht" ? (
						firstDay ? (
							<FirstRun />
						) : (
							<div className="flex flex-col gap-4">
								{hasHistory() ? (
									<Stream id="dash:pulse" after={560} fallback={<KpiStrip />} reserve>
										<Pulse />
									</Stream>
								) : null}
								<HomeBoard editing={editing} onEditing={setEditing} slots={{ queue: queueBody }} />
								<Areas />
								<DashboardClosing />
							</div>
						)
					) : view === "werk" ? (
						<div className="mx-auto max-w-[1080px]">
							<MyWork />
						</div>
					) : view === "agenda" ? (
						<Agenda />
					) : (
						<div className="mx-auto max-w-[1080px]">
							<ActivityFeed />
						</div>
					)}
				</div>
			</section>

			{/*
			 * The plate, as a panel over the right of the board rather than a column beside the queue.
			 * It is not modal: the queue stays clickable behind it, so moving down the list redraws it,
			 * and J K E R D keep working. Escape, or the close button, puts it away.
			 */}
			<AnimatePresence>
				{selected && view === "overzicht" ? (
					<motion.div
						key="plate"
						initial={still ? false : { x: 460, opacity: 0.6 }}
						animate={{ x: 0, opacity: 1 }}
						exit={still ? { opacity: 0 } : { x: 460, opacity: 0.6, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
						transition={{ type: "spring", stiffness: 380, damping: 38 }}
						className="fixed top-12 right-0 bottom-0 z-30 flex w-full shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.45)] sm:w-[436px]"
					>
						<button
							type="button"
							onClick={() => setSelectedId(null)}
							aria-label="Voorstel sluiten"
							className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-md text-mesh-ink-2 transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink"
						>
							<X className="size-4" strokeWidth={2} />
						</button>
						{selected.plate ? (
							<PlateView
								plate={selected.plate}
								drawing={selected.redraws}
								phase={phase}
								onFile={() => decide(selected, "filed")}
								onRedraw={() => redrawQueue(selected.id)}
								onDiscard={() => decide(selected, "discarded")}
							/>
						) : (
							<PlateEmpty onDismiss={() => decide(selected, "discarded")} settling={phase !== "drawn"} />
						)}
					</motion.div>
				) : null}
			</AnimatePresence>
		</>
	);
}

const DOT: Record<Signal, string> = {
	red: "bg-signal-red",
	amber: "bg-signal-amber",
	green: "bg-signal-green",
	idle: "bg-ink-4",
};

/* On the mesh the signal colours are too dark to read and their tonal backgrounds too pale to tell
   apart, so a waiting row's dot is its signal lifted toward white; the selected row is paper again
   and takes the full colour. */
const DOT_ON_MESH: Record<Signal, string> = {
	red: "bg-[color-mix(in_oklch,var(--signal-red)_70%,white)]",
	amber: "bg-[color-mix(in_oklch,var(--signal-amber)_60%,white)]",
	green: "bg-[color-mix(in_oklch,var(--signal-green)_65%,white)]",
	idle: "bg-mesh-ink-3",
};

/**
 * One row. Selected is a flood to `abyss` — the same thing the rail's active tile does — never a
 * ring, never a left border, never a tint that has to compete with the signal dot.
 */
function QueueItem({
	row,
	banded,
	selected,
	onSelect,
}: {
	row: QueueRow;
	banded: boolean;
	selected: boolean;
	onSelect: () => void;
}) {
	const still = useReducedMotion();
	const done = row.state !== "open";
	return (
		<motion.button
			layout={still ? false : "position"}
			// Leaving is closing: the row folds to nothing and the rows below rise into its place.
			exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
			transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
			type="button"
			role="option"
			aria-selected={selected}
			onClick={onSelect}
			className={cn(
				"flex h-[34px] w-full shrink-0 cursor-pointer items-center gap-3.5 overflow-hidden px-4 text-left text-base transition-colors duration-[80ms]",
				selected
					? "bg-paper text-ink"
					: cn(banded && "bg-white/[0.05]", done ? "text-mesh-ink-2" : "text-mesh-ink", "hover:bg-white/10"),
			)}
		>
			<span
				className={cn(
					"size-[7px] shrink-0 rounded-full transition-opacity duration-[240ms]",
					selected ? DOT[row.signal] : DOT_ON_MESH[row.signal],
					// Filing slackens the row: it loses its dot, the one mark that said it was waiting.
					done && "opacity-0",
				)}
				aria-hidden
			/>
			<span className={cn("min-w-0 flex-1 truncate", done && !selected && "line-through decoration-mesh-ink-3")}>
				{row.title}
			</span>
			<span
				className={cn(
					"hidden w-[116px] shrink-0 truncate tabular-nums md:block",
					selected ? "text-ink-2" : "text-mesh-ink-2",
				)}
			>
				{row.store}
			</span>
			<span
				className={cn(
					"hidden w-[88px] shrink-0 tabular-nums sm:block",
					selected ? "text-ink-2" : "text-mesh-ink-2",
				)}
			>
				{row.value}
			</span>
			<span
				className={cn(
					"w-[66px] shrink-0 tabular-nums",
					selected ? "text-ink-2" : "text-mesh-ink-2",
				)}
			>
				{done ? (row.state === "filed" ? "uitgevoerd" : "—") : row.due}
			</span>
		</motion.button>
	);
}
