import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "../../icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	dueLabelFor,
	TicketCardContent,
	ticketCardClass,
} from "./ticket-card";
import { ticketsStore, useTickets } from "./tickets-store";
import type { Ticket, TicketStatus } from "../lib/types/domain";
import { cn } from "../lib/utils";

const COLUMNS: Array<{ id: TicketStatus; label: string }> = [
	{ id: "intake", label: "Nieuw" },
	{ id: "in_progress", label: "Bezig" },
	{ id: "awaiting_reply", label: "Wacht op antwoord" },
	{ id: "done", label: "Klaar · vandaag" },
];

export function TicketBoard({
	onCardClick,
	onNewInColumn,
	shows,
}: {
	onCardClick: (id: string) => void;
	onNewInColumn: (status: TicketStatus) => void;
	/** The page's filter: a card it rules out is not on the board. */
	shows?: (t: Ticket) => boolean;
}) {
	const all = useTickets();
	const items = useMemo(() => (shows ? all.filter(shows) : all), [all, shows]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const grouped = useMemo(() => {
		const m: Record<TicketStatus, Ticket[]> = {
			intake: [],
			in_progress: [],
			awaiting_reply: [],
			done: [],
		};
		for (const t of items) m[t.status].push(t);
		return m;
	}, [items]);

	function findContainer(id: string): TicketStatus | undefined {
		if ((COLUMNS as Array<{ id: string }>).some((c) => c.id === id))
			return id as TicketStatus;
		return items.find((t) => t.id === id)?.status;
	}

	function handleDragStart(e: DragStartEvent) {
		setActiveId(String(e.active.id));
	}

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		setActiveId(null);
		if (!over) return;

		const aId = String(active.id);
		const overId = String(over.id);
		const fromCol = findContainer(aId);
		const toCol = findContainer(overId);
		if (!fromCol || !toCol) return;

		const movingTicket = items.find((t) => t.id === aId);
		if (!movingTicket) return;

		if (fromCol === toCol) {
			const colItems = items.filter((t) => t.status === fromCol);
			const oldIndex = colItems.findIndex((t) => t.id === aId);
			const newIndex =
				overId === fromCol
					? colItems.length - 1
					: colItems.findIndex((t) => t.id === overId);
			if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
			const reordered = arrayMove(colItems, oldIndex, newIndex).map(
				(t) => t.id,
			);
			ticketsStore.reorder(fromCol, reordered);
			return;
		}

		ticketsStore.move(aId, toCol);
		toast.success(
			`${movingTicket.number} → ${COLUMNS.find((c) => c.id === toCol)?.label}`,
		);
	}

	const activeTicket = activeId
		? (items.find((t) => t.id === activeId) ?? null)
		: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
				{COLUMNS.map((col) => (
					<KanbanColumn
						key={col.id}
						id={col.id}
						label={col.label}
						items={grouped[col.id]}
						onNew={() => onNewInColumn(col.id)}
						onCardClick={(t) => onCardClick(t.id)}
					/>
				))}
			</div>
			<DragOverlay>
				{activeTicket ? (
					<div className={cn(ticketCardClass, "rotate-1 cursor-grabbing")}>
						<TicketCardContent
							ticket={activeTicket}
							dueLabel={dueLabelFor(activeTicket, activeTicket.status)}
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

function KanbanColumn({
	id,
	label,
	items,
	onNew,
	onCardClick,
}: {
	id: TicketStatus;
	label: string;
	items: Ticket[];
	onNew: () => void;
	onCardClick: (t: Ticket) => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<header className="flex items-center justify-between px-2.5">
				<div className="flex items-center gap-2.5">
					<span className="font-medium text-base text-ink">
						{label}
					</span>
					<span className="font-medium text-ink-3 text-sm">
						{items.length}
					</span>
				</div>
				<button
					type="button"
					aria-label={`Nieuw ticket in ${label}`}
					onClick={onNew}
					className="flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
				>
					<Plus className="size-4" strokeWidth={1.75} />
				</button>
			</header>
			<SortableContext
				items={items.map((i) => i.id)}
				strategy={verticalListSortingStrategy}
			>
				<div
					ref={setNodeRef}
					className={cn(
						"flex min-h-24 flex-col gap-3 rounded-xl p-1 transition-colors",
						isOver &&
							"bg-arc/5 outline outline-dashed outline-2 outline-[#0781e9]/30",
					)}
				>
					{items.map((t) => (
						<SortableTicketCard
							key={t.id}
							ticket={t}
							onClick={() => onCardClick(t)}
						/>
					))}
					{items.length === 0 ? (
						<div className="hatch flex flex-col items-center justify-center rounded-xl py-6 font-medium text-sm text-ink-3">
							Sleep tickets hierheen
						</div>
					) : null}
				</div>
			</SortableContext>
		</div>
	);
}

function SortableTicketCard({
	ticket,
	onClick,
}: {
	ticket: Ticket;
	onClick: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: ticket.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes}>
			<button
				type="button"
				onClick={onClick}
				className={cn(ticketCardClass, "w-full text-left")}
			>
				<TicketCardContent
					ticket={ticket}
					dueLabel={dueLabelFor(ticket, ticket.status)}
					commentCount={
						ticket.status === "done" && ticket.id.endsWith("0") ? 6 : undefined
					}
					dragHandleProps={{
						...listeners,
						"aria-label": `Ticket ${ticket.number} verslepen`,
					}}
				/>
			</button>
		</div>
	);
}
