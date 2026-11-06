import {
	ArrowRight,
	Check,
	ChevronDown,
	Copy,
	CornerDownLeft,
	Factory,
	FileText,
	type IconComponent,
	Inbox,
	RotateCcw,
	ShoppingBag,
	Sparkle,
	Store,
	Ticket,
	User,
} from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import type { Proposal, RefKind, Source, Token, Tool } from "../lib/ask/scripts";
import { cn } from "../lib/utils";
import type { Decision } from "../stores/ask-store";

/*
 * Ask Insyte's agent parts, after the patterns in beautifului.dev's agent kit — thinking trace,
 * streaming text, tool chips, context cards, recommendation card — drawn in Insyte's own grammar:
 * the trace hangs from a ruled line like the plate's leader lines, records are Arc chips that open
 * the record, and the proposal IS a plate: Abyss ground, the drafting grid, a confidence measured on
 * a dimension line rather than printed as a percentage, and File / Discard at its foot.
 */

const KIND_ICON: Record<RefKind | "queue", IconComponent> = {
	order: ShoppingBag,
	chargeback: CornerDownLeft,
	ticket: Ticket,
	customer: User,
	supplier: Factory,
	store: Store,
	queue: Inbox,
};

/** Insyte's mark in a thread: the four-point star on an Abyss tile. */
export function InsyteMark({ size = 22, working = false }: { size?: number; working?: boolean }) {
	return (
		<span
			className={cn("flex shrink-0 items-center justify-center rounded-md bg-abyss text-mesh-ink", working && "ask-mark-working")}
			style={{ width: size, height: size }}
			aria-hidden
		>
			<Sparkle className="size-[58%]" strokeWidth={1.75} />
		</span>
	);
}

/** A label that shimmers while the agent works, the beautifului `Shimmer` on our ink ramp. */
export function Shimmer({ children }: { children: ReactNode }) {
	return <span className="ask-shimmer">{children}</span>;
}

/* ─── Thinking ──────────────────────────────────────────────────────────── */

