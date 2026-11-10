import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { ChevronDown, Plus, Tag } from "../../icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TicketPriority, TicketStatus } from "../lib/types/domain";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { type NewTicketInput, type Said, useTicketsSource } from "./source";

const STATUS_LABEL: Record<TicketStatus, string> = {
	intake: "Nieuw",
	in_progress: "Bezig",
	awaiting_reply: "Wacht op antwoord",
	done: "Klaar",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
	high: "Hoog",
	medium: "Gemiddeld",
	low: "Laag",
};

export function NewTicketDialog({
	open,
	onOpenChange,
	defaultStatus = "intake",
	template,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	defaultStatus?: TicketStatus;
	/** A template fills the form in as the dialog opens; the operator edits from there. */
	template?: Partial<NewTicketInput>;
	/** The host says it was made: `said` is the design's toast. */
	onCreate: (input: NewTicketInput, said: Said) => void;
}) {
	const { people, labels } = useTicketsSource();
	const [form, setForm] = useState<NewTicketInput>({
		title: "",
		description: "",
		status: defaultStatus,
		priority: "medium",
		assignee_ids: [],
		tags: [],
		due_at: undefined,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refill only when the dialog opens.
	useEffect(() => {
		if (!open) return;
		setForm({
			title: "",
			description: "",
			status: defaultStatus,
			priority: "medium",
			assignee_ids: [],
			tags: [],
			due_at: undefined,
			...template,
		});
	}, [open]);

	function reset() {
		setForm({
			title: "",
			description: "",
			status: defaultStatus,
			priority: "medium",
			assignee_ids: [],
			tags: [],
			due_at: undefined,
		});
	}

	function submit() {
		if (!form.title.trim()) {
			toast.error("Een titel is verplicht");
			return;
		}
		onCreate(form, { label: `Ticket aangemaakt in ${STATUS_LABEL[form.status]}`, plain: true });
		reset();
		onOpenChange(false);
	}

	function toggleAssignee(id: string) {
		setForm((f) => ({
			...f,
			assignee_ids: f.assignee_ids.includes(id)
				? f.assignee_ids.filter((a) => a !== id)
				: [...f.assignee_ids, id],
		}));
	}

	function toggleTag(t: string) {
		setForm((f) => ({
			...f,
			tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
		}));
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Nieuw ticket</DialogTitle>
					<DialogDescription>
						Leg klantenservice, leveringen of teamwerk vast.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<Field label="Titel">
						<input
							type="text"
							value={form.title}
							onChange={(e) =>
								setForm((f) => ({ ...f, title: e.target.value }))
							}
							placeholder="Wat moet er gebeuren?"
							className="field h-9 w-full rounded-md px-3 text-base text-ink leading-[1.2] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
						/>
					</Field>
					<Field label="Beschrijving">
						<textarea
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Voeg details, links of stappen om het te reproduceren toe…"
							className="field min-h-20 w-full rounded-lg p-3 text-base text-ink leading-[1.6] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
						/>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Status">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex h-9 w-full items-center justify-between rounded-md bg-paper px-3 font-medium text-base text-ink hairline hover:bg-mist"
									>
										{STATUS_LABEL[form.status]}
										<ChevronDown className="size-4" strokeWidth={1.75} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-[var(--anchor-width)]">
									{(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
										<DropdownMenuItem
											key={s}
											onClick={() => setForm((f) => ({ ...f, status: s }))}
										>
											{STATUS_LABEL[s]}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</Field>
						<Field label="Prioriteit">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex h-9 w-full items-center justify-between rounded-md bg-paper px-3 font-medium text-base text-ink hairline hover:bg-mist"
									>
										{PRIORITY_LABEL[form.priority]}
										<ChevronDown className="size-4" strokeWidth={1.75} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-[var(--anchor-width)]">
									{(["high", "medium", "low"] as TicketPriority[]).map((p) => (
										<DropdownMenuItem
											key={p}
											onClick={() => setForm((f) => ({ ...f, priority: p }))}
										>
											{PRIORITY_LABEL[p]}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</Field>
					</div>
					<Field label="Toegewezen aan">
						<div className="flex flex-wrap gap-1.5">
							{people.map(({ id, ...a }) => {
								const active = form.assignee_ids.includes(id);
								return (
									<button
										key={id}
										type="button"
										onClick={() => toggleAssignee(id)}
										className={cn(
											"flex items-center gap-1.5 rounded-full px-2 py-1 font-medium text-sm leading-[1.2] transition-colors",
											active
												? "bg-abyss text-mesh-ink"
												: "bg-paper text-ink hover:bg-mist",
										)}
									>
										<span
											className="flex size-4 items-center justify-center rounded-full font-medium text-2xs"
											style={personStyle(id)}
										>
											{a.initial}
										</span>
										{a.name.split(" ")[0]}
									</button>
								);
							})}
						</div>
					</Field>
					<Field label="Labels">
						<div className="flex flex-wrap gap-1.5">
							{labels.map((t) => {
								const active = form.tags.includes(t);
								return (
									<button
										key={t}
										type="button"
										onClick={() => toggleTag(t)}
										className={cn(
											"inline-flex h-6 items-center gap-1 rounded-md px-2 font-medium text-sm leading-[1.2]",
											active
												? "bg-abyss text-mesh-ink"
												: "bg-paper text-ink-3 hover:bg-mist hover:text-ink",
										)}
									>
										<Tag className="size-3" strokeWidth={1.75} />
										{t}
									</button>
								);
							})}
						</div>
					</Field>
					<Field label="Deadline">
						<input
							type="date"
							value={form.due_at ? form.due_at.slice(0, 10) : ""}
							onChange={(e) =>
								setForm((f) => ({
									...f,
									due_at: e.target.value
										? new Date(e.target.value).toISOString()
										: undefined,
								}))
							}
							className="field h-9 w-full rounded-md px-3 font-medium text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
						/>
					</Field>
				</div>
				<DialogFooter className="gap-2">
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						Annuleren
					</button>
					<button
						type="button"
						onClick={submit}
						className="flex h-9 items-center justify-center gap-2 rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98]"
					>
						<Plus className="size-4" strokeWidth={2} />
						Ticket aanmaken
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: label wraps the field control passed via children
		<label className="flex flex-col gap-1.5">
			<span className="font-medium text-sm text-ink-3">
				{label}
			</span>
			{children}
		</label>
	);
}
