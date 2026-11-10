import { SourceMark } from "./source-mark";
import { sourceOf } from "../lib/ticket-source";
import { Clock, MessageSquare, Tag } from "../../icons";
import type { Ticket, TicketPriority } from "../lib/types/domain";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { useTicketsSource } from "./source";

const PRIORITY: Record<
	TicketPriority,
	{ label: string; bg: string; fg: string }
> = {
	high: { label: "Hoog", bg: "var(--signal-red-bg)", fg: "var(--signal-red)" },
	medium: { label: "Gemiddeld", bg: "var(--signal-amber-bg)", fg: "var(--signal-amber)" },
	low: {
		label: "Laag",
		bg: "var(--signal-green-bg)",
		fg: "var(--signal-green)",
	},
};

const TAG_TONES: Record<string, { bg: string; fg: string }> = {
	Feedback: { bg: "var(--signal-amber-bg)", fg: "var(--signal-amber)" },
	Opgelost: { bg: "var(--signal-amber-bg)", fg: "var(--signal-amber)" },
	Bestelbevestiging: {
		bg: "var(--signal-amber-bg)",
		fg: "var(--signal-amber)",
	},
};

const DEFAULT_TAG = { bg: "color-mix(in oklch, var(--ink) 8%, transparent)", fg: "var(--ink-2)" };

export function TicketCardContent({
	ticket,
	commentCount,
	dueLabel,
	dragHandleProps,
	subtitle,
}: {
	ticket: Ticket;
	commentCount?: number;
	/** Absent where the ticket has no deadline. */
	dueLabel?: string;
	dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
	subtitle?: string;
}) {
	const prio = PRIORITY[ticket.priority];
	const { initialOf, subtitle: subtitleOf } = useTicketsSource();

	return (
		<div className="flex flex-col">
			{/* Drag-handle header row */}
			<div
				className="flex cursor-grab touch-none items-center gap-2.5 p-3.5 active:cursor-grabbing"
				{...dragHandleProps}
			>
				<p className="flex flex-1 items-center gap-1.5 truncate font-medium text-ink-3 text-sm">
					<SourceMark source={sourceOf(ticket)} />
					{ticket.number}
				</p>
				<span
					className="inline-flex h-5 items-center justify-center rounded-md px-2 py-1.5 font-medium text-sm"
					style={{ backgroundColor: prio.bg, color: prio.fg }}
				>
					{prio.label}
				</span>
			</div>
			<div className="flex flex-col gap-3.5 px-3.5 pb-2.5">
				<p className="font-normal text-base text-ink leading-[1.6] tracking-[-0.028px]">
					{ticket.title}
				</p>
				<div className="flex flex-col gap-2.5">
					<p className="font-medium text-sm text-ink-3 leading-[1.2] tracking-[-0.024px]">
						{subtitle ?? subtitleOf(ticket)}
					</p>
					<div className="flex flex-wrap gap-2">
						{ticket.tags.slice(0, 3).map((t) => {
							const tone = TAG_TONES[t] ?? DEFAULT_TAG;
							return (
								<span
									key={t}
									className="inline-flex h-5 items-center gap-1.5 rounded-md px-1 font-medium text-sm"
									style={{ backgroundColor: tone.bg, color: tone.fg }}
								>
									<Tag className="size-3" strokeWidth={1.75} />
									{t}
								</span>
							);
						})}
					</div>
				</div>
			</div>
			<div className="flex items-center justify-between px-3.5 pt-3 pb-3.5">
				<div className="flex -space-x-1">
					{ticket.assignee_ids.slice(0, 3).map((id) => {
						const a = { initial: initialOf(id, "card") };
						return (
							<span
								key={id}
								className="flex size-5 items-center justify-center rounded-full font-medium text-2xs leading-none ring-2 ring-paper"
								style={personStyle(id)}
							>
								{a.initial}
							</span>
						);
					})}
				</div>
				<div className="flex items-center gap-2">
					{commentCount !== undefined ? (
						<div className="flex items-center gap-1 font-normal text-sm text-ink-3">
							<MessageSquare className="size-3.5" strokeWidth={1.75} />
							<span>{commentCount}</span>
						</div>
					) : null}
					{dueLabel !== undefined ? (
						<div className="flex items-center gap-1 font-normal text-sm text-ink-3">
							<Clock className="size-3.5" strokeWidth={1.75} />
							<span>{dueLabel}</span>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

export const ticketCardClass = cn(
	"panel flex flex-col overflow-hidden rounded-xl transition-shadow hover:shadow-modal",
);
