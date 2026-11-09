import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import {
	AlertTriangle,
	BookOpen,
	Check,
	ChevronRight,
	Factory,
	type IconComponent,
	Inbox,
	Lock,
	Sparkle,
	RotateCcw,
	Shield,
	Box,
	ShoppingBag,
	Ticket,
	User,
	X,
} from "../../icons";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNow } from "../hooks/use-now";
import { formatDateTime } from "../lib/format";
import { type AgentLogEntry, canUndo, leftLabel, type LogSource, type LogSourceKind, RECORD_LABEL, ranUnder, STATUS_LABEL } from "../lib/agent-log";
import { ENTRY } from "../lib/autonomy";
import { cn } from "../lib/utils";
import { applyEffect, useAgentEntries, useAgentEntriesFor, useAgentLog } from "../stores/agent-log-store";
import { useAutonomy, useDecide } from "../stores/autonomy-store";
import { useWorkspace } from "../stores/workspace-store";
import { ME } from "../lib/assignees";
import { InsyteMark, ProposalPlate } from "./parts";
import { ConfirmDialog } from "../common/confirm-dialog";

/*
 * What the agent did on its own, drawn the way DESIGN.md says it is drawn: a log row, never a plate.
 * The time, the action as a sentence, the record, the setting it ran under as a `mist` tag, what
 * it read as check chips, one line of why, and an outlined Ongedaan maken while the server's window
 * is open. After the window: "Niet meer terug te draaien", and the compensation by hand where one
 * exists. The plate (`ProposalPlate`) stays what Eerst vragen looks like.
 */

/** A clock that ticks, for the windows counting down. */
export { useNow };

/** The person at the desk, by name, for "Ongedaan gemaakt door …". */
export function useMyName(): string {
	return useWorkspace((s) => s.members.find((m) => m.id === ME)?.name ?? "Elena Hart");
}

const SOURCE_ICON: Record<LogSourceKind, IconComponent> = {
	ticket: Ticket,
	order: ShoppingBag,
	customer: User,
	thread: Inbox,
	knowledge: BookOpen,
	policy: Shield,
	product: Box,
	supplier: Factory,
	return: RotateCcw,
};

const time = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Takes a row back, or runs its compensation by hand, and says so with the person's own Undo. */
export function useUndoAgent() {
	const me = useMyName();
	return (e: AgentLogEntry, now: number) => {
		const log = useAgentLog.getState();
		if (canUndo(e, now)) {
			if (!log.undo(e.id, me)) return;
			toast(e.effect?.kind === "send" ? "Niet verstuurd" : "Ongedaan gemaakt", {
				description: e.effect?.kind === "send" ? "Het bericht wachtte nog op het venster en is nooit vertrokken." : e.sentence,
				duration: 6000,
				action: e.effect?.kind === "send" ? undefined : { label: "Toch laten staan", onClick: () => log.redo(e.id) },
			});
			return;
		}
		// Past the window: a person runs the compensation by hand, which is their own action.
		if (!e.compensation || !e.effect) return;
		applyEffect(e.effect, "back");
		useAgentLog.setState((s) => ({ overrides: { ...s.overrides, [e.id]: { status: "undone", undoneBy: me, at: Date.now() } } }));
		toast(`${e.compensation}: gedaan`, { description: e.sentence, duration: 6000, action: { label: "Ongedaan maken", onClick: () => log.redo(e.id) } });
	};
}

export function StatusWord({ e, now }: { e: AgentLogEntry; now: number }) {
	const sending = e.status === "sending" || (e.effect?.kind === "send" && e.status === "done" && canUndo(e, now));
	const status = sending ? "sending" : e.status;
	const tone = status === "failed" ? "text-signal-red" : status === "undone" ? "text-ink-3" : status === "sending" ? "text-signal-amber" : "text-ink-2";
	return (
		<span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
			{status === "failed" ? <AlertTriangle className="size-3" strokeWidth={2} /> : status === "done" ? <Check className="size-3" strokeWidth={2.25} /> : null}
			{status === "undone" && e.undoneBy ? `Ongedaan gemaakt door ${e.undoneBy}` : STATUS_LABEL[status]}
		</span>
	);
}