export function Thinking({
	steps,
	reached,
	working,
	seconds,
}: {
	steps: ReadonlyArray<string>;
	/** How many steps have started. */
	reached: number;
	working: boolean;
	seconds: number;
}) {
	const [manual, setManual] = useState<boolean | null>(null);
	const open = manual ?? working;
	const still = useReducedMotion();
	return (
		<div className="flex flex-col">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setManual(!open)}
				className="-ml-1.5 flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm transition-colors hover:bg-ink/5"
			>
				<span role="status" className="font-medium">
					{working ? <Shimmer>Denkt na</Shimmer> : <span className="text-ink-3">{seconds} s nagedacht</span>}
				</span>
				<ChevronDown className={cn("size-3.5 text-ink-3 transition-transform duration-300", open && "rotate-180")} strokeWidth={2} />
			</button>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.ol
						initial={still ? false : { height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
						className="relative ml-[5px] overflow-hidden pl-4"
					>
						<span aria-hidden className="absolute top-1 bottom-2 left-[3px] w-px bg-ink/12" />
						{steps.slice(0, Math.max(1, reached)).map((s, i) => {
							const done = !working || i < reached - 1;
							return (
								<motion.li
									key={s}
									initial={still ? false : { opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
									className="flex min-h-7 items-center gap-2 text-sm"
								>
									{done ? (
										<Check className="size-3.5 shrink-0 text-ink-3" strokeWidth={2.25} />
									) : (
										<span className="ask-spin size-3 shrink-0 rounded-full" aria-hidden />
									)}
									<span className={done ? "text-ink-2" : "text-ink"}>{s}</span>
								</motion.li>
							);
						})}
					</motion.ol>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/* ─── Tools ─────────────────────────────────────────────────────────────── */

export function ToolChips({ tools }: { tools: ReadonlyArray<Tool> }) {
	if (tools.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1">
			{tools.map((t, i) => (
				<span
					key={`${t.verb}-${t.object}`}
					className="ask-rise flex h-6 items-center gap-1.5 rounded-md bg-mist px-2 text-xs text-ink-2"
					style={{ animationDelay: `${i * 60}ms` }}
				>
					<FileText className="size-3 text-ink-3" strokeWidth={1.75} />
					<span className="text-ink-3">{t.verb}</span>
					{t.object}
				</span>
			))}
		</div>
	);
}

/* ─── The answer ────────────────────────────────────────────────────────── */

/**
 * The answer, streamed. Words resolve out of a light blur at the leading edge and the caret holds
 * solid while it writes; a record arrives as a chip that pops in where it is named.
 */
export function Answer({ tokens, shown, streaming }: { tokens: ReadonlyArray<Token>; shown: number; streaming: boolean }) {
	return (
		<p className="text-base text-ink leading-relaxed">
			{tokens.slice(0, shown).map((tok, i) =>
				"ref" in tok ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: an append-only stream of one answer
					<RefChip key={i} tok={tok} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: an append-only stream of one answer
					<span key={i} className={streaming && i >= shown - 6 ? "ask-word" : undefined}>
						{tok.t}
					</span>
				),
			)}
			{streaming ? <span aria-hidden className="ask-caret" /> : null}
		</p>
	);
}

function RefChip({ tok }: { tok: Extract<Token, { ref: string }> }) {
	const Icon = KIND_ICON[tok.kind];
	return (
		<Link
			to={tok.to}
			className="ask-pop mx-0.5 inline-flex h-5 translate-y-[-1px] items-center gap-1 rounded-[5px] bg-arc-tint px-1.5 align-middle font-medium text-arc-ink text-sm leading-none transition-colors hover:bg-arc/15"
		>
			<Icon className="size-3" strokeWidth={1.75} />
			{tok.ref}
		</Link>
	);
}

export function AnswerActions({ text, onRetry }: { text: string; onRetry: () => void }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="ask-rise flex items-center gap-0.5">
			<button
				type="button"
				aria-label="Antwoord kopiëren"
				title="Kopiëren"
				onClick={() => {
					void navigator.clipboard?.writeText(text);
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1400);
				}}
				className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				{copied ? <Check className="size-3.5" strokeWidth={2.25} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
			</button>
			<button
				type="button"
				aria-label="Opnieuw vragen"
				title="Opnieuw vragen"
				onClick={onRetry}
				className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				<RotateCcw className="size-3.5" strokeWidth={1.75} />
			</button>
		</div>
	);
}

/* ─── Sources ───────────────────────────────────────────────────────────── */

export function Sources({ sources }: { sources: ReadonlyArray<Source> }) {
	const [open, setOpen] = useState(false);
	if (sources.length === 0) return null;
	return (
		<div className="ask-rise flex flex-col gap-1">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="-ml-1.5 flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink"
			>
				<span className="flex -space-x-1">
					{sources.slice(0, 3).map((s) => {
						const Icon = KIND_ICON[s.kind];
						return (
							<span key={s.title} className="flex size-4 items-center justify-center rounded-[4px] bg-paper text-ink-3 ring-1 ring-ink/10">
								<Icon className="size-2.5" strokeWidth={2} />
							</span>
						);
					})}
				</span>
				{sources.length} {sources.length === 1 ? "bron" : "bronnen"} gelezen
				<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} strokeWidth={2} />
			</button>
			{open ? <SourceList sources={sources} /> : null}
		</div>
	);
}

export function SourceList({ sources }: { sources: ReadonlyArray<Source> }) {
	return (
		<ul className="flex flex-col gap-1">
			{sources.map((s) => {
				const Icon = KIND_ICON[s.kind];
				return (
					<li key={`${s.kind}-${s.title}`}>
						<Link to={s.to} className="flex items-center gap-2.5 rounded-lg bg-mist px-2.5 py-2 transition-colors hover:bg-ink/6">
							<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-paper text-ink-2">
								<Icon className="size-3.5" strokeWidth={1.75} />
							</span>
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium text-sm text-ink">{s.title}</span>
								<span className="truncate text-xs text-ink-3">{s.detail}</span>
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

/* ─── The proposal, as a plate ──────────────────────────────────────────── */

export function ProposalPlate({
	proposal,
	decision,
	onFile,
	onDiscard,
	onEdit,
	level = 3,
	wide = false,
	evidence,
}: {
	/** The heading level the plate's title takes where it sits; a plate on a page is an h2. */
	level?: 2 | 3;
	proposal: Proposal;
	decision: Decision;
	onFile: () => void;
	onDiscard: () => void;
	onEdit: () => void;
	/**
	 * On a list page the plate spans the page: the proposal and its evidence on the left, the
	 * decision in a column of its own on the right. In a reading column (Ask Insyte) it stacks.
	 */
	wide?: boolean;
	/** The figures the proposal rests on, drawn under its body. */
	evidence?: React.ReactNode;
}) {
	const still = useReducedMotion();
	const settled = decision !== "open";
	const Title = level === 2 ? "h2" : "h3";

	const stamp = (
		<AnimatePresence>
			{settled ? (
				<motion.span
					initial={still ? false : { opacity: 0, scale: 1.4, rotate: -6 }}
					animate={{ opacity: 1, scale: 1, rotate: -4 }}
					className={cn(
						"ml-auto rounded-sm px-1.5 py-0.5 font-medium text-xs ring-1",
						decision === "filed" ? "text-mesh-ink ring-mesh-ink/60" : "text-mesh-ink-2 ring-mesh-ink-3/60",
					)}
				>
					{decision === "filed" ? "Uitgevoerd" : "Genegeerd"}
				</motion.span>
			) : null}
		</AnimatePresence>
	);

	/* Confidence, measured: a dimension line with end ticks, filled to where it reaches. */
	const confidence = (
		<div className="flex items-center gap-2.5" aria-label={`Zekerheid ${proposal.confidence} van 100`}>
			<span className="text-xs text-mesh-ink-2">Zekerheid</span>
			<span className="relative h-2.5 flex-1">
				<span className="absolute top-1/2 right-0 left-0 h-px bg-mesh-ink/25" />
				<span className="absolute top-0 bottom-0 left-0 w-px bg-mesh-ink/50" />
				<span className="absolute top-0 right-0 bottom-0 w-px bg-mesh-ink/50" />
				<motion.span
					className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-mesh-ink"
					initial={still ? false : { width: 0 }}
					animate={{ width: `${proposal.confidence}%` }}
					transition={{ duration: 0.42, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
				/>
			</span>
			<span className="w-14 text-right text-xs text-mesh-ink-2">{proposal.confidence >= 90 ? "Hoog" : proposal.confidence >= 75 ? "Goed" : "Redelijk"}</span>
		</div>
	);

	const file = (
		<button
			type="button"
			onClick={onFile}
			className={cn(
				"flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-abyss text-sm transition-colors hover:bg-arc-tint",
				wide && "justify-center",
			)}
		>
			{proposal.fileLabel}
			<ArrowRight className="size-3.5" strokeWidth={2} />
		</button>
	);
	const quiet = "flex h-8 cursor-pointer items-center rounded-md px-2.5 font-medium text-mesh-ink-2 text-sm transition-colors hover:bg-white/10 hover:text-mesh-ink";
	const done = (
		<p className="text-sm text-mesh-ink-2">
			{decision === "filed" ? "Klaar. Je kunt het een paar seconden ongedaan maken via de melding." : "Er is niets gewijzigd."}
		</p>
	);

	return (
		<motion.section
			aria-label={`Voorstel: ${proposal.title}`}
			initial={still ? false : { opacity: 0, clipPath: "inset(0 0 0 100%)" }}
			animate={{ opacity: 1, clipPath: "inset(0 0 0 0%)" }}
			transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
			className={cn(
				"plate relative overflow-hidden rounded-xl text-mesh-ink transition-[filter] duration-500",
				wide ? "grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-0 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_300px]" : "p-4",
				settled && "saturate-[0.6]",
			)}
		>
			<div className={cn("flex min-w-0 flex-col", wide && "lg:col-start-1 lg:row-start-1 lg:pr-8")}>
				<header className="flex items-start gap-2">
					<span className="mt-0.5 text-xs text-mesh-ink-2">Voorstel</span>
					{wide ? null : stamp}
				</header>
				<Title className={cn("mt-1 font-medium text-mesh-ink leading-snug", wide ? "max-w-[64ch] text-lg" : "text-md")}>{proposal.title}</Title>
				<p className={cn("mt-1.5 text-sm text-mesh-ink-2 leading-relaxed", wide && "max-w-[72ch]")}>{proposal.body}</p>
				{evidence && !wide ? <div className="mt-4">{evidence}</div> : null}
				{wide ? null : (
					<>
						<div className="mt-3.5">{confidence}</div>
						<p className="mt-2 text-xs text-mesh-ink-2 leading-relaxed">{proposal.why}</p>
						<footer className="mt-4 flex items-center gap-1.5">
							{settled ? (
								done
							) : (
								<>
									{file}
									<button type="button" onClick={onEdit} className={quiet}>
										Bewerken
									</button>
									<button type="button" onClick={onDiscard} className={cn(quiet, "ml-auto")}>
										Negeren
									</button>
								</>
							)}
						</footer>
					</>
				)}
			</div>
			{wide && evidence ? (
				// Under the proposal at laptop width; a column of its own when the page is wide enough.
				<div className="flex min-w-0 items-end lg:col-start-1 lg:row-start-2 lg:pr-8 2xl:col-start-2 2xl:row-start-1 2xl:items-center 2xl:pl-8 2xl:shadow-[inset_1px_0_0_color-mix(in_oklch,var(--mesh-ink)_14%,transparent)]">
					{evidence}
				</div>
			) : null}
			{wide ? (
				// The decision gets its own column, ruled off the evidence by one faint line.
				<div className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pl-8 lg:shadow-[inset_1px_0_0_color-mix(in_oklch,var(--mesh-ink)_14%,transparent)] 2xl:col-start-3">
					<div className="flex items-center">{stamp}</div>
					{confidence}
					<p className="text-xs text-mesh-ink-2 leading-relaxed">{proposal.why}</p>
					<div className="mt-auto flex flex-col gap-1.5 pt-2">
						{settled ? (
							done
						) : (
							<>
								{file}
								<div className="flex items-center justify-between">
									<button type="button" onClick={onEdit} className={quiet}>
										Bewerken
									</button>
									<button type="button" onClick={onDiscard} className={quiet}>
										Negeren
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			) : null}
		</motion.section>
	);
}

/* ─── Follow-ups ────────────────────────────────────────────────────────── */

export function FollowUps({ items, onPick }: { items: ReadonlyArray<string>; onPick: (s: string) => void }) {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col">
			{items.map((f, i) => (
				<button
					key={f}
					type="button"
					onClick={() => onPick(f)}
					className="ask-rise group/fu -mx-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
					style={{ animationDelay: `${120 + i * 60}ms` }}
				>
					<CornerDownLeft className="size-3.5 shrink-0 rotate-180 text-ink-4 group-hover/fu:text-arc-ink" strokeWidth={1.75} />
					{f}
				</button>
			))}
		</div>
	);
}

