import { Users, Wallet } from "../../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReadOnlyNotice } from "../access/read-only-notice";
import { PageGuide } from "../common/page-guide";
import { Notice } from "../developer/bits";
import { FieldRow, UnsavedBar } from "../settings/form";
import { BandedList, SettingCard } from "../settings/setting-card";
import { PersonDisc } from "../team/bits";
import { budgetState, type LimitInput, limitOf } from "../lib/autonomy";
import { cn } from "../lib/utils";
import { BudgetBar, euroCents } from "./budget-bar";
import { type LimitsDraft as Draft, type LimitsPerson, useLimitsSource } from "./limits-source";

const GUIDE = [
	{ title: "Een budget per maand", body: "Wat Insyte deze maand mag kosten, voor iedereen samen en het werk op de achtergrond. Leeg is geen limiet.", art: "budget" },
	{ title: "Per persoon", body: "Wat iemand met Vraag Insyte gebruikt. Bij 80% krijgen die persoon en de eigenaar een melding.", art: "people" },
	{ title: "Bij 100%", body: "Wat Insyte zelf zou doen, komt als voorstel bij jou en de klantagent draagt nieuwe gesprekken over. Vraag Insyte en concepten stoppen tot de maand omslaat of je de limiet verhoogt.", art: "handover" },
] as const;

const MONTH = () => new Intl.DateTimeFormat("nl-NL", { month: "long" }).format(new Date());

/**
 * Instellingen → Insyte AI → Limieten (PLAN 29, ADR-0027): the month's AI budget for the workspace
 * and, optionally, per person, each with what is spent so far. At 80% the owner and the person hear
 * about it; what happens at 100% is stated, not set, in phase 1. The figures and the save are the
 * host's (`LimitsSource`).
 */
export function LimitsPage() {
	const { budget, people, background, gate, save: send } = useLimitsSource();
	const readOnly = !gate.ok;
	const saved: Draft = useMemo(() => ({ limit: budget.limit, people: Object.fromEntries(people.map((p) => [p.memberId, p.limit])) }), [budget.limit, people]);
	const savedKey = JSON.stringify(saved);
	// What is typed, per field (the workspace's under WORKSPACE, a person's under their id): a field keeps its text
	// until it reads as whole euros, so "12,50" is said at the field instead of saved as 1250.
	const [texts, setTexts] = useState<Record<string, string>>(() => textsOf(saved));
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setTexts(textsOf(JSON.parse(savedKey) as Draft));
		}
	}, [savedKey]);
	const read = (key: string, was: number | null) => limitOf(texts[key] ?? textOf(was));
	const limitIn = (key: string, was: number | null) => {
		const r = read(key, was);
		return r.ok ? r.limit : was;
	};
	const draft: Draft = { limit: limitIn(WORKSPACE, saved.limit), people: Object.fromEntries(people.map((p) => [p.memberId, limitIn(p.memberId, saved.people[p.memberId] ?? null)])) };
	const bad = Object.values(texts).some((text) => !limitOf(text).ok);
	const dirty = bad || JSON.stringify(draft) !== savedKey;
	const state = budgetState(budget.used, draft.limit);
	const month = MONTH();
	const type = (key: string) => (text: string) => setTexts((t) => ({ ...t, [key]: text }));

	function save() {
		// A field that does not read says so under itself; nothing goes until it does.
		if (bad) return;
		return send(draft);
	}

	return (
		<>
			{readOnly ? <ReadOnlyNotice reason={gate.reason} /> : null}
			{state === "spent" ? (
				<Notice tone="red">
					<span className="font-medium">Limiet bereikt.</span> Alles wat Insyte zelf zou doen, komt nu als voorstel. De klantagent draagt elk nieuw gesprek over aan het team.
				</Notice>
			) : state === "warn" ? (
				<Notice tone="amber">
					<span className="font-medium">{Math.round((budget.used / (draft.limit ?? 1)) * 100)}% van het budget voor {month} is op.</span> Bij 100% stopt Insyte met zelf handelen tot de maand omslaat of je de limiet verhoogt.
				</Notice>
			) : null}

			<SettingCard title={`Werkruimte · ${month}`} icon={Wallet} subtitle="Bij 80% krijgen de eigenaar en wie de limieten mag instellen een melding. Is het budget op, dan komt wat Insyte zelf zou doen als voorstel, geeft de klantagent nieuwe gesprekken aan je team en antwoordt Vraag Insyte niet, tot de maand omslaat of je de limiet verhoogt.">
				<div className="flex flex-col gap-1">
					<FieldRow label="Maandbudget" hint="Voor alles wat Insyte AI doet, van iedereen samen en op de achtergrond. In hele euro's, ook als je winkel in een andere valuta verkoopt. Leeg is geen limiet.">
						<EuroField text={texts[WORKSPACE] ?? ""} error={errorOf(read(WORKSPACE, saved.limit))} disabled={readOnly} onChange={type(WORKSPACE)} label="Maandbudget in euro" />
					</FieldRow>
					<div className="grid grid-cols-1 items-center gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
						<span className="font-medium text-ink text-sm">Deze maand</span>
						<BudgetBar used={budget.used} limit={draft.limit} wide />
					</div>
					<div className="grid grid-cols-1 items-center gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
						<span className="flex flex-col gap-0.5">
							<span className="font-medium text-ink text-sm">Op de achtergrond</span>
							<span className="text-ink-2 text-sm">Werk zonder iemand van je team: de klantagent, ticketonderwerpen, bewijspakketten en de kennisbank doorzoekbaar maken.</span>
						</span>
						<span className="text-ink-2 text-sm tabular-nums">{euroCents(background)}</span>
					</div>
				</div>
			</SettingCard>

			<SettingCard title="Per persoon" icon={Users} subtitle="Wat iemand zelf met Insyte AI doet, zoals Vraag Insyte en concepten. Bij 80% krijgen die persoon en de eigenaar een melding. Is het op, dan doet Insyte AI niets meer voor die persoon tot de maand omslaat of je de limiet verhoogt. Leeg is geen limiet.">
				<BandedList>
					{people.map((p) => {
						const limit = draft.people[p.memberId] ?? null;
						const st = budgetState(p.used, limit);
						const was = saved.people[p.memberId] ?? null;
						return <PersonRow key={p.memberId} p={p} name={p.name} role={p.role} limit={limit} text={texts[p.memberId] ?? textOf(was)} error={errorOf(read(p.memberId, was))} state={st} readOnly={readOnly} onChange={type(p.memberId)} />;
					})}
				</BandedList>
			</SettingCard>

			<UnsavedBar visible={dirty && !readOnly} onDiscard={() => setTexts(textsOf(saved))} onSave={save} />
			<PageGuide id="settings.ai.limits" title="Limieten" steps={GUIDE} />
		</>
	);
}

