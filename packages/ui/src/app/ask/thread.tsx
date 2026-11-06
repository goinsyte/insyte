import { CornerDownLeft, Factory, type IconComponent, Inbox, Mail } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ticketsStore } from "../tickets/tickets-store";
import type { ProposalAction, Script } from "../lib/ask/scripts";
import { getGreeting } from "../lib/greetings";
import { currentUserByPersona } from "../../data-source";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { type Turn, useAsk } from "../stores/ask-store";
import { useWorkspace } from "../stores/workspace-store";
import { Answer, AnswerActions, FollowUps, InsyteMark, ProposalPlate, Sources, Thinking, ToolChips } from "./parts";
import { PromptBar, type PromptBarHandle } from "./prompt-bar";

/**
 * One Ask Insyte conversation, used by the drawer and by the /ask page.
 *
 * A turn plays as one sequence: the mark breathes and the trace thinks through its steps, the
 * answer streams with its record chips, and only once it has settled do the tools it ran, the
 * sources, the proposal and the follow-ups rise in. Then it is still. The proposal is where the
 * product's division of labour lives — Insyte drew it, the operator files it, edits it into the
 * composer, or discards it, and filing does the real thing to the workspace with Undo.
 */

const STEP_MS = 620;
const WORD_MS = 28;