/** The setting a row ran under, as the quiet `mist` tag, linking to that row on Zelfstandigheid. */
export function SettingTag({ e }: { e: Pick<AgentLogEntry, "level" | "approvedBy" | "action"> }) {
	const locked = ENTRY[e.action]?.locked;
	return (
		<Link
			to="/settings/ai/autonomy"
			search={{ actie: e.action }}
			className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-sm bg-mist px-1.5 text-ink-2 text-xs transition-colors hover:bg-ink/8 hover:text-ink"
			title="Zelfstandigheid openen op deze actie"
		>
			{locked ? <Lock className="size-2.5 shrink-0" strokeWidth={2} /> : null}
			{e.level === "auto" ? "Zelf gedaan · Zelfstandigheid: Zelf doen" : ranUnder(e)}
		</Link>
	);
}

function SourceChips({ sources }: { sources: ReadonlyArray<LogSource> }) {
	if (sources.length === 0) return null;
	return (
		<span className="flex flex-wrap gap-1">
			{sources.map((s) => (
				<span key={`${s.kind}-${s.title}`} className="inline-flex h-5 max-w-[220px] items-center gap-1 truncate rounded-sm bg-paper px-1.5 text-ink-2 text-xs shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
					<Check className="size-2.5 shrink-0 text-ink-3" strokeWidth={2.5} />
					<span className="truncate">{s.title}</span>
				</span>
			))}
		</span>
	);
}

/** The way back, or the reason there is none. */
export function UndoControl({ e, now, size = "sm" }: { e: AgentLogEntry; now: number; size?: "sm" | "xs" }) {
	const undo = useUndoAgent();
	if (e.status === "failed" || e.status === "undone") return null;
	if (canUndo(e, now)) {
		return (
			<button
				type="button"
				onClick={(ev) => {
					ev.stopPropagation();
					undo(e, now);
				}}
				aria-label={size === "xs" ? `Ongedaan maken, nog ${leftLabel((e.undoUntil ?? now) - now)}` : undefined}
				title={size === "xs" ? "Ongedaan maken" : undefined}
				className={cn("field flex shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink transition-colors hover:field-hover", size === "xs" ? "h-7 text-xs" : "h-8 text-sm")}
			>
				<RotateCcw className="size-3.5" strokeWidth={1.75} />
				{/* In a table row the icon and the time left say it; the drawer spells it out. */}
				{size === "xs" ? null : "Ongedaan maken"}
				<span className="font-normal text-ink-3 tabular-nums">{leftLabel((e.undoUntil ?? now) - now)}</span>
			</button>
		);
	}
	// A table row says nothing once the window has shut; the drawer says it, with the way back.
	if (size === "xs") return null;
	return (
		<span className="flex shrink-0 items-center gap-2 text-ink-3 text-xs">
			Niet meer terug te draaien
			{e.compensation && e.effect ? (
				<button
					type="button"
					onClick={(ev) => {
						ev.stopPropagation();
						undo(e, now);
					}}
					className="rounded-sm font-medium text-arc-ink underline decoration-arc-ink/35 underline-offset-2 hover:decoration-arc-ink"
				>
					{e.compensation}
				</button>
			) : null}
		</span>
	);
}

/**
 * One log row. `compact` is the timeline form on a record (no record chip, since you are on it);
 * the full form is the log page's and the dashboard card's.
 */
