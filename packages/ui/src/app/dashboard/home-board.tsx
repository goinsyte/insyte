import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	MeasuringStrategy,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import {
	ArrowUpRight,
	GripVertical,
	LayoutTemplate,
	MoreHorizontal,
	Trash2,
} from "../../icons";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Layout, Responsive, useContainerWidth } from "react-grid-layout";
import { Glyph, type GlyphTile } from "../common/glyph";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import {
	type BoardEngine,
	type GridBox,
	type PlacedWidget,
	useHome,
	type WidgetId,
	type WidgetSize,
	type WidgetTone,
} from "../stores/home-store";
import { MeshGround } from "./mesh-ground";
import { WIDGETS } from "./widgets";
import { WidgetBones } from "../loading/page-skeletons";
import { Stream } from "../loading/stream";

/**
 * Home, as one board the operator arranges.
 *
 * Everything on it is a widget, the queue included, and every widget can be moved, resized,
 * recoloured or taken off. Two engines lay the same widgets out, and Customize offers both because
 * they answer different habits:
 *
 *   - **Masonry** packs widgets in their order at their natural height, in one to three columns,
 *     with no holes. Dragging one reflows the board live underneath it, so the operator sees where it
 *     will land before letting go. Width is one, two or three columns; height is whatever the
 *     content is.
 *   - **Grid** is a free 12-column board, as in ClickUp's dashboards: drag a widget anywhere, pull
 *     its corner to any width and height, and the rest make room. A widget taller than its box
 *     scrolls inside it.
 *
 * Grounds mix on purpose — white, the light Arc tint, grey, and the queue on the brand's glow — so
 * a board of nine widgets reads as nine things and not one grid of identical cards.
 *
 * The tools that change it — Customize, Kaart toevoegen, the engine, Reset — sit in the home's view
 * row (`toolbar.tsx`), so the board is only the board. Leaving edit mode is the save; the
 * arrangement persists in this browser.
 */
export function HomeBoard({ editing, onEditing, slots }: { editing: boolean; onEditing: (v: boolean) => void; slots: Partial<Record<WidgetId, ReactNode>> }) {
	const widgets = useHome((s) => s.widgets);
	const engine = useHome((s) => s.engine);

	return widgets.length === 0 ? (
		<EmptyBoard onRestore={() => onEditing(false)} />
	) : engine === "grid" ? (
		<GridBoard editing={editing} slots={slots} />
	) : (
		<MasonryBoard editing={editing} slots={slots} />
	);
}

function EmptyBoard({ onRestore }: { onRestore: () => void }) {
	const reset = useHome((s) => s.reset);
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-paper px-6 py-14 text-center">
			<Glyph icon={LayoutTemplate} tile="mist" size={18} draw={false} />
			<p className="text-base text-ink-2">Je bord is leeg.</p>
			<button
				type="button"
				onClick={() => {
					reset();
					onRestore();
				}}
				className="flex h-9 cursor-pointer items-center rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
			>
				Standaardwidgets terugzetten
			</button>
		</div>
	);
}

/* ─── Masonry ───────────────────────────────────────────────────────────── */

/*
 * True masonry, packed in script. CSS grid with row spans could not do it: a two-column widget
 * forces the cell beside it to wait for the next row, and `dense` then fills that hole with
 * whatever fits, which leaves gaps and shuffles the order. Here every widget, in the operator's
 * order, goes to the top of the shortest run of columns its width needs, so the columns stay level
 * and nothing is moved out of turn. Positions animate on a spring, which is also what makes the
 * board reflow visibly under a dragged widget.
 */
const GAP = 12;
/** Columns by the board's own width, not the window's: the panel and rail take their share first. */
const columnsFor = (width: number) => (width >= 1540 ? 4 : width >= 1100 ? 3 : width >= 680 ? 2 : 1);

type Placed = { x: number; y: number; w: number };

