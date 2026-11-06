import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { firstAnalysisSeed } from "../../data-source";
import { Bot, Check, Lock, Sheet, Workflow } from "../../icons";
import { InsyteMark, Shimmer } from "../ask/parts";
import { CATALOGUE, LEVEL_LABEL, type AgentActionId, type AutonomyLevel } from "../lib/autonomy";
import { OFFLINE_ACTIONS, OFFLINE_WINDOWS, type OfflineWindow, type PreparedId, QUESTIONS } from "../lib/first-analysis";
import { cn } from "../lib/utils";
import { useAutonomy } from "../stores/autonomy-store";
import { SelectionGroup, SelectionTile } from "./selection-tile";
import type { OnboardingData } from "./use-onboarding-state";

/*
 * The two steps of the first analysis (PLAN 45), between the first import and "Je bent binnen".
 *
 * `analysis` reads the store, then either names the one problem worth fixing first, with the
 * evidence and the fix built, or, with too little history, says so and prepares instead. `offline`
 * sets what Insyte does while nobody is online, as autonomy levels the operator can see and change.
 * One finding, never a list: the first ten minutes stay small.
 */

const A = firstAnalysisSeed;
const PREPARED_ICON: Record<PreparedId, typeof Bot> = { automation: Workflow, agent: Bot, sheet: Sheet };
const PREPARED_KIND: Record<PreparedId, string> = { automation: "Concept", agent: "Eerst vragen", sheet: "Rekenblad" };

type Data = Record<string, unknown>;

/** Which way the analysis came out: a finding, an early read of the setup, or nothing to read. */
export function analysisMode(connected: boolean): "finding" | "early" | "none" {
	if (!connected) return "none";
	return A.finding ? "finding" : "early";
}

/** What is prepared unless the operator unticks it. With nothing to read, only the agent. */
export function defaultPrepared(connected: boolean): PreparedId[] {
	const mode = analysisMode(connected);
	return mode === "finding" ? ["automation", "agent", "sheet"] : mode === "early" ? ["automation", "agent"] : ["agent"];
}

export const preparedTitles = () => ({ automation: A.prepared.automation.title, agent: A.prepared.agent.title, sheet: A.prepared.sheet.title });

const nl = (n: number) => n.toLocaleString("nl-NL");

export function analysisCopy(connected: boolean, read: boolean) {
	const mode = analysisMode(connected);
	if (mode === "none")
		return {
			title: "Nog niets om te lezen.",
			subtitle: "Zonder gekoppelde winkel kan Insyte niet kijken. Twee vragen, dan staat het juiste klaar zodra je koppelt.",
		};
	if (!read) return { title: "Insyte leest je winkel.", subtitle: "Bestellingen, mail en je beleid. Dit duurt een paar seconden." };
	if (mode === "early")
		return {
			title: "Nog te vroeg om te oordelen.",
			subtitle: `${nl(A.store.orders)} bestellingen in ${A.store.days} dagen is te weinig om een knelpunt aan te wijzen. Insyte gokt niet, het bereidt voor.`,
		};
	return {
		title: "Dit pakt Insyte als eerste aan.",
		subtitle: `Gelezen: ${nl(A.store.orders)} bestellingen en ${nl(A.store.mails)} mails uit de laatste ${A.store.days} dagen.`,
	};
}

/* ─── analysis ───────────────────────────────────────────────────────────── */

export function AnalysisStep({ connected, data, patch }: { connected: boolean; data: Data; patch: (p: OnboardingData) => void }) {
	const mode = analysisMode(connected);
	const read = data.analysisRead === true || mode === "none";
	const prepared = (data.prepared as PreparedId[] | undefined) ?? defaultPrepared(connected);
	const answers = (data.answers as Record<string, string> | undefined) ?? {};

	if (!read) return <Reading onDone={() => patch({ analysisRead: true })} />;

	return (
		<motion.div className="flex flex-col gap-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}>
			{mode === "finding" && A.finding ? <FindingView /> : null}
			{mode === "early" && A.early ? <Predictions /> : null}
			{mode !== "finding" ? (
				<Questions answers={answers} onAnswer={(id, v) => patch({ answers: { ...answers, [id]: v } })} />
			) : null}
			{mode === "early" && A.early ? <WatchList /> : null}
			<section className="flex flex-col gap-2">
				<h2 className="font-medium text-sm text-ink">{mode === "none" ? "Staat klaar zodra je koppelt" : "Staat klaar"}</h2>
				<SelectionGroup mode="multi" value={prepared} onChange={(v) => patch({ prepared: v as PreparedId[] })} columns={1} label="Wat Insyte klaarzet">
					{defaultPrepared(connected).map((id) => (
						<SelectionTile
							key={id}
							id={id}
							icon={PREPARED_ICON[id]}
							label={A.prepared[id].title}
							hint={A.prepared[id].does}
							meta={<span className="text-xs text-ink-2">{id === "agent" && answers.reply === "auto" ? "Zelf doen" : PREPARED_KIND[id]}</span>}
						/>
					))}
				</SelectionGroup>
				<p className="text-sm text-ink-2 leading-normal">Niets hiervan gaat naar een klant voordat jij het hebt gezien.</p>
			</section>
		</motion.div>
	);
}

