import { Users, Wallet } from "../../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReadOnlyNotice } from "../access/read-only-notice";
import { PageGuide } from "../common/page-guide";
import { Notice } from "../developer/bits";
import { FieldRow, UnsavedBar } from "../settings/form";
import { BandedList, SettingCard } from "../settings/setting-card";
import { PersonDisc } from "../team/bits";
import { budgetState } from "../lib/autonomy";
import { cn } from "../lib/utils";
import { BudgetBar, euroCents } from "./budget-bar";
import { type LimitsDraft as Draft, type LimitsPerson, useLimitsSource } from "./limits-source";

const GUIDE = [
	{ title: "Een budget per maand", body: "Wat Insyte deze maand mag kosten, voor iedereen samen en het werk op de achtergrond. Leeg is geen limiet.", art: "budget" },
	{ title: "Per persoon", body: "Wat iemand met Vraag Insyte gebruikt. Bij 80% krijgen die persoon en de eigenaar een melding.", art: "people" },
	{ title: "Bij 100%", body: "Wat Insyte zelf zou doen, komt als voorstel bij jou en de klantagent draagt nieuwe gesprekken over. Vragen blijven werken, via een snellere route.", art: "handover" },
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
	const [draft, setDraft] = useState<Draft>(saved);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as Draft);
		}
	}, [savedKey]);
	const dirty = JSON.stringify(draft) !== savedKey;
	const state = budgetState(budget.used, draft.limit);
	const month = MONTH();

	function save() {
		void send(draft);
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
					<span className="font-medium">{Math.round((budget.used / (draft.limit ?? 1)) * 100)}% van het budget voor {month} is op.</span> Bij 100% stopt Insyte met zelf handelen tot de maand omslaat.
				</Notice>
			) : null}

			<SettingCard title={`Werkruimte · ${month}`} icon={Wallet}>
				<div className="flex flex-col gap-1">
					<FieldRow label="Maandbudget" hint="Leeg is geen limiet">
						<EuroField value={draft.limit} disabled={readOnly} onChange={(limit) => setDraft((d) => ({ ...d, limit }))} label="Maandbudget in euro" />
					</FieldRow>
					<div className="grid grid-cols-1 items-center gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
						<span className="font-medium text-ink text-sm">Deze maand</span>
						<BudgetBar used={budget.used} limit={draft.limit} wide />
					</div>
					<div className="grid grid-cols-1 items-center gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[200px_minmax(0,380px)]">
						<span className="font-medium text-ink text-sm">Op de achtergrond</span>
						<span className="text-ink-2 text-sm tabular-nums">{euroCents(background)}</span>
					</div>
				</div>
			</SettingCard>

			<SettingCard title="Per persoon" icon={Users}>
				<BandedList>
					{people.map((p) => {
						const limit = draft.people[p.memberId] ?? null;
						const st = budgetState(p.used, limit);
						return <PersonRow key={p.memberId} p={p} name={p.name} role={p.role} limit={limit} state={st} readOnly={readOnly} onChange={(v) => setDraft((d) => ({ ...d, people: { ...d.people, [p.memberId]: v } }))} />;
					})}
				</BandedList>
			</SettingCard>

			<UnsavedBar visible={dirty && !readOnly} onDiscard={() => setDraft(saved)} onSave={save} />
			<PageGuide id="settings.ai.limits" title="Limieten" steps={GUIDE} />
		</>
	);
}

function PersonRow({ p, name, role, limit, state, readOnly, onChange }: { p: LimitsPerson; name: string; role: string; limit: number | null; state: ReturnType<typeof budgetState>; readOnly: boolean; onChange: (v: number | null) => void }) {
	return (
		<li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)_120px]">
			<span className="flex min-w-0 items-center gap-3">
				<PersonDisc seed={p.memberId} name={name} size={28} />
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-base text-ink">{name}</span>
					<span className={cn("truncate text-sm", state === "spent" ? "text-signal-red" : state === "warn" ? "text-signal-amber" : "text-ink-3")}>
						{state === "spent" ? "Limiet bereikt · gebruikt de snelle route" : state === "warn" ? `${Math.round((p.used / (limit ?? 1)) * 100)}% gebruikt` : role}
					</span>
				</span>
			</span>
			<BudgetBar used={p.used} limit={limit} />
			<EuroField value={limit} disabled={readOnly} onChange={onChange} label={`Limiet voor ${name}`} small />
		</li>
	);
}

/** A euro amount in a white well; empty means no limit. */
function EuroField({ value, onChange, disabled, label, small = false }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string; small?: boolean }) {
	return (
		<label className={cn("field flex items-center gap-1 rounded-md px-3 focus-within:bg-paper", small ? "h-8 w-full text-sm sm:w-[120px]" : "h-9 w-40 text-base", disabled && "opacity-60")}>
			<span className="text-ink-3">€</span>
			<input
				inputMode="numeric"
				aria-label={label}
				disabled={disabled}
				value={value === null ? "" : String(value)}
				placeholder="Geen limiet"
				onChange={(e) => {
					const digits = e.target.value.replace(/[^0-9]/g, "");
					onChange(digits === "" ? null : Number(digits));
				}}
				className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3"
			/>
		</label>
	);
}