function pack(widgets: ReadonlyArray<PlacedWidget>, heights: Record<string, number>, width: number) {
	const cols = columnsFor(width);
	const col = (width - GAP * (cols - 1)) / cols;
	const tops = Array.from({ length: cols }, () => 0);
	const out: Record<string, Placed> = {};
	for (const w of widgets) {
		// "Volledige breedte" is the whole row however many columns the board has.
		const span = w.size === 3 ? cols : Math.min(w.size, cols);
		let best = 0;
		let bestTop = Number.POSITIVE_INFINITY;
		for (let c = 0; c + span <= cols; c++) {
			const top = Math.max(...tops.slice(c, c + span));
			if (top < bestTop) {
				bestTop = top;
				best = c;
			}
		}
		out[w.id] = { x: best * (col + GAP), y: bestTop, w: span * col + (span - 1) * GAP };
		const bottom = bestTop + (heights[w.id] ?? 280) + GAP;
		for (let c = best; c < best + span; c++) tops[c] = bottom;
	}
	return { places: out, height: Math.max(0, ...tops) - GAP };
}

/* The pointer decides where a widget goes; closest-centre only when the pointer is between two. */
const collide: CollisionDetection = (args) => {
	const hit = pointerWithin(args);
	return hit.length > 0 ? hit : closestCenter(args);
};

function MasonryBoard({ editing, slots }: { editing: boolean; slots: Partial<Record<WidgetId, ReactNode>> }) {
	const widgets = useHome((s) => s.widgets);
	const move = useHome((s) => s.move);
	const [dragging, setDragging] = useState<WidgetId | null>(null);
	const [width, setWidth] = useState(0);
	const [heights, setHeights] = useState<Record<string, number>>({});
	const board = useRef<HTMLDivElement>(null);
	// The last widget the held one swapped with, so hovering the slot it just left does not swap back.
	const lastSwap = useRef<{ id: string; at: number } | null>(null);

	useLayoutEffect(() => {
		const el = board.current;
		if (el === null) return;
		const fit = () => setWidth(el.getBoundingClientRect().width);
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const onHeight = useCallback((id: string, h: number) => {
		setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
	}, []);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	/* The board reflows while the widget is held: crossing another widget moves the held one into its
	   place in the order, and every widget slides to where that order puts it. */
	function onDragOver(e: DragOverEvent) {
		const over = e.over?.id;
		if (over === undefined || over === e.active.id) return;
		const now = performance.now();
		if (lastSwap.current?.id === over && now - lastSwap.current.at < 300) return;
		const from = widgets.findIndex((w) => w.id === e.active.id);
		const to = widgets.findIndex((w) => w.id === over);
		if (from < 0 || to < 0) return;
		lastSwap.current = { id: String(over), at: now };
		move(from, to);
	}

	const held = dragging ? widgets.find((w) => w.id === dragging) : undefined;
	const { places, height } = pack(widgets, heights, width);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collide}
			measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
			onDragStart={(e: DragStartEvent) => setDragging(e.active.id as WidgetId)}
			onDragOver={onDragOver}
			onDragEnd={() => {
				setDragging(null);
				lastSwap.current = null;
			}}
			onDragCancel={() => setDragging(null)}
		>
			<SortableContext items={widgets.map((w) => w.id)} strategy={() => null}>
				<div ref={board} className="relative" style={{ height }}>
					{/* No AnimatePresence here: it loses track of children that change order mid-drag and
					    leaves them parked at opacity 0. Removing a widget has Undo; it does not need an exit. */}
					{width > 0
						? widgets.map((w) => {
								const at = places[w.id];
								return at ? (
									<MasonryItem
										key={w.id}
										placed={w}
										at={at}
										measured={heights[w.id] !== undefined}
										onHeight={onHeight}
										editing={editing}
										content={slots[w.id]}
									/>
								) : null;
							})
						: null}
				</div>
			</SortableContext>
			{/* In a portal: the overlay is position-fixed, and a transformed ancestor in the shell would
			    otherwise make it fixed to that ancestor and leave it adrift of the pointer. */}
			{typeof document === "undefined"
				? null
				: createPortal(
						<DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
							{held ? (
								<div style={{ width: places[held.id]?.w }}>
									<WidgetFrame placed={held} editing engine="masonry" lifted content={slots[held.id]} />
								</div>
							) : null}
						</DragOverlay>,
						document.body,
					)}
		</DndContext>
	);
}

