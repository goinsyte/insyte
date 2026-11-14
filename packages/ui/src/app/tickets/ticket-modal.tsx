import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../../components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import {
	AlertOctagon,
	Archive,
	Calendar,
	Check,
	ChevronDown,
	Copy,
	Hash,
	Link2,
	MessageSquare,
	MoreHorizontal,
	Send,
	Sparkles,
	Tag,
	Trash2,
	UserPlus,
	X,
} from "../../icons";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MentionField, MentionText, mentionsIn } from "./mention-field";
import { type ActivityLine, type Said, type TicketPatch, useTicketsSource } from "./source";
import { useNavigate } from "@tanstack/react-router";
import type { Ticket, TicketPriority, TicketStatus } from "../lib/types/domain";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";

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

const STATUS: Record<TicketStatus, { label: string; bg: string; fg: string }> =
	{
		intake: { label: "Nieuw", bg: "color-mix(in oklch, var(--ink) 8%, transparent)", fg: "var(--ink-3)" },
		in_progress: {
			label: "Bezig",
			bg: "var(--arc-tint)",
			fg: "var(--arc-ink)",
		},
		awaiting_reply: {
			label: "Wacht op antwoord",
			bg: "var(--signal-amber-bg)",
			fg: "var(--signal-amber)",
		},
		done: {
			label: "Klaar",
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

export function TicketModal({
	ticketId,
	onClose,
}: {
	ticketId: string | null;
	onClose: () => void;
}) {
	const open = ticketId !== null;
	const source = useTicketsSource();
	const { people, labels, me, commands } = source;
	const Agents = source.agents?.Rows;
	const view = source.useTicket(ticketId);
	const ticket = view?.ticket;
	const person = (id: string) => people.find((p) => p.id === id);

	const [draft, setDraft] = useState<Ticket | null>(null);
	const notifying = useRef(false);
	const [comments, setComments] = useState<ActivityLine[]>([]);
	const [newComment, setNewComment] = useState("");
	const [editingTitle, setEditingTitle] = useState(false);
	const [editingDescription, setEditingDescription] = useState(false);
	const [watching, setWatching] = useState(false);
	// Insyte AI writing a summary or a reply: once at a time.
	const [writing, setWriting] = useState<"summary" | "reply" | null>(null);
	const navigate = useNavigate();

	useEffect(() => {
		if (ticket) setDraft({ ...ticket });
	}, [ticket]);
	// The activity as the host has it; a line written here shows at once, until the host's comes back.
	const seeded = view?.comments;
	useEffect(() => {
		if (seeded) setComments([...seeded]);
	}, [seeded]);
	const followed = view?.watching;
	useEffect(() => {
		if (followed !== undefined) setWatching(followed);
	}, [followed]);

	if (!draft) {
		return (
			<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
				<DialogContent className="max-w-3xl" showCloseButton={false}>
					<DialogTitle className="sr-only">Ticket</DialogTitle>
					<DialogDescription className="sr-only">
						Ticketdetails
					</DialogDescription>
				</DialogContent>
			</Dialog>
		);
	}

	const prio = PRIORITY[draft.priority];
	const stat = STATUS[draft.status];

	function patch(p: TicketPatch, said?: Said) {
		if (!draft) return;
		const next: Ticket = {
			...draft,
			...p,
			updated_at: new Date().toISOString(),
		};
		setDraft(next);
		commands.edit(draft, p, said);
	}

	/** The title and the description are typed here and saved when done: on blur or Enter, on Opslaan. */
	function type(p: Pick<TicketPatch, "title" | "description">) {
		setDraft((d) => (d ? { ...d, ...p } : d));
	}

	function saveTitle() {
		setEditingTitle(false);
		if (!draft || !ticket) return;
		if (!draft.title.trim()) return void setDraft({ ...draft, title: ticket.title });
		if (draft.title !== ticket.title) commands.edit(ticket, { title: draft.title }, { label: "Titel gewijzigd", quiet: true });
	}

	function addComment() {
		const body = newComment.trim();
		if (!body || !draft) return;
		setComments((cs) => [
			{ id: `c${Date.now()}`, authorId: me.id, name: person(me.id)?.name ?? "", initial: me.initial, insyte: false, body, at: "zojuist" },
			...cs,
		]);
		setNewComment("");
		const told = mentionsIn(body, people).filter((p) => p.id !== me.id);
		commands.comment(draft, body, told);
		toast.success(
			told.length === 0
				? "Reactie geplaatst"
				: `Reactie geplaatst · ${new Intl.ListFormat("nl-NL", { type: "conjunction" }).format(told.map((p) => p.name.split(" ")[0] ?? p.name))} ${told.length === 1 ? "krijgt" : "krijgen"} een melding`,
		);
	}

	function toggleAssignee(id: string) {
		if (!draft) return;
		const has = draft.assignee_ids.includes(id);
		const name = person(id)?.name.split(" ")[0] ?? "";
		patch(
			{
				assignee_ids: has
					? draft.assignee_ids.filter((a) => a !== id)
					: [...draft.assignee_ids, id],
			},
			{ label: has ? `${name} niet meer toegewezen` : `Toegewezen aan ${name}`, quiet: true },
		);
	}

	/** A line in the activity, from the system rather than a person. */
	function log(body: string) {
		setComments((cs) => [{ id: `c${Date.now()}`, authorId: "insyte", name: "Insyte", initial: "", insyte: true, body, at: "zojuist" }, ...cs]);
	}

	function openRelated() {
		const rel = draft?.related_entity;
		if (!rel) return;
		onClose();
		if (rel.type === "order") navigate({ to: "/orders/$orderId", params: { orderId: rel.id } });
		else if (rel.type === "customer") navigate({ to: "/customers/$customerId", params: { customerId: rel.id } });
		else navigate({ to: "/chargebacks/$chargebackId", params: { chargebackId: rel.id } } as never);
	}

	function summarize() {
		if (!draft || writing !== null) return;
		const drafts = source.drafts;
		if (drafts === undefined) return;
		if (drafts !== true) {
			// Insyte AI's summary lands in the activity as its line; the ticket's activity refetches.
			setWriting("summary");
			void drafts.summarize(draft.id).finally(() => setWriting(null));
			return;
		}
		const named = draft.assignee_ids.map((id) => person(id)?.name).filter(Boolean);
		log(
			`Samenvatting · ${draft.title}. ${STATUS[draft.status].label}, prioriteit ${PRIORITY[draft.priority].label.toLowerCase()}${
				named.length ? `, bij ${named.join(" en ")}` : ", niet toegewezen"
			}. ${comments.length} ${comments.length === 1 ? "notitie" : "notities"} tot nu toe; de laatste: "${comments[0]?.body ?? draft.description}"`,
		);
	}

	function suggestReply() {
		if (!draft || writing !== null) return;
		const drafts = source.drafts;
		if (drafts === undefined) return;
		if (drafts !== true) {
			setWriting("reply");
			void drafts
				.suggestReply(draft.id)
				.then((text) => {
					if (text !== undefined) setNewComment(text);
				})
				.finally(() => setWriting(null));
			return;
		}
		setNewComment(
			`Hoi, bedankt voor je geduld met ${draft.related_entity?.label ?? draft.number}. We hebben het aan onze kant bekeken en dit is de stand van zaken: ${draft.description.replace(/\.$/, "")}. We laten weer van ons horen zodra er iets verandert, en uiterlijk morgen.`,
		);
	}

	async function notifyCustomer() {
		const send = source.notifyCustomer;
		if (typeof send === "function") {
			// The host mails the shopper and moves the ticket itself; the modal shows what it did once it went. A second
			// click while the first is on its way sends nothing more.
			if (!draft || notifying.current) return;
			notifying.current = true;
			const went = await send(draft).finally(() => {
				notifying.current = false;
			});
			if (!went) return;
			setDraft((d) => (d ? { ...d, status: "awaiting_reply" } : d));
			log("Klant gemaild met de laatste stand van zaken. Wacht op antwoord.");
			return;
		}
		patch({ status: "awaiting_reply" }, { label: "Klant gemaild", quiet: true });
		log("Klant gemaild met de laatste stand van zaken. Wacht op antwoord.");
		toast.success("Klant gemaild");
	}

	function snooze() {
		if (!draft) return;
		// Snoozing takes the ticket off the board until tomorrow; it waits in Snoozed meanwhile.
		const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
		patch({ snoozed_until: tomorrow }, { label: `${draft.number} uitgesteld tot morgen` });
		log("Uitgesteld tot morgen.");
		onClose();
	}

	function duplicate() {
		if (!draft) return;
		commands.duplicate(draft);
	}

	function archive() {
		if (!draft) return;
		// Archived tickets are kept, out of every view but Archived, and can be brought back.
		patch({ archived_at: new Date().toISOString() }, { label: `${draft.number} gearchiveerd` });
		onClose();
	}

	/** Trash and spam keep the ticket too, each in its own view, and Undo puts it straight back. */
	function setAside(field: "deleted_at" | "spam_at", message: string) {
		if (!draft) return;
		patch({ [field]: new Date().toISOString() }, { label: `${draft.number} ${message}` });
		onClose();
	}

	function toggleTag(tag: string) {
		if (!draft) return;
		const has = draft.tags.includes(tag);
		patch(
			{
				tags: has ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag],
			},
			{ label: has ? `Label ${tag} weggehaald` : `Label ${tag} toegevoegd`, quiet: true },
		);
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="max-w-[920px] gap-0 overflow-hidden p-0 sm:max-w-[920px]"
			>
				<DialogTitle className="sr-only">{draft.title}</DialogTitle>
				<DialogDescription className="sr-only">
					Ticket {draft.number}
				</DialogDescription>

				{/* Header */}
				<div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex items-center gap-2 font-medium text-ink-3 text-sm">
							<Hash className="size-3.5" strokeWidth={1.75} />
							<span>{draft.number}</span>
							{draft.related_entity ? (
								<>
									<span>·</span>
									<button
										type="button"
										onClick={openRelated}
										className="flex items-center gap-1 text-arc-ink hover:underline"
									>
										<Link2 className="size-3.5" strokeWidth={1.75} />
										{draft.related_entity.label}
									</button>
								</>
							) : null}
						</div>
						{editingTitle ? (
							<input
								autoFocus
								value={draft.title}
								onChange={(e) => type({ title: e.target.value })}
								onBlur={saveTitle}
								onKeyDown={(e) => {
									if (e.key === "Enter") saveTitle();
								}}
								className="field w-full rounded-md px-2 py-1 font-medium text-xl text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
							/>
						) : (
							<button
								type="button"
								onClick={() => setEditingTitle(true)}
								className="-mx-2 rounded-md px-2 py-1 text-left font-medium text-xl text-ink hover:bg-mist"
							>
								{draft.title}
							</button>
						)}
						<div className="flex flex-wrap items-center gap-2">
							{/* status dropdown */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="inline-flex h-5 items-center gap-1 rounded-md px-2 py-1.5 font-medium text-sm hover:opacity-80"
										style={{ backgroundColor: stat.bg, color: stat.fg }}
									>
										{stat.label}
										<ChevronDown className="size-3" strokeWidth={2} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<DropdownMenuLabel>Verplaatsen naar</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{(Object.keys(STATUS) as TicketStatus[]).map((s) => (
										<DropdownMenuItem
											key={s}
											onClick={() => patch({ status: s }, { label: `Verplaatst naar ${STATUS[s].label}`, plain: true })}
										>
											{STATUS[s].label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							{/* priority dropdown */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="inline-flex h-5 items-center gap-1 rounded-md px-2 py-1.5 font-medium text-sm hover:opacity-80"
										style={{ backgroundColor: prio.bg, color: prio.fg }}
									>
										{prio.label}
										<ChevronDown className="size-3" strokeWidth={2} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<DropdownMenuLabel>Prioriteit</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{(["high", "medium", "low"] as TicketPriority[]).map((p) => (
										<DropdownMenuItem
											key={p}
											onClick={() => patch({ priority: p }, { label: `Prioriteit ${PRIORITY[p].label.toLowerCase()}`, quiet: true })}
										>
											{PRIORITY[p].label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={() => {
								navigator.clipboard?.writeText(draft.number);
								toast.success("Ticketnummer gekopieerd");
							}}
							aria-label="Kopiëren"
							className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
						>
							<Copy className="size-4" strokeWidth={1.75} />
						</button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="Meer acties"
									className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
								>
									<MoreHorizontal className="size-4" strokeWidth={1.75} />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem
									onClick={() => {
										setWatching((w) => !w);
										commands.watch(draft, !watching);
										toast(watching ? "Je krijgt hier geen meldingen meer over" : "Je krijgt een melding bij elke wijziging");
									}}
								>
									{watching ? "Niet meer volgen" : "Ticket volgen"}
								</DropdownMenuItem>
								<DropdownMenuItem onClick={duplicate}>
									Dupliceren
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									onClick={archive}
								>
									<Archive className="size-4" strokeWidth={1.75} />
									Archiveren
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={() => setAside("spam_at", "gemeld als spam")}>
									<AlertOctagon className="size-4" strokeWidth={1.75} />
									Melden als spam
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={() => setAside("deleted_at", "naar de prullenbak")}>
									<Trash2 className="size-4" strokeWidth={1.75} />
									Naar prullenbak
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							type="button"
							onClick={onClose}
							aria-label="Sluiten"
							className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
						>
							<X className="size-4" strokeWidth={1.75} />
						</button>
					</div>
				</div>

				{/* Body */}
				<div className="grid max-h-[70vh] grid-cols-1 overflow-hidden md:grid-cols-[1fr_260px]">
					<div className="flex min-w-0 flex-col gap-6 overflow-y-auto px-6 py-6">
						{/* Description */}
						<section className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<h3 className="font-medium text-base text-ink leading-[1.2]">
									Beschrijving
								</h3>
								{!editingDescription ? (
									<button
										type="button"
										onClick={() => setEditingDescription(true)}
										className="font-medium text-sm text-ink-3 leading-[1.2] hover:text-ink"
									>
										Bewerken
									</button>
								) : null}
							</div>
							{editingDescription ? (
								<>
									<textarea
										autoFocus
										value={draft.description}
										onChange={(e) => type({ description: e.target.value })}
										className="field min-h-24 w-full rounded-lg p-3 text-base text-ink leading-[1.6] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
									/>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => {
												setEditingDescription(false);
												if (ticket && draft.description !== ticket.description) {
													commands.edit(ticket, { description: draft.description }, { label: "Beschrijving opgeslagen", plain: true });
												} else toast.success("Beschrijving opgeslagen");
											}}
											className="flex h-8 items-center justify-center rounded-md bg-abyss px-3 py-1.5 font-medium text-base text-mesh-ink transition hover:bg-abyss-2 active:scale-[0.98]"
										>
											Opslaan
										</button>
										<button
											type="button"
											onClick={() => {
												setEditingDescription(false);
												if (ticket) type({ description: ticket.description });
											}}
											className="flex h-8 items-center justify-center rounded-md bg-paper px-3 py-1.5 font-medium text-base text-ink-3 hover:bg-mist hover:text-ink"
										>
											Annuleren
										</button>
									</div>
								</>
							) : (
								<button
									type="button"
									onClick={() => setEditingDescription(true)}
									className="rounded-lg bg-mist p-3 text-left text-base text-ink leading-[1.6] hover:bg-mist"
								>
									{draft.description || (
										<span className="text-ink-3">Voeg een beschrijving toe…</span>
									)}
								</button>
							)}
						</section>

						{Agents ? <Agents id={draft.id} /> : null}

						{/* Activity / Comments */}
						<section className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<h3 className="font-medium text-base text-ink leading-[1.2]">
									Activiteit
								</h3>
								{source.drafts ? (
									<button
										type="button"
										onClick={summarize}
										className="flex items-center gap-1.5 font-medium text-sm text-ink-3 leading-[1.2] hover:text-ink"
									>
										<Sparkles className="size-3.5 text-arc-ink" strokeWidth={1.75} />
										Samenvatten
									</button>
								) : null}
							</div>
							<div className="flex gap-2">
								<span
									className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-sm"
									style={personStyle(me.id)}
								>
									{me.initial}
								</span>
								<div className="flex flex-1 flex-col gap-2">
									<MentionField
										value={newComment}
										onChange={setNewComment}
										onSubmit={addComment}
										people={people}
										placeholder="Schrijf een reactie… typ @ om een collega te vermelden"
									/>
									{newComment.trim() ? (
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={addComment}
												className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 py-1.5 font-medium text-base text-mesh-ink transition hover:bg-abyss-2 active:scale-[0.98]"
											>
												<Send className="size-3.5" strokeWidth={2} />
												Reageren
											</button>
											<button
												type="button"
												onClick={() => setNewComment("")}
												className="font-medium text-sm text-ink-3 hover:text-ink"
											>
												Annuleren
											</button>
										</div>
									) : null}
								</div>
							</div>
							<ul className="flex flex-col gap-3">
								{comments.map((c) => {
									const insyte = c.insyte;
									return (
										<li key={c.id} className="flex animate-in gap-2 fade-in-0 slide-in-from-top-1 duration-200">
											{insyte ? (
												<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-abyss">
													<Sparkles className="size-3.5 text-mesh-ink" strokeWidth={1.75} />
												</span>
											) : (
												<span
													className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-sm"
													style={personStyle(c.authorId)}
												>
													{c.initial || "?"}
												</span>
											)}
											<div className="flex flex-1 flex-col gap-1">
												<div className="flex items-center gap-2">
													<span className="font-medium text-sm text-ink">
														{insyte ? "Insyte" : (c.name || "Onbekend")}
													</span>
													<span className="text-sm text-ink-3">{c.at}</span>
												</div>
												<p className={cn("rounded-lg p-3 text-base text-ink leading-[1.6]", insyte ? "bg-arc-tint" : "bg-mist")}>
													<MentionText body={c.body} people={people} />
												</p>
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					</div>

					{/* Sidebar */}
					<aside className="flex flex-col gap-5 overflow-y-auto bg-mist px-5 py-6">
						<SidebarBlock title="Toegewezen aan">
							<div className="flex flex-wrap gap-1.5">
								{draft.assignee_ids.map((id) => {
									const a = person(id);
									if (!a) return null;
									return (
										<button
											key={id}
											type="button"
											onClick={() => toggleAssignee(id)}
											className="flex items-center gap-1.5 rounded-full bg-paper px-1.5 py-0.5 font-medium text-sm text-ink leading-[1.2] "
											title="Verwijderen"
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
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className="flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-medium text-sm text-ink-3 leading-[1.2] hover:text-ink"
										>
											<UserPlus className="size-3.5" strokeWidth={1.75} />
											Toevoegen
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{people.map(({ id, ...a }) => (
											<DropdownMenuItem
												key={id}
												onClick={() => toggleAssignee(id)}
											>
												<span
													className="flex size-4 items-center justify-center rounded-full font-medium text-2xs"
													style={personStyle(id)}
												>
													{a.initial}
												</span>
												{a.name}
												{draft.assignee_ids.includes(id) ? (
													<Check
														className="ml-auto size-3.5 text-ink-3"
														strokeWidth={2}
													/>
												) : null}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</SidebarBlock>

						<SidebarBlock title="Labels">
							<div className="flex flex-wrap gap-1.5">
								{draft.tags.map((t) => {
									const tone = TAG_TONES[t] ?? DEFAULT_TAG;
									return (
										<button
											key={t}
											type="button"
											onClick={() => toggleTag(t)}
											className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-medium text-sm"
											style={{ backgroundColor: tone.bg, color: tone.fg }}
										>
											<Tag className="size-3" strokeWidth={1.75} />
											{t}
										</button>
									);
								})}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className="inline-flex h-5 items-center gap-1 rounded-md bg-paper px-1.5 font-medium text-sm text-ink-3 hover:text-ink"
										>
											+ Toevoegen
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{labels.map((label) => (
											<DropdownMenuItem
												key={label}
												onClick={() => toggleTag(label)}
											>
												{label}
												{draft.tags.includes(label) ? (
													<Check
														className="ml-auto size-3.5 text-ink-3"
														strokeWidth={2}
													/>
												) : null}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</SidebarBlock>

						<SidebarBlock title="Deadline">
							<input
								type="date"
								value={draft.due_at ? draft.due_at.slice(0, 10) : ""}
								onChange={(e) =>
									patch({
										due_at: e.target.value
											? new Date(e.target.value).toISOString()
											: undefined,
									}, { label: e.target.value ? "Deadline gezet" : "Deadline weggehaald", quiet: true })
								}
								className="field h-8 w-full rounded-md px-2 font-medium text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
							/>
						</SidebarBlock>

						<SidebarBlock title="Acties">
							<div className="flex flex-col gap-1">
								{source.drafts ? (
									<SidebarAction
										icon={Sparkles}
										label="Antwoord voorstellen (AI)"
										onClick={suggestReply}
									/>
								) : null}
								{source.notifyCustomer ? (
									<SidebarAction
										icon={MessageSquare}
										label="Klant informeren"
										onClick={() => void notifyCustomer()}
									/>
								) : null}
								<SidebarAction
									icon={Calendar}
									label="Uitstellen"
									onClick={snooze}
								/>
								<SidebarAction
									icon={Archive}
									label="Archiveren"
									destructive
									onClick={archive}
								/>
							</div>
						</SidebarBlock>
					</aside>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function SidebarBlock({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="font-medium text-sm text-ink/50 leading-[1.2]">
				{title}
			</h4>
			{children}
		</section>
	);
}

function SidebarAction({
	icon: Icon,
	label,
	onClick,
	destructive,
}: {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	onClick: () => void;
	destructive?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 rounded-md bg-paper px-2 py-1.5 text-left font-medium text-sm leading-[1.2] hover:bg-mist",
				destructive ? "text-signal-red" : "text-ink",
			)}
		>
			<Icon className="size-3.5" strokeWidth={1.75} />
			{label}
		</button>
	);
}