export function Thread({ compact = false }: { compact?: boolean }) {
	const conversations = useAsk((s) => s.conversations);
	const active = useAsk((s) => s.active);
	const ask = useAsk((s) => s.ask);
	const conv = conversations.find((c) => c.id === active);
	const scroller = useRef<HTMLDivElement>(null);
	const composer = useRef<PromptBarHandle>(null);
	const playing = conv?.turns.some((t) => t.role === "assistant" && !t.settled) ?? false;

	const follow = useCallback(() => {
		const el = scroller.current;
		if (el) el.scrollTo({ top: el.scrollHeight });
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a turn is added
	useEffect(follow, [conv?.turns.length]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-5 py-5" : "px-6 py-8")}>
				<div className={cn("mx-auto flex flex-col gap-7", compact ? "" : "max-w-[680px]")}>
					{conv ? (
						conv.turns.map((t) =>
							t.role === "user" ? (
								<UserTurn key={t.id} text={t.text} />
							) : (
								<AssistantTurn
									key={t.id}
									turn={t}
									onProgress={follow}
									onAsk={ask}
									onEdit={(text) => composer.current?.fill(text)}
								/>
							),
						)
					) : (
						<Welcome onPick={ask} compact={compact} />
					)}
				</div>
			</div>
			<div className={cn("shrink-0", compact ? "px-4 pt-2 pb-4" : "px-6 pt-2 pb-6")}>
				<div className={cn("mx-auto", compact ? "" : "max-w-[680px]")}>
					<PromptBar ref={composer} onSend={ask} busy={playing} autoFocus />
				</div>
			</div>
		</div>
	);
}

function UserTurn({ text }: { text: string }) {
	return (
		<div className="ask-rise ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-mist px-3.5 py-2.5 text-base text-ink leading-relaxed">
			{text}
		</div>
	);
}

type Phase = "thinking" | "streaming" | "settled";

function AssistantTurn({
	turn,
	onProgress,
	onAsk,
	onEdit,
}: {
	turn: Extract<Turn, { role: "assistant" }>;
	onProgress: () => void;
	onAsk: (text: string) => void;
	onEdit: (text: string) => void;
}) {
	const { script } = turn;
	const settle = useAsk((s) => s.settle);
	const decideTurn = useAsk((s) => s.decide);
	const still = useReducedMotion();
	const navigate = useNavigate();
	const [phase, setPhase] = useState<Phase>(turn.settled || still ? "settled" : "thinking");
	const [reached, setReached] = useState(1);
	const [shown, setShown] = useState(turn.settled || still ? script.answer.length : 0);
	const seconds = Math.max(1, Math.round((script.steps.length * STEP_MS) / 1000));

	// Think through the steps, one at a time.
	useEffect(() => {
		if (phase !== "thinking") return;
		const t = window.setTimeout(() => {
			if (reached < script.steps.length) setReached((r) => r + 1);
			else setPhase("streaming");
			onProgress();
		}, STEP_MS);
		return () => window.clearTimeout(t);
	}, [phase, reached, script.steps.length, onProgress]);

	// Then write the answer, a word at a time.
	useEffect(() => {
		if (phase !== "streaming") return;
		if (shown >= script.answer.length) {
			setPhase("settled");
			settle(turn.id);
			onProgress();
			return;
		}
		const t = window.setTimeout(() => {
			setShown((n) => Math.min(script.answer.length, n + 2));
			onProgress();
		}, WORD_MS);
		return () => window.clearTimeout(t);
	}, [phase, shown, script.answer.length, settle, turn.id, onProgress]);

	const done = phase === "settled";
	const plain = script.answer.map((t) => ("ref" in t ? t.ref : t.t)).join("");

	return (
		<div className="flex gap-3">
			<InsyteMark working={!done} />
			<div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5">
				<Thinking steps={script.steps} reached={done ? script.steps.length : reached} working={phase === "thinking"} seconds={seconds} />
				{phase !== "thinking" ? <Answer tokens={script.answer} shown={shown} streaming={phase === "streaming"} /> : null}
				{done ? (
					<>
						<ToolChips tools={script.tools} />
						{script.proposal ? (
							<ProposalPlate
								proposal={script.proposal}
								decision={turn.decision}
								onFile={() => {
									run(script.proposal?.action, navigate);
									decideTurn(turn.id, "filed");
								}}
								onDiscard={() => decideTurn(turn.id, "discarded")}
								onEdit={() => onEdit(editPrompt(script))}
							/>
						) : null}
						<div className="flex items-center justify-between gap-2">
							<Sources sources={script.sources} />
							<AnswerActions text={plain} onRetry={() => onAsk(retryPrompt(script))} />
						</div>
						<FollowUps items={script.followUps} onPick={onAsk} />
					</>
				) : null}
			</div>
		</div>
	);
}

const editPrompt = (s: Script) => (s.proposal ? `Pas het voorstel "${s.proposal.title}" aan: ` : "");
const retryPrompt = (s: Script) => s.followUps[0] ?? "Vat de open zaken van vandaag samen";

/** Filing a proposal does the real thing to the workspace, with Undo where there is one. */
function run(action: ProposalAction | undefined, navigate: ReturnType<typeof useNavigate>) {
	if (!action) return;
	const ws = useWorkspace.getState();
	if (action.kind === "file-queue") {
		const before = ws.fileQueue(action.queueId);
		if (before !== undefined) undoable(action.label, () => useWorkspace.getState().restoreQueue(action.queueId, before));
	} else if (action.kind === "supplier-ticket") {
		const id = `ticket_ask_${Date.now()}`;
		const now = new Date().toISOString();
		ticketsStore.add({
			id,
			number: `TKT-${String(900 + ws.tickets.length + 1).padStart(4, "0")}`,
			title: `Nieuwe overdrachtsdata van ${action.supplier}`,
			description: `${action.supplier} gevraagd om nieuwe overdrachtsdata voor ${action.orders.join(", ")}.`,
			status: "awaiting_reply",
			priority: "medium",
			tags: ["Leverancier"],
			assignee_ids: [],
			created_at: now,
			updated_at: now,
		});
		undoable(`Ticket geopend voor ${action.supplier}`, () => ticketsStore.remove(id), "Het staat op het bord onder Wacht op antwoord.");
	} else if (action.kind === "send-reply") {
		// The email is simulated; what the workspace keeps is the conversation, as a ticket waiting on them.
		const ticket = ws.createTicket({
			title: `Wacht op ${action.to}`,
			description: `Beantwoord: ${action.body}`,
			priority: "low",
			status: "awaiting_reply",
			tags: ["Klant"],
		});
		undoable(`Antwoord verstuurd naar ${action.to}`, () => ticketsStore.remove(ticket.id), `Gevolgd als ${ticket.number} onder Wacht op antwoord.`);
	} else {
		void navigate({ to: action.to });
	}
}

/* ─── First view ────────────────────────────────────────────────────────── */

const STARTS: ReadonlyArray<{ icon: IconComponent; text: string }> = [
	{ icon: Inbox, text: "Vat de open zaken van vandaag samen" },
	{ icon: Factory, text: "Welke bestellingen dreigen te laat te komen?" },
	{ icon: Mail, text: "Stel een antwoord op aan Daniel over zijn vertraagde levering" },
	{ icon: CornerDownLeft, text: "Welke chargebacks hebben bewijs nodig?" },
];

function Welcome({ onPick, compact }: { onPick: (s: string) => void; compact: boolean }) {
	const still = useReducedMotion();
	const first = currentUserByPersona.admin.name.split(" ")[0] ?? "";
	const needs = useWorkspace((s) => s.queue.filter((q) => q.state === "open" && (q.signal === "red" || q.signal === "amber")).length);
	return (
		<div className={cn("flex flex-col gap-6", compact ? "pt-2" : "pt-[8vh]")}>
			<div className="flex flex-col gap-3">
				<InsyteMark size={compact ? 32 : 40} />
				<h2 className={cn("font-medium text-ink", compact ? "text-xl" : "text-3xl")}>
					{getGreeting(first).salutation.replace(/\.$/, "")}. Waar zullen we naar kijken?
				</h2>
				<p className="max-w-[52ch] text-base text-ink-2 leading-relaxed">
					Ik heb de wachtrij van vandaag gelezen: {needs} {needs === 1 ? "zaak wacht" : "zaken wachten"} op jou. Ik kan bestellingen, tickets,
					chargebacks en leveranciers doorzoeken en uitwerken wat ik zou doen als voorstel. Ik werk binnen de regels die jij stelt: wat geld of klanten raakt, leg ik eerst aan je voor.
				</p>
			</div>
			<ul className="flex flex-col gap-1">
				{STARTS.map((s, i) => (
					<motion.li
						key={s.text}
						initial={still ? false : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.32, delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] }}
					>
						<button
							type="button"
							onClick={() => onPick(s.text)}
							className="group/start flex w-full cursor-pointer items-center gap-3 rounded-lg bg-mist px-3 py-2.5 text-left text-base text-ink-2 transition-colors hover:bg-arc-tint hover:text-arc-ink"
						>
							<s.icon className="size-4 shrink-0 text-ink-3 group-hover/start:text-arc-ink" strokeWidth={1.75} />
							{s.text}
						</button>
					</motion.li>
				))}
			</ul>
		</div>
	);
}