function MasonryItem({
	placed,
	at,
	measured,
	onHeight,
	editing,
	content,
}: {
	placed: PlacedWidget;
	at: Placed;
	/** Whether its height is known yet; until it is, it is placed but not shown. */
	measured: boolean;
	onHeight: (id: string, h: number) => void;
	editing: boolean;
	content: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
		id: placed.id,
		disabled: !editing,
	});
	const still = useReducedMotion();
	const body = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const el = body.current;
		if (el === null) return;
		const fit = () => onHeight(placed.id, Math.ceil(el.getBoundingClientRect().height));
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, [placed.id, onHeight]);

	/* A widget's first placement is instant (`initial={false}`); every later one — a reflow, a resize,
	   a drag passing over it — travels there. */
	const spring = { type: "spring", stiffness: 380, damping: 38, mass: 0.8 } as const;
	return (
		<motion.div
			ref={setNodeRef}
			className="absolute"
			// Unmeasured, it is placed but not shown, so the first paint is the packed board.
			style={{ visibility: measured ? "visible" : "hidden" }}
			initial={false}
			/* Placed by left/top, not a transform: dnd-kit measures droppables with transforms ignored,
			   so a translated widget would be found at the board's corner. */
			animate={{ left: at.x, top: at.y, width: at.w }}
			transition={still ? { duration: 0 } : spring}
		>
			<div ref={body} className={cn("transition-opacity duration-150", isDragging && "opacity-0")}>
				<WidgetFrame
					placed={placed}
					editing={editing}
					engine="masonry"
					content={content}
					handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }}
				/>
			</div>
			{isDragging ? (
				<div
					aria-hidden
					className="absolute inset-0 rounded-xl bg-arc/8 outline-2 outline-arc/45 outline-dashed -outline-offset-2"
				/>
			) : null}
		</motion.div>
	);
}

/* ─── Grid ──────────────────────────────────────────────────────────────── */

const GRID_BREAKPOINTS = { lg: 1024, sm: 0 };
const GRID_COLS = { lg: 12, sm: 1 };

function GridBoard({ editing, slots }: { editing: boolean; slots: Partial<Record<WidgetId, ReactNode>> }) {
	const widgets = useHome((s) => s.widgets);
	const grid = useHome((s) => s.grid);
	const setGrid = useHome((s) => s.setGrid);
	const { width, containerRef, mounted } = useContainerWidth();

	const placed = widgets.map((w) => {
		const box = grid.find((b) => b.i === w.id);
		return { ...(box ?? { i: w.id, x: 0, y: 999, w: w.size * 4, h: 9 }), minW: 3, minH: 5 };
	});

	function onLayoutChange(layout: Layout, all: Partial<Record<string, Layout>>) {
		/* Only the wide arrangement is the operator's. Below 1024px the grid stacks to one column,
		   which react-grid-layout derives from it, and a stacked layout must not overwrite it. */
		const wide = all.lg ?? (width >= GRID_BREAKPOINTS.lg ? layout : undefined);
		if (wide === undefined) return;
		const next: GridBox[] = wide.map((b) => ({ i: b.i as WidgetId, x: b.x, y: b.y, w: b.w, h: b.h }));
		const same =
			next.length === grid.length &&
			next.every((b) => {
				const g = grid.find((x) => x.i === b.i);
				return g !== undefined && g.x === b.x && g.y === b.y && g.w === b.w && g.h === b.h;
			});
		if (!same) setGrid(next);
	}

	return (
		<div ref={containerRef} className="-mx-1.5">
			{mounted ? (
				<Responsive
					width={width}
					layouts={{ lg: placed }}
					breakpoints={GRID_BREAKPOINTS}
					cols={GRID_COLS}
					rowHeight={28}
					margin={[12, 12]}
					containerPadding={[6, 0]}
					dragConfig={{ enabled: editing, handle: ".widget-drag", cancel: "button, a, input", threshold: 4 }}
					resizeConfig={{
						enabled: editing,
						handles: ["se"],
						handleComponent: (_axis, ref) => <ResizeGrip ref={ref as React.Ref<HTMLSpanElement>} />,
					}}
					onLayoutChange={onLayoutChange}
				>
					{widgets.map((w) => (
						<div key={w.id}>
							<WidgetFrame placed={w} editing={editing} engine="grid" content={slots[w.id]} fill />
						</div>
					))}
				</Responsive>
			) : null}
		</div>
	);
}