export function AgentLogRow({ e, now, onOpen, compact = false, className }: { e: AgentLogEntry; now: number; onOpen?: (e: AgentLogEntry) => void; compact?: boolean; className?: string }) {
	return (
		<li className={cn("flex flex-wrap gap-x-3 gap-y-2 rounded-lg px-3 py-3 sm:flex-nowrap", onOpen && "cursor-pointer transition-colors hover:bg-ink/3", className)} onClick={onOpen ? () => onOpen(e) : undefined}>
			<span className="mt-0.5">
				<InsyteMark size={22} />
			</span>
			<div className="flex min-w-0 flex-1 basis-[calc(100%-34px)] flex-col gap-1.5 sm:basis-auto">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<time dateTime={e.at} className="shrink-0 text-ink-3 text-xs tabular-nums">
						{time(e.at)}
					</time>
					<span className={cn("min-w-0 text-ink text-sm", e.status === "undone" && "text-ink-3 line-through decoration-ink-4")}>{e.sentence}</span>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<SettingTag e={e} />
					{!compact && e.record ? (
						<Link
							to={e.record.to}
							search={e.record.search}
							onClick={(ev) => ev.stopPropagation()}
							className="inline-flex h-5 items-center gap-1 rounded-sm bg-arc-tint px-1.5 font-medium text-arc-ink text-xs transition-colors hover:bg-arc/15"
						>
							{RECORD_LABEL[e.record.kind]} {e.record.label}
						</Link>
					) : null}
					<span className="text-ink-3 text-xs">{e.trigger}</span>
					<StatusWord e={e} now={now} />
				</div>
				<SourceChips sources={e.sources} />
				{e.status === "failed" && e.failReason ? <p className="text-signal-red text-sm">{e.failReason}</p> : <p className="text-ink-2 text-sm leading-normal">{e.reason}</p>}
			</div>
			<div className="flex shrink-0 items-start gap-1 pl-[34px] sm:pt-0.5 sm:pl-0">
				<UndoControl e={e} now={now} size="xs" />
				{onOpen ? <ChevronRight className="mt-1.5 hidden size-4 text-ink-4 sm:block" strokeWidth={1.75} /> : null}
			</div>
		</li>
	);
}

