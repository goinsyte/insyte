import { Lock } from "../../icons";
import { CATALOGUE, LEVEL_LABEL, type AgentActionId, type AutonomyLevel } from "../lib/autonomy";
import { OFFLINE_ACTIONS, OFFLINE_WINDOWS, type OfflineWindow, type PreparedId } from "../lib/first-analysis";
import { cn } from "../lib/utils";
import { useAutonomy } from "../stores/autonomy-store";
import { SelectionGroup, SelectionTile } from "./selection-tile";
import type { OnboardingData } from "./use-onboarding-state";

/*
 * The offline step of the first analysis (PLAN 45), after `analysis` (`analysis-step.tsx`): what Insyte does while
 * nobody is online, as autonomy levels the operator can see and change.
 */

type Data = Record<string, unknown>;

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
