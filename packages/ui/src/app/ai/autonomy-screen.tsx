import { ArrowDown, ArrowUp, Clock, Grid2x2, RotateCcw } from "../../icons";
import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReadOnlyNotice } from "../access/route-gate";
import { PageGuide } from "../common/page-guide";
import { Notice } from "../developer/bits";
import { useMyName } from "../ask/agent-parts";
import { UnsavedBar } from "../settings/form";
import { SettingCard } from "../settings/setting-card";
import { WELL_BTN } from "../team/bits";
import { DEFAULT_POLICY, diffPolicy, ENTRY, LEVEL_LABEL, NEVER_REACHABLE, joinNl, type Policy } from "../lib/autonomy";
import { formatDateTime } from "../lib/format";
import { euro } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { useGate } from "../stores/access-store";
import { useAutonomy, workspaceSpent } from "../stores/autonomy-store";
import { AutonomyMatrix } from "./autonomy-matrix";

export type AutonomySearch = { actie?: string };

/**
 * Instellingen → Insyte AI → Zelfstandigheid (PLAN 29, ADR-0027): per action whether the agent may
 * do it itself, asks first, or never does it. The matrix, how the draft differs from the defaults,
 * and the history; what the levels mean is in the page's guide, not on the page. A draft until the
 * bar keeps it; keeping it makes a new version of the policy, with Undo.
 */
const GUIDE = [
	{ title: "Per actie een regel", body: "Zelf doen: Insyte doet het en zet het in het logboek. Eerst vragen: je krijgt een voorstel. Nooit: het gebeurt niet.", art: "rules" },
	{ title: "Geld vraagt altijd eerst", body: "Terugbetalen, annuleren en wat de andere kant niet kan terugdraaien zijn vergrendeld op Eerst vragen.", art: "lock" },
	{ title: "Buiten bereik", body: `Insyte kan nooit ${joinNl(NEVER_REACHABLE)}.`, art: "lock" },
	{ title: "Alles is terug te draaien", body: "Wat Insyte zelf deed staat met de reden in Wat Insyte deed. Binnen 5 minuten maak je het ongedaan.", art: "undo" },
	{ title: "Ook voor je eigen agents", body: "Een agent via een API-sleutel, of straks via MCP, volgt dezelfde regels.", art: "keys" },
] as const;

export function AutonomyPage() {
	const search = useSearch({ strict: false }) as AutonomySearch;
	const policy = useAutonomy((s) => s.policy);
	const version = useAutonomy((s) => s.version);
	const history = useAutonomy((s) => s.history);
	const spent = useAutonomy(workspaceSpent);
	const budget = useAutonomy((s) => s.budget);
	const gate = useGate("ai.autonomy");
	const readOnly = !gate.ok;
	const me = useMyName();
	const [draft, setDraft] = useState<Policy>(policy);
	const savedKey = JSON.stringify(policy);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as Policy);
		}
	}, [savedKey]);
	const dirty = JSON.stringify(draft) !== savedKey;
	const changes = useMemo(() => diffPolicy(DEFAULT_POLICY, draft), [draft]);
	const atDefault = diffPolicy(DEFAULT_POLICY, policy).length === 0;

	// A link from a log row or a plate lands on its row, washed for a moment.
	const [highlight, setHighlight] = useState<string | undefined>(search.actie);
	useEffect(() => {
		if (!search.actie) return;
		setHighlight(search.actie);
		document.getElementById(`actie-${search.actie}`)?.scrollIntoView({ block: "center" });
		const t = window.setTimeout(() => setHighlight(undefined), 2200);
		return () => window.clearTimeout(t);
	}, [search.actie]);

	function save() {
		const undo = useAutonomy.getState().savePolicy(draft, me);
		undoable(`Zelfstandigheid opgeslagen · versie ${version + 1}`, undo, "Vanaf nu werkt Insyte volgens deze regels. Elke wijziging staat in de geschiedenis.");
	}

	function restore() {
		const undo = useAutonomy.getState().savePolicy(DEFAULT_POLICY, me);
		undoable("Zelfstandigheid staat weer op de standaard", undo, "Alles komt weer eerst als voorstel bij jou.");
	}

	return (
		<>
			{readOnly ? <ReadOnlyNotice reason={gate.reason} /> : null}
			{spent ? (
				<Notice tone="amber" action={<Link to="/settings/ai/limits" className={WELL_BTN}>Limieten openen</Link>}>
					<span className="font-medium">Limiet bereikt.</span> {euro(budget.used)} van {euro(budget.limit ?? 0)} deze maand. Tot de maand omslaat of je de limiet verhoogt, komt alles wat Insyte zelf zou doen als voorstel bij jou.
				</Notice>
			) : null}

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
				<div className="flex min-w-0 flex-col gap-8">
					<SettingCard
						title="Per actie"
						icon={Grid2x2}
						action={
							!readOnly && !atDefault ? (
								<button type="button" onClick={restore} className={WELL_BTN}>
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									Standaard herstellen
								</button>
							) : null
						}
					>
						<div>
							<AutonomyMatrix policy={draft} readOnly={readOnly} highlight={highlight} onChange={(id, level) => setDraft((d) => ({ ...d, [id]: level }))} />
						</div>
					</SettingCard>

					<SettingCard title="Geschiedenis" icon={Clock} subtitle={`Versie ${version} is nu van kracht.`}>
						<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
							{history.slice(0, 6).map((h) => (
								<li key={h.id} className="flex flex-col gap-0.5 px-3.5 py-2.5">
									<span className="flex flex-wrap items-baseline gap-x-2 text-sm">
										<span className="font-medium text-ink">Versie {h.version}</span>
										<span className="text-ink-3">
											{h.by} · {formatDateTime(h.at)}
										</span>
									</span>
									<span className="text-ink-2 text-sm">
										{h.changes.length === 0
											? "De standaard, bij het aanmaken van de werkruimte."
											: h.changes.map((c) => `${ENTRY[c.id]?.label ?? c.id}: ${LEVEL_LABEL[c.from].toLowerCase()} → ${LEVEL_LABEL[c.to].toLowerCase()}`).join(" · ")}
									</span>
								</li>
							))}
						</ul>
					</SettingCard>
				</div>

				<aside className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start lg:pt-11">
					<section className="flex flex-col gap-2.5 px-1">
						<h2 className="font-medium text-base text-ink">Anders dan de standaard</h2>
						{changes.length === 0 ? (
							<p className="text-ink-3 text-sm">Alles op Eerst vragen.</p>
						) : (
							<ul className="flex flex-col gap-1.5">
								{changes.map((c) => (
									<li key={c.id} className="flex items-start gap-2 text-sm">
										{c.more ? <ArrowUp className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={2} /> : <ArrowDown className="mt-0.5 size-3.5 shrink-0 text-signal-amber" strokeWidth={2} />}
										<span className="min-w-0 text-ink-2">
											<span className="font-medium text-ink">{c.label}</span> {LEVEL_LABEL[c.from].toLowerCase()} → {LEVEL_LABEL[c.to].toLowerCase()}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>
					<Link to="/ask/activity" className="px-1 font-medium text-arc-ink text-sm hover:underline">
						Wat Insyte deed
					</Link>
				</aside>
			</div>

			<UnsavedBar visible={dirty && !readOnly} onDiscard={() => setDraft(policy)} onSave={save} />
			<PageGuide id="settings.ai.autonomy" title="Zelfstandigheid" steps={GUIDE} />
		</>
	);
}
