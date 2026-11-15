import { CornerDownLeft, Factory, type IconComponent, Inbox, Mail } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { plainOf, type Script, type Turn } from "../lib/ask/types";
import { getGreeting } from "../lib/greetings";
import { cn } from "../lib/utils";
import { useAskSource } from "./ask-source";
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
	const { turns, ask, busy, mentions } = useAskSource();
	const scroller = useRef<HTMLDivElement>(null);
	const composer = useRef<PromptBarHandle>(null);
	const playing = busy ?? turns?.some((t) => t.role === "assistant" && !t.settled) ?? false;

	const follow = useCallback(() => {
		const el = scroller.current;
		if (el) el.scrollTo({ top: el.scrollHeight });
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a turn is added
	useEffect(follow, [turns?.length]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-5 py-5" : "px-6 py-8")}>
				<div className={cn("mx-auto flex flex-col gap-7", compact ? "" : "max-w-[680px]")}>
					{turns ? (
						turns.map((t) =>
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
					<PromptBar ref={composer} onSend={ask} busy={playing} mentions={mentions} autoFocus />
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
	const { script, live } = turn;
	const { settle, decide: decideTurn, retry, file } = useAskSource();
	const still = useReducedMotion();
	const [played, setPhase] = useState<Phase>(turn.settled || still || live ? "settled" : "thinking");
	const [reached, setReached] = useState(1);
	const [count, setShown] = useState(turn.settled || still || live ? script.answer.length : 0);
	// A streamed turn is drawn as it stands: the host's phase, every word that has come.
	const phase = live?.phase ?? played;
	const shown = live ? script.answer.length : count;
	const seconds = live?.seconds ?? Math.max(1, Math.round((script.steps.length * STEP_MS) / 1000));

	// biome-ignore lint/correctness/useExhaustiveDependencies: follow the streamed turn as it grows
	useEffect(() => {
		if (live) onProgress();
	}, [live?.phase, script.answer.length, script.steps.length]);

	// Think through the steps, one at a time.
	useEffect(() => {
		if (live || phase !== "thinking") return;
		const t = window.setTimeout(() => {
			if (reached < script.steps.length) setReached((r) => r + 1);
			else setPhase("streaming");
			onProgress();
		}, STEP_MS);
		return () => window.clearTimeout(t);
	}, [live, phase, reached, script.steps.length, onProgress]);

	// Then write the answer, a word at a time.
	useEffect(() => {
		if (live || phase !== "streaming") return;
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
	}, [live, phase, shown, script.answer.length, settle, turn.id, onProgress]);

	const done = phase === "settled";
	const plain = plainOf(script.answer);

	return (
		<div className="flex gap-3">
			<InsyteMark working={!done} />
			<div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5">
				<Thinking steps={script.steps} reached={done || live ? script.steps.length : reached} working={phase === "thinking"} seconds={seconds} />
				{phase !== "thinking" ? <Answer tokens={script.answer} shown={shown} streaming={phase === "streaming"} /> : null}
				{done ? (
					<>
						<ToolChips tools={script.tools} />
						{script.proposal ? (
							<ProposalPlate
								proposal={script.proposal}
								decision={turn.decision}
								onFile={() => {
									if (script.proposal) file?.(script.proposal.action);
									decideTurn(turn.id, "filed");
								}}
								onDiscard={() => decideTurn(turn.id, "discarded")}
								onEdit={() => onEdit(editPrompt(script))}
							/>
						) : null}
						<div className="flex items-center justify-between gap-2">
							<Sources sources={script.sources} />
							<AnswerActions text={plain} onRetry={() => (retry ? retry(turn.id) : onAsk(retryPrompt(script)))} />
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

/* ─── First view ────────────────────────────────────────────────────────── */

const STARTS: ReadonlyArray<{ icon: IconComponent; text: string }> = [
	{ icon: Inbox, text: "Vat de open zaken van vandaag samen" },
	{ icon: Factory, text: "Welke bestellingen dreigen te laat te komen?" },
	{ icon: Mail, text: "Stel een antwoord op aan Daniel over zijn vertraagde levering" },
	{ icon: CornerDownLeft, text: "Welke chargebacks hebben bewijs nodig?" },
];

function Welcome({ onPick, compact }: { onPick: (s: string) => void; compact: boolean }) {
	const still = useReducedMotion();
	const { name: first, needs, starts } = useAskSource().welcome;
	const items = starts === undefined ? STARTS : starts.map((text, i) => ({ icon: STARTS[i % STARTS.length]!.icon, text }));
	return (
		<div className={cn("flex flex-col gap-6", compact ? "pt-2" : "pt-[8vh]")}>
			<div className="flex flex-col gap-3">
				<InsyteMark size={compact ? 32 : 40} />
				<h2 className={cn("font-medium text-ink", compact ? "text-xl" : "text-3xl")}>
					{getGreeting(first).salutation.replace(/\.$/, "")}. Waar zullen we naar kijken?
				</h2>
				<p className="max-w-[52ch] text-base text-ink-2 leading-relaxed">
					{needs === null ? "Ik lees de wachtrij van vandaag als je erom vraagt." : `Ik heb de wachtrij van vandaag gelezen: ${needs} ${needs === 1 ? "zaak wacht" : "zaken wachten"} op jou.`} Ik kan bestellingen, tickets,
					chargebacks en leveranciers doorzoeken en uitwerken wat ik zou doen als voorstel. Ik werk binnen de regels die jij stelt: wat geld of klanten raakt, leg ik eerst aan je voor.
				</p>
			</div>
			<ul className="flex flex-col gap-1">
				{items.map((s, i) => (
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