/** The reading: each source ticks off in turn, Insyte's mark working beside the one in progress. */
function Reading({ onDone }: { onDone: () => void }) {
	const still = useReducedMotion();
	const [at, setAt] = useState(still ? A.reads.length : 0);
	const done = useRef(onDone);
	done.current = onDone;
	useEffect(() => {
		if (at >= A.reads.length) {
			const t = window.setTimeout(() => done.current(), still ? 0 : 420);
			return () => window.clearTimeout(t);
		}
		const t = window.setTimeout(() => setAt((n) => n + 1), 720);
		return () => window.clearTimeout(t);
	}, [at, still]);
	return (
		<ul className="flex flex-col gap-1.5" role="status" aria-live="polite">
			{A.reads.map((label, i) => {
				const done = i < at;
				const now = i === at;
				return (
					<li key={label} className={cn("flex h-11 items-center gap-3 rounded-lg px-3.5 transition-colors duration-300", now || done ? "bg-paper" : "bg-paper/50")}>
						<span className="flex size-5 shrink-0 items-center justify-center">
							{done ? (
								<motion.span initial={still ? false : { scale: 0.4 }} animate={{ scale: 1 }}>
									<Check className="size-4 text-signal-green" strokeWidth={2.5} />
								</motion.span>
							) : now ? (
								<InsyteMark size={20} working />
							) : (
								<span className="size-1.5 rounded-full bg-ink/15" />
							)}
						</span>
						<span className={cn("flex-1 text-base", done ? "text-ink" : now ? "font-medium text-ink" : "text-ink-3")}>
							{now ? <Shimmer>{label}</Shimmer> : label}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

function FindingView() {
	const f = A.finding;
	if (!f) return null;
	return (
		<>
			<section className="flex flex-col gap-4 rounded-xl bg-paper p-4">
				<div className="flex items-start gap-3">
					<InsyteMark size={24} />
					<p className="font-medium text-lg text-ink leading-snug text-balance">{f.headline}</p>
				</div>
				<dl className="flex flex-col gap-3">
					{f.evidence.map((e) => (
						<div key={e.figure} className="flex flex-col gap-0.5">
							<dt className="text-base text-ink leading-snug">
								<span className="font-medium tabular-nums">{e.figure}</span> {e.says}
							</dt>
							<dd className="text-xs text-ink-3">{e.basis}</dd>
						</div>
					))}
				</dl>
			</section>
			<section className="flex flex-col gap-1.5">
				<h2 className="font-medium text-base text-ink">{f.fix.title}</h2>
				<p className="text-base text-ink-2 leading-normal">{f.fix.why}</p>
				<p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="rounded-md bg-arc-tint px-2 py-0.5 font-medium text-sm text-arc-ink tabular-nums">{f.effect.figure}</span>
					<span className="text-xs text-ink-3">{f.effect.basis}</span>
				</p>
			</section>
		</>
	);
}

function Predictions() {
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-medium text-sm text-ink">Wat je inrichting al zegt</h2>
			<ul className="flex flex-col gap-1.5">
				{A.early?.predictions.map((p) => (
					<li key={p.read} className="flex flex-col gap-1 rounded-lg bg-paper px-3.5 py-3">
						<span className="font-medium text-sm text-ink">{p.read}</span>
						<span className="text-sm text-ink-2 leading-normal">{p.expect}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function Questions({ answers, onAnswer }: { answers: Record<string, string>; onAnswer: (id: string, v: string) => void }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-medium text-sm text-ink">Twee vragen, zodat het juiste klaarstaat</h2>
			{QUESTIONS.map((q) => {
				const value = answers[q.id] ?? q.initial;
				return (
					<div key={q.id} className="flex flex-col gap-1.5">
						<span id={`q-${q.id}`} className="text-sm text-ink-2">
							{q.ask}
						</span>
						<div role="radiogroup" aria-labelledby={`q-${q.id}`} className="flex w-full items-center rounded-lg bg-ink/6 p-0.5 text-sm">
							{q.options.map((o) => (
								<button
									key={o.id}
									type="button"
									role="radio"
									aria-checked={value === o.id}
									onClick={() => onAnswer(q.id, o.id)}
									className={cn(
										"flex h-8 flex-1 items-center justify-center rounded-md px-2 font-medium transition-colors",
										value === o.id ? "bg-paper text-ink" : "text-ink-2 hover:text-ink",
									)}
								>
									{o.label}
								</button>
							))}
						</div>
					</div>
				);
			})}
		</section>
	);
}

function WatchList() {
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-medium text-sm text-ink">Waar Insyte op let</h2>
			<ul className="flex flex-col gap-3">
				{A.early?.watch.map((w) => (
					<li key={w.label} className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-sm text-ink">
								<span className="font-medium">{w.label}</span>
								<span className="text-ink-2">, {w.then}</span>
							</span>
							<span className="shrink-0 text-xs text-ink-2 tabular-nums">
								{w.have} van {w.need}
							</span>
						</div>
						<span className="h-1 overflow-hidden rounded-full bg-ink/8" aria-hidden>
							<span className="block h-full rounded-full bg-arc" style={{ width: `${Math.min(100, (w.have / w.need) * 100)}%` }} />
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

/* ─── offline ────────────────────────────────────────────────────────────── */

const ENTRY = new Map(CATALOGUE.map((e) => [e.id, e]));

/** The offline plan's rows: forwarding only when someone else ships. */
const offlineActions = (answers: Record<string, string>) => OFFLINE_ACTIONS.filter((a) => a.id !== "ForwardOrder" || answers.fulfilment !== "self");

/** What the offline plan proposes: routine work on its own, anything that speaks or pays on ask. */
export function proposedLevels(answers: Record<string, string>): Partial<Record<AgentActionId, AutonomyLevel>> {
	const policy = useAutonomy.getState().policy;
	const out: Partial<Record<AgentActionId, AutonomyLevel>> = {};
	for (const { id } of offlineActions(answers)) {
		const locked = ENTRY.get(id)?.locked;
		out[id] = locked ? "ask" : id === "ForwardOrder" || id === "ApplyLabel" ? "auto" : id === "SendReply" && answers.reply === "auto" ? "auto" : policy[id];
	}
	return out;
}

export function OfflineStep({ data, patch }: { data: Data; patch: (p: OnboardingData) => void }) {
	const answers = (data.answers as Record<string, string> | undefined) ?? {};
	const offline = (data.offlineWindow as OfflineWindow | undefined) ?? "evening";
	const levels = (data.offlineLevels as Partial<Record<AgentActionId, AutonomyLevel>> | undefined) ?? proposedLevels(answers);
	const prepared = (data.prepared as PreparedId[] | undefined) ?? [];
	const set = (id: AgentActionId, level: AutonomyLevel) => patch({ offlineLevels: { ...levels, [id]: level } });

	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-2">
				<h2 className="font-medium text-sm text-ink">Wanneer ben je meestal offline?</h2>
				<SelectionGroup mode="single" value={offline} onChange={(v) => patch({ offlineWindow: v as OfflineWindow })} columns={1} label="Wanneer je offline bent">
					{OFFLINE_WINDOWS.map((w) => (
						<SelectionTile key={w.id} id={w.id} label={w.label} hint={w.hint} />
					))}
				</SelectionGroup>
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="font-medium text-sm text-ink">Wat Insyte dan doet</h2>
				<ul className="flex flex-col gap-1.5">
					{offlineActions(answers).map(({ id, night }) => {
						const locked = ENTRY.get(id)?.locked;
						const level = levels[id] ?? "ask";
						return (
							<li key={id} className="flex flex-col gap-2 rounded-lg bg-paper px-3.5 py-3">
								<span className="text-sm text-ink">{night}</span>
								{locked ? (
									<span className="flex items-center gap-1.5 text-xs text-ink-2">
										<Lock className="size-3.5" strokeWidth={1.75} />
										{locked}
									</span>
								) : (
									<div role="radiogroup" aria-label={night} className="flex w-full items-center rounded-lg bg-ink/6 p-0.5 text-sm">
										{(["auto", "ask"] as const).map((l) => (
											<button
												key={l}
												type="button"
												role="radio"
												aria-checked={level === l}
												onClick={() => set(id, l)}
												className={cn(
													"flex h-7 flex-1 items-center justify-center rounded-md px-2 font-medium transition-colors",
													level === l ? "bg-paper text-ink" : "text-ink-2 hover:text-ink",
												)}
											>
												{l === "auto" ? LEVEL_LABEL.auto : "Klaarzetten voor mij"}
											</button>
										))}
									</div>
								)}
							</li>
						);
					})}
				</ul>
				<p className="text-sm text-ink-2 leading-normal">
					Wat Insyte zelf deed, staat morgenochtend op Start met een link naar waarom, en wat kan worden teruggedraaid heeft Ongedaan maken.
					{prepared.includes("automation") ? " De levertijd-update staat als concept klaar en draait pas als je hem aanzet." : ""}
				</p>
			</section>
		</div>
	);
}