/* react-resizable wraps the grip in a DraggableCore, which clones it with its pointer handlers; they
   have to reach the element or the corner does nothing. */
function ResizeGrip({ ref, ...handlers }: { ref?: React.Ref<HTMLSpanElement> } & React.HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			{...handlers}
			ref={ref}
			aria-hidden
			className="react-resizable-handle absolute right-1 bottom-1 z-10 flex size-5 cursor-se-resize items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-ink/8 hover:text-ink"
		>
			<svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
				<path d="M9 3 3 9M9 6.5 6.5 9" />
			</svg>
		</span>
	);
}

/* ─── The frame ─────────────────────────────────────────────────────────── */

const TONES: ReadonlyArray<{ id: WidgetTone; label: string; swatch: string }> = [
	{ id: "paper", label: "Wit", swatch: "bg-paper ring-1 ring-ink/15" },
	{ id: "tint", label: "Lichtblauw", swatch: "bg-arc-tint ring-1 ring-arc/25" },
	{ id: "mist", label: "Grijs", swatch: "bg-mist ring-1 ring-ink/15" },
	{ id: "mesh", label: "Gloed", swatch: "bg-abyss" },
];

/*
 * What each card costs to fill, at the live pace (ADR-0028). The queue and the operator's own lists
 * are one indexed read and land first; the aggregates — revenue, bestsellers, countries — are a
 * sum over thirty days of orders and land last, which is the order the operator reads the board in.
 */
const WIDGET_COST: Partial<Record<WidgetId, number>> = {
	queue: 300,
	todo: 260,
	setup: 280,
	bookmarks: 300,
	recent: 360,
	today: 420,
	mytickets: 460,
	mentions: 480,
	chats: 500,
	live: 520,
	team: 540,
	tickets: 560,
	orders: 580,
	automations: 600,
	returns: 600,
	chargebacks: 620,
	insyte: 640,
	customeragent: 680,
	stock: 700,
	suppliers: 760,
	bestsellers: 820,
	countries: 860,
	revenue: 900,
};

const GLYPH_TILE: Record<WidgetTone, GlyphTile> = { paper: "mist", tint: "paper", mist: "paper", mesh: "mesh" };

