import type { ChatRecordKind, ChatRecordRef } from "../../data-source";
import { type IconComponent, Package, ShieldAlert, ShoppingBag, Ticket, User, X } from "../../icons";
import { cn } from "../lib/utils";
import { type ChatRecord, KIND_LABEL, type Tone, useRecord } from "./records";

/*
 * A record in a conversation. Shared with # or named by a command, it is drawn as a small live card:
 * the record's handle in the brand's ink, the one line that says what it is, the figure, and its
 * status as a dot and a word. The card is a door, not a summary: clicking it opens the record in the
 * column beside the conversation, where it can be worked on without leaving the chat.
 */

export const KIND_ICON: Record<ChatRecordKind, IconComponent> = {
	order: ShoppingBag,
	customer: User,
	product: Package,
	chargeback: ShieldAlert,
	ticket: Ticket,
};

const DOT: Record<Tone, string> = {
	arc: "bg-arc",
	green: "bg-signal-green",
	amber: "bg-signal-amber",
	red: "bg-signal-red",
	quiet: "bg-ink-4",
};

/** A status as a dot and a word: the word stays ink, so no state is said in green text. */
export function StatusDot({ status, className }: { status: { label: string; tone: Tone }; className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-ink-2 text-sm", className)}>
			<span className={cn("size-1.5 shrink-0 rounded-full", DOT[status.tone])} />
			{status.label}
		</span>
	);
}

export function KindTile({ kind, size = "md" }: { kind: ChatRecordKind; size?: "sm" | "md" }) {
	const Icon = KIND_ICON[kind];
	return (
		<span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-arc-tint text-arc-ink", size === "md" ? "size-9" : "size-6 rounded-md")}>
			<Icon className={size === "md" ? "size-4" : "size-3.5"} strokeWidth={1.75} />
		</span>
	);
}

export function RecordCard({ refTo, onOpen, active = false }: { refTo: ChatRecordRef; onOpen: (r: ChatRecordRef) => void; active?: boolean }) {
	const r = useRecord(refTo);
	if (!r) return <span className="text-ink-3 text-sm">{KIND_LABEL[refTo.kind]} niet meer gevonden</span>;
	return (
		<button
			type="button"
			onClick={() => onOpen(r.ref)}
			aria-label={`${KIND_LABEL[r.kind]} ${r.code} openen`}
			className={cn(
				"group/card flex w-full max-w-[460px] items-center gap-3 rounded-xl p-2.5 pr-3.5 text-left transition-[background-color,box-shadow] duration-200",
				active ? "bg-arc-tint shadow-[0_0_0_1.5px_var(--color-arc)]" : "bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_14px_-8px_rgb(0_0_0/0.18)] hover:bg-arc-tint/60",
			)}
		>
			<KindTile kind={r.kind} />
			<RecordLines r={r} />
		</button>
	);
}

export function RecordLines({ r }: { r: ChatRecord }) {
	return (
		<span className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="flex min-w-0 items-baseline gap-2">
				<span className="shrink-0 font-medium text-arc-ink text-sm">{r.code}</span>
				<span className="truncate font-medium text-base text-ink">{r.title}</span>
				<span className="flex-1" />
				{r.amount ? <span className="shrink-0 font-medium text-base text-ink tabular-nums">{r.amount}</span> : null}
			</span>
			<span className="flex min-w-0 items-center gap-2">
				<span className="truncate text-ink-3 text-sm">{r.detail}</span>
				<span className="flex-1" />
				{r.status ? <StatusDot status={r.status} className="shrink-0" /> : null}
			</span>
		</span>
	);
}

/** A record waiting in the composer, before the message goes. */
export function RecordChip({ refTo, onRemove }: { refTo: ChatRecordRef; onRemove: () => void }) {
	const r = useRecord(refTo);
	if (!r) return null;
	return (
		<span className="flex h-7 max-w-64 items-center gap-1.5 rounded-lg bg-arc-tint pr-1 pl-1.5 text-arc-ink">
			<KindTile kind={r.kind} size="sm" />
			<span className="font-medium text-sm">{r.code}</span>
			<span className="truncate text-ink-2 text-sm">{r.title}</span>
			<button type="button" onClick={onRemove} aria-label={`${r.code} weghalen`} className="flex size-5 shrink-0 items-center justify-center rounded-md text-arc-ink/70 hover:bg-arc/15 hover:text-arc-ink">
				<X className="size-3" strokeWidth={2} />
			</button>
		</span>
	);
}