function PersonRow({ p, name, role, limit, text, error, state, readOnly, onChange }: { p: LimitsPerson; name: string; role: string; limit: number | null; text: string; error: string | undefined; state: ReturnType<typeof budgetState>; readOnly: boolean; onChange: (text: string) => void }) {
	return (
		<li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)_120px]">
			<span className="flex min-w-0 items-center gap-3">
				<PersonDisc seed={p.memberId} name={name} size={28} />
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-base text-ink">{name}</span>
					<span className={cn("truncate text-sm", state === "spent" ? "text-signal-red" : state === "warn" ? "text-signal-amber" : "text-ink-3")}>
						{state === "spent" ? "Limiet bereikt" : state === "warn" ? `${Math.round((p.used / (limit ?? 1)) * 100)}% gebruikt` : role}
					</span>
				</span>
			</span>
			<BudgetBar used={p.used} limit={limit} />
			<EuroField text={text} error={error} disabled={readOnly} onChange={onChange} label={`Limiet voor ${name}`} small />
		</li>
	);
}

const WORKSPACE = "workspace";

const textOf = (limit: number | null) => (limit === null ? "" : String(limit));

const textsOf = (d: Draft): Record<string, string> => ({ [WORKSPACE]: textOf(d.limit), ...Object.fromEntries(Object.entries(d.people).map(([id, limit]) => [id, textOf(limit)])) });

const errorOf = (r: LimitInput) => (r.ok ? undefined : r.message);

/**
 * A limit in whole euros in a white well; empty means no limit. Insyte reckons AI use in euros whatever the stores
 * sell in, so the sign is the euro's. What does not read as whole euros is said under the field.
 */
function EuroField({ text, error, onChange, disabled, label, small = false }: { text: string; error: string | undefined; onChange: (text: string) => void; disabled?: boolean; label: string; small?: boolean }) {
	return (
		<span className={cn("flex flex-col gap-1", small ? "w-full sm:w-[120px]" : "w-40")}>
			<label className={cn("field flex w-full items-center gap-1 rounded-md px-3 focus-within:bg-paper", small ? "h-8 text-sm" : "h-9 text-base", error !== undefined && "bg-signal-red-bg", disabled && "opacity-60")}>
				<span className="text-ink-3">€</span>
				<input
					inputMode="decimal"
					aria-label={label}
					aria-invalid={error !== undefined || undefined}
					disabled={disabled}
					value={text}
					placeholder="Geen limiet"
					onChange={(e) => onChange(e.target.value)}
					className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3"
				/>
			</label>
			{error !== undefined ? <span className="text-signal-red text-xs">{error}</span> : null}
		</span>
	);
}