function WidgetFrame({
	placed,
	editing,
	engine,
	content,
	lifted = false,
	fill = false,
	handle,
}: {
	placed: PlacedWidget;
	editing: boolean;
	engine: BoardEngine;
	content: ReactNode;
	lifted?: boolean;
	/** Fill a fixed box (the grid) and scroll inside it, rather than taking the content's height. */
	fill?: boolean;
	handle?: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> };
}) {
	const def = WIDGETS[placed.id];
	const mesh = placed.tone === "mesh";

	return (
		<article
			aria-label={def.title}
			className={cn(
				"glyph-host relative isolate flex flex-col gap-3 overflow-hidden rounded-xl p-4 transition-shadow duration-150",
				`widget-${placed.tone}`,
				mesh && "bg-stripe-mesh-dark text-mesh-ink",
				fill && "h-full",
				editing && !lifted && (mesh ? "ring-1 ring-white/15" : "ring-1 ring-ink/10"),
				lifted && "shadow-[0_24px_60px_-24px_rgb(0_0_0/0.35)] ring-2 ring-arc",
			)}
		>
			{mesh ? <MeshGround /> : null}
			<header
				className={cn(
					"relative z-10 flex h-7 shrink-0 items-center gap-2",
					editing && engine === "grid" && "widget-drag cursor-grab active:cursor-grabbing",
				)}
			>
				{editing && engine === "masonry" ? (
					<button
						type="button"
						ref={handle?.ref}
						{...handle?.props}
						aria-label={`${def.title} verplaatsen`}
						className={cn(
							"-ml-1.5 flex size-7 cursor-grab touch-none items-center justify-center rounded-md active:cursor-grabbing",
							mesh ? "text-mesh-ink-2 hover:bg-white/10 hover:text-mesh-ink" : "text-ink-3 hover:bg-ink/6 hover:text-ink",
						)}
					>
						<GripVertical className="size-4" strokeWidth={1.75} />
					</button>
				) : editing && engine === "grid" ? (
					<GripVertical className={cn("-ml-1 size-4", mesh ? "text-mesh-ink-2" : "text-ink-3")} strokeWidth={1.75} />
				) : null}
				<Glyph icon={def.icon} tile={GLYPH_TILE[placed.tone]} size={14} draw={false} />
				<h2 className={cn("min-w-0 flex-1 truncate font-medium text-md", mesh ? "text-mesh-ink" : "text-ink")}>
					{def.title}
				</h2>
				{editing ? (
					<WidgetMenu placed={placed} engine={engine} />
				) : def.to ? (
					<Link
						to={def.to}
						className={cn(
							"flex h-7 items-center gap-1 rounded-md px-2 font-medium text-sm transition-colors",
							mesh ? "text-mesh-ink-2 hover:bg-white/10 hover:text-mesh-ink" : "text-ink-2 hover:bg-ink/6 hover:text-ink",
						)}
					>
						Openen
						<ArrowUpRight className="size-3.5" strokeWidth={2} />
					</Link>
				) : null}
			</header>
			{/* While arranging, the widget is a handle, not a control: clicks inside it would navigate. */}
			<div
				className={cn(
					"relative z-10 min-h-0 flex-1",
					fill && "-mr-2 overflow-y-auto overscroll-contain pr-2",
					editing && "pointer-events-none select-none",
				)}
				inert={editing || undefined}
			>
				{/* The card's frame — its glyph, its name, its link — is the board's layout, known before
				    anything is fetched; only what is inside it streams in, each card on its own clock. */}
				<Stream id={`widget:${placed.id}`} after={WIDGET_COST[placed.id] ?? 640} fallback={<WidgetBones plate={mesh} rows={placed.id === "queue" ? 6 : 3} />} className={cn(fill && "h-full")} reserve>
					{content ?? def.render()}
				</Stream>
			</div>
		</article>
	);
}

function WidgetMenu({ placed, engine }: { placed: PlacedWidget; engine: BoardEngine }) {
	const def = WIDGETS[placed.id];
	const setSize = useHome((s) => s.setSize);
	const setTone = useHome((s) => s.setTone);
	const remove = useHome((s) => s.remove);
	const snapshot = useHome((s) => s.snapshot);
	const restore = useHome((s) => s.restore);
	const mesh = placed.tone === "mesh";
	const tones = TONES.filter((t) => def.tones.includes(t.id));

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Opties voor ${def.title}`}
					className={cn(
						"flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
						mesh ? "text-mesh-ink-2 hover:bg-white/10 hover:text-mesh-ink" : "text-ink-2 hover:bg-ink/6 hover:text-ink",
					)}
				>
					<MoreHorizontal className="size-4" strokeWidth={1.75} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				{engine === "masonry" ? (
					<>
						<DropdownMenuLabel>Breedte</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={String(placed.size)}
							onValueChange={(v) => setSize(placed.id, Number(v) as WidgetSize)}
						>
							<DropdownMenuRadioItem value="1">Eén kolom</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="2">Twee kolommen</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="3">Volledige breedte</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
					</>
				) : (
					<p className="px-2 pt-1.5 pb-1 text-xs text-ink-3">Sleep de hoek om het formaat te wijzigen.</p>
				)}
				{tones.length > 1 ? (
					<>
						<DropdownMenuLabel>Kleur</DropdownMenuLabel>
						<DropdownMenuRadioGroup value={placed.tone} onValueChange={(v) => setTone(placed.id, v as WidgetTone)}>
							{tones.map((t) => (
								<DropdownMenuRadioItem key={t.id} value={t.id}>
									<span className={cn("size-3.5 rounded-[4px]", t.swatch)} aria-hidden />
									{t.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
					</>
				) : null}
				<DropdownMenuItem
					variant="destructive"
					onClick={() => {
						const before = snapshot();
						remove(placed.id);
						undoable(`${def.title} van je bord verwijderd`, () => restore(before));
					}}
				>
					<Trash2 className="size-3.5" strokeWidth={1.75} />
					Van bord verwijderen
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