/** The row's drawer: what it did, before and after, why — what it read — and the versions, small. */
export function AgentLogDrawer({ e, onClose }: { e: AgentLogEntry | null; onClose: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const now = useNow();
	return (
		<Sheet open={e !== null} onOpenChange={(o) => !o && onClose()}>
			<SheetContent side="right" className="w-[520px] max-w-[100vw] gap-0 overflow-y-auto bg-paper p-0 sm:max-w-[520px]" showCloseButton={false} initialFocus={ref}>
				{e ? (
					<div ref={ref} tabIndex={-1} className="flex min-h-full flex-col outline-none">
						<header className="flex items-start gap-3 bg-mist px-5 py-4">
							<InsyteMark size={28} />
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<SheetTitle className="font-medium text-ink text-lg leading-snug">{e.sentence}</SheetTitle>
								<SheetDescription className="flex flex-wrap items-center gap-1.5 text-ink-2 text-sm">
									<SettingTag e={e} />
									<StatusWord e={e} now={now} />
								</SheetDescription>
							</div>
							<button type="button" aria-label="Sluiten" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
								<X className="size-4" strokeWidth={1.75} />
							</button>
						</header>
						<dl className="grid grid-cols-2 gap-px bg-mist">
							{(
								[
									["Wanneer", formatDateTime(e.at)],
									["Aanleiding", e.trigger],
									["Actie", ENTRY[e.action]?.label ?? e.action],
									["Record", e.record ? `${RECORD_LABEL[e.record.kind]} ${e.record.label}` : "Geen"],
								] as const
							).map(([k, v]) => (
								<div key={k} className="flex min-w-0 flex-col gap-1 bg-paper px-5 py-3">
									<dt className="text-ink-3 text-xs">{k}</dt>
									<dd className="truncate font-medium text-base text-ink">{v}</dd>
								</div>
							))}
						</dl>
						<div className="flex flex-col gap-6 px-5 py-5">
							{e.status === "failed" && e.failReason ? <p className="rounded-lg bg-signal-red-bg px-3.5 py-2.5 text-ink text-sm">{e.failReason} Er is niets gewijzigd.</p> : null}
							{e.before || e.after ? (
								<section className="flex flex-col gap-2">
									<h3 className="font-medium text-ink-3 text-xs">Wat er veranderde</h3>
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<div className="rounded-lg bg-mist px-3 py-2.5">
											<p className="text-ink-3 text-xs">Ervoor</p>
											<p className="mt-0.5 text-ink-2 text-sm">{e.before ?? "Niets"}</p>
										</div>
										<div className="rounded-lg bg-arc-tint px-3 py-2.5">
											<p className="text-arc-ink text-xs">Erna</p>
											<p className="mt-0.5 text-ink text-sm">{e.after ?? "Niets"}</p>
										</div>
									</div>
								</section>
							) : null}
							<section className="flex flex-col gap-2">
								<h3 className="font-medium text-ink-3 text-xs">Waarom</h3>
								<p className="text-base text-ink leading-relaxed">{e.reason}</p>
								<ul className="flex flex-col gap-1">
									{e.sources.map((s) => {
										const Icon = SOURCE_ICON[s.kind];
										const body = (
											<>
												<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-paper text-ink-2">
													<Icon className="size-3.5" strokeWidth={1.75} />
												</span>
												<span className="flex min-w-0 flex-col">
													<span className="truncate font-medium text-ink text-sm">{s.title}</span>
													<span className="truncate text-ink-3 text-xs">{s.detail}</span>
												</span>
											</>
										);
										return (
											<li key={`${s.kind}-${s.title}`}>
												{s.to ? (
													<Link to={s.to} className="flex items-center gap-2.5 rounded-lg bg-mist px-2.5 py-2 transition-colors hover:bg-ink/6">
														{body}
													</Link>
												) : (
													<div className="flex items-center gap-2.5 rounded-lg bg-mist px-2.5 py-2">{body}</div>
												)}
											</li>
										);
									})}
								</ul>
							</section>
							<section className="flex flex-wrap items-center justify-between gap-3">
								<UndoControl e={e} now={now} />
								{e.record ? (
									<Link to={e.record.to} search={e.record.search} className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-arc-ink text-sm hover:bg-arc-tint">
										{RECORD_LABEL[e.record.kind]} openen
										<ChevronRight className="size-3.5" strokeWidth={2} />
									</Link>
								) : null}
							</section>
							<p className="text-ink-3 text-xs leading-normal">
								Beleid versie {e.policyVersion} · {e.model} · prompt {e.promptVersion} · {e.id}
							</p>
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

/**
 * The agent rows on one record's timeline: compact, with a heading only when there are any. Used on
 * tickets, orders, returns and products; a record without agent work draws nothing.
 */
export function AgentTimeline({ entries, title = "Wat Insyte hier deed", empty }: { entries: ReadonlyArray<AgentLogEntry>; title?: string; empty?: ReactNode }) {
	const now = useNow();
	const [open, setOpen] = useState<AgentLogEntry | null>(null);
	if (entries.length === 0) return empty ? <>{empty}</> : null;
	return (
		<section className="flex flex-col gap-1.5" aria-label={title}>
			<h3 className="flex items-center gap-1.5 font-medium text-ink-3 text-xs">
				<Sparkle className="size-3.5" strokeWidth={1.75} />
				{title}
			</h3>
			<ul className="-mx-3 flex flex-col">
				{entries.map((e) => (
					<AgentLogRow key={e.id} e={e} now={now} compact onOpen={setOpen} />
				))}
			</ul>
			<AgentLogDrawer e={open} onClose={() => setOpen(null)} />
		</section>
	);
}

/* ── a touchpoint: plate at Eerst vragen, log row at Zelf doen ─────────────────────────────── */

export type AgentDraft = Omit<AgentLogEntry, "id" | "at" | "undoUntil" | "policyVersion" | "model" | "promptVersion" | "level" | "approvedBy" | "status" | "action">;

/**
 * One thing the agent wants to do, asked of the policy every render. At Zelf doen it does it at
 * once and shows the log row; at Eerst vragen it draws the plate, and filing runs the same action
 * under the person's name; at Nooit nothing is shown. Flipping the row on Zelfstandigheid flips
 * this between the two, which is the whole point of the setting.
 *
 * `perform` changes the records and returns what the log should say about it (its effect for the
 * undo, and before/after); it runs once per `id`.
 */
export function AgentSuggestion({
	id,
	action,
	proposal,
	evidence,
	draft,
	perform,
	wide,
	level = 3,
	confirmFirst,
}: {
	/** For what cannot be taken back (a refund): filing asks first, naming the consequence. */
	confirmFirst?: { title: string; description: string; confirmLabel: string } | undefined;
	id: string;
	action: AgentLogEntry["action"];
	proposal: import("../lib/ask/scripts").Proposal;
	evidence?: ReactNode;
	draft: AgentDraft;
	perform: () => Partial<Pick<AgentLogEntry, "effect" | "before" | "after" | "sentence">> | null;
	wide?: boolean;
	level?: 2 | 3;
}) {
	const decision = useDecide(action);
	const settled = useAgentLog((s) => s.suggestions[id]);
	const entries = useAgentEntries();
	const me = useMyName();
	const version = useAutonomy((s) => s.version);
	const now = useNow();
	const [open, setOpen] = useState<AgentLogEntry | null>(null);
	const [asking, setAsking] = useState(false);
	const ran = useRef(false);

	const run = (as: "auto" | "ask") => {
		const done = perform();
		if (!done) return;
		const entry = useAgentLog.getState().record({ ...draft, ...done, action, level: as, approvedBy: as === "ask" ? me : undefined, status: "done", policyVersion: version });
		useAgentLog.getState().settle(id, { state: as === "auto" ? "ran" : "filed", entryId: entry.id });
	};

	useEffect(() => {
		if (decision === "run" && !settled && !ran.current) {
			ran.current = true;
			run("auto");
		}
	});

	if (settled?.state === "discarded") return null;
	if (settled) {
		const e = entries.find((x) => x.id === settled.entryId);
		if (!e) return null;
		return (
			<>
				<ul className="rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
					<AgentLogRow e={e} now={now} onOpen={setOpen} />
				</ul>
				<AgentLogDrawer e={open} onClose={() => setOpen(null)} />
			</>
		);
	}
	if (decision !== "propose") return null;
	return (
		<div className="flex flex-col gap-1.5">
			<ProposalPlate
				proposal={proposal}
				decision="open"
				wide={wide}
				level={level}
				evidence={evidence}
				onFile={() => (confirmFirst ? setAsking(true) : run("ask"))}
				onEdit={() => toast("Pas het voorstel aan in Vraag Insyte", { description: proposal.title })}
				onDiscard={() => {
					useAgentLog.getState().settle(id, { state: "discarded" });
					toast("Voorstel genegeerd", { duration: 6000, action: { label: "Ongedaan maken", onClick: () => useAgentLog.getState().settle(id, null) } });
				}}
			/>
			<WhyAsks action={action} />
			{confirmFirst ? (
				<ConfirmDialog
					open={asking}
					onOpenChange={setAsking}
					title={confirmFirst.title}
					description={confirmFirst.description}
					confirmLabel={confirmFirst.confirmLabel}
					onConfirm={() => {
						setAsking(false);
						run("ask");
					}}
				/>
			) : null}
		</div>
	);
}

/** "Waarom vraagt Insyte dit?" under a plate: the row on Zelfstandigheid that makes it ask. */
export function WhyAsks({ action }: { action: AgentLogEntry["action"] }) {
	const entry = ENTRY[action];
	return (
		<Link to="/settings/ai/autonomy" search={{ actie: action }} className="flex w-fit items-center gap-1.5 rounded-sm px-1 text-ink-3 text-xs transition-colors hover:text-ink">
			{entry?.locked ? <Lock className="size-3" strokeWidth={2} /> : <Shield className="size-3" strokeWidth={1.75} />}
			{entry?.locked ? `Vraagt altijd: ${entry.locked.charAt(0).toLowerCase()}${entry.locked.slice(1)}` : `Waarom vraagt Insyte dit? ${entry?.label ?? ""} staat op Eerst vragen`}
		</Link>
	);
}

/** A record's agent rows, read from the log: `<RecordAgentRows kind="ticket" id="tkt_4000" />`. */
export function RecordAgentRows({ kind, id, title }: { kind: import("../lib/agent-log").LogRecordKind; id: string; title?: string }) {
	const rows = useAgentEntriesFor(kind, id);
	return <AgentTimeline entries={rows} title={title} />;
}

/**
 * The agent's latest action of one kind, while it is recent: what a view shows in the place its
 * plate stood once the agent did the work itself ("6 bestellingen doorgestuurd"), so the undo is
 * where the decision was.
 */
export function RecentAgentRow({ action, within = 60 * 60_000, recordId }: { action: AgentLogEntry["action"]; within?: number; recordId?: string }) {
	const entries = useAgentEntries();
	const now = useNow();
	const [open, setOpen] = useState<AgentLogEntry | null>(null);
	const e = entries.find((x) => x.action === action && now - Date.parse(x.at) < within && (!recordId || x.record?.id === recordId));
	if (!e) return null;
	return (
		<>
			<ul className="rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
				<AgentLogRow e={e} now={now} onOpen={setOpen} />
			</ul>
			<AgentLogDrawer e={open} onClose={() => setOpen(null)} />
		</>
	);
}
