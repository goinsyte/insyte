import { Switch } from "../../components/switch";
import { ArrowDown, ArrowUp, ChevronLeft, Copy, Edit3, Grid2x2, Lock, RotateCcw, Shield, Trash2 } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Blocked } from "../access/gate";
import { UnsavedBar } from "../settings/form";
import { SettingCard, StatusPill } from "../settings/setting-card";
import { HolderDiscs, holdersLine, useHolders } from "./bits";
import { LevelMatrix } from "./level-matrix";
import { GHOST_BTN, WELL_BTN } from "../team/bits";
import { StoreAccessPicker } from "../team/store-access-picker";
import {
	AREA_BY_ID,
	type AreaId,
	clampLevel,
	describe,
	diff,
	euro,
	type Level,
	levelLabel,
	type Permissions,
	type RoleDef,
	SPECIALS,
	SYSTEM_DEFAULTS,
} from "../lib/permissions";
import { createRole, renameRole } from "../lib/role-actions";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";

const pick = (r: RoleDef): Permissions => ({ levels: r.levels, specials: r.specials, refundLimit: r.refundLimit, stores: r.stores });

/**
 * One role, opened: the matrix on the left, and on the right what it adds up to in plain Dutch and
 * how it differs from the role it came from. Changes are a draft until the bar at the foot keeps
 * them, and keeping them has Undo; the owner is shown but cannot be changed.
 */
export function RoleEditor({ role, onDelete, onCompare }: { role: RoleDef; onDelete: (r: RoleDef) => void; onCompare: (ids: string[]) => void }) {
	const navigate = useNavigate();
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const holders = useHolders(role);
	const manage = useGate("team", 3);
	const owner = role.id === "owner";
	const readOnly = owner || !manage.ok;
	const [draft, setDraft] = useState<Permissions>(() => pick(role));
	// A save elsewhere (Undo, a granted request) moves the saved role; the draft follows when untouched.
	const saved = pick(role);
	const savedKey = JSON.stringify(saved);
	const lastSaved = useRef(savedKey);
	const dirty = JSON.stringify(draft) !== savedKey;
	useEffect(() => {
		if (lastSaved.current !== savedKey) {
			lastSaved.current = savedKey;
			setDraft(JSON.parse(savedKey) as Permissions);
		}
	}, [savedKey]);

	const baseRole = role.system ? SYSTEM_DEFAULTS[role.id] : role.basedOn ? roles.find((r) => r.id === role.basedOn) : undefined;
	const changes = useMemo(() => (baseRole ? diff(pick(baseRole), draft, stores) : []), [baseRole, draft, stores]);
	const sentences = useMemo(() => describe({ ...draft, id: role.id }, stores), [draft, role.id, stores]);
	const altered = role.system && !owner && baseRole !== undefined && diff(pick(baseRole), saved, stores).length > 0;

	function setLevel(area: AreaId, level: Level) {
		setDraft((d) => ({ ...d, levels: { ...d.levels, [area]: level } }));
	}

	function save() {
		const before = pick(role);
		useSettings.getState().updateRole(role.id, draft);
		undoable(`${role.label} opgeslagen`, () => useSettings.getState().updateRole(role.id, before), holders.members.length ? `Geldt meteen voor ${holdersLine(holders)}.` : undefined);
	}

	function duplicate() {
		const copy = createRole(`Kopie van ${role.label}`, role.id);
		useSettings.getState().updateRole(copy.id, draft);
		void navigate({ to: "/settings/roles", search: { role: copy.id, nieuw: "1" } });
		undoable(`${copy.label} gemaakt`, () => {
			useSettings.getState().removeRole(copy.id);
			void navigate({ to: "/settings/roles", search: {} });
		});
	}

	function reset() {
		const before = pick(role);
		useSettings.getState().resetRole(role.id);
		undoable(`${role.label} staat weer op de standaard`, () => useSettings.getState().updateRole(role.id, before));
	}

	return (
		<>
			<div className="flex flex-col gap-4">
				<button
					type="button"
					onClick={() => void navigate({ to: "/settings/roles", search: {} })}
					className="-ml-1.5 flex h-7 items-center gap-1 self-start rounded-md px-1.5 text-ink-3 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
				>
					<ChevronLeft className="size-3.5" strokeWidth={1.75} />
					Alle rollen
				</button>
				<RoleTitle role={role} readOnly={readOnly} holders={holdersLine(holders)} />
				<div className="flex flex-wrap items-center gap-1.5">
					{holders.members.length ? <HolderDiscs members={holders.members} max={5} /> : null}
					<span className="text-ink-2 text-sm">{holdersLine(holders)}</span>
					<span className="flex-1" />
					<button type="button" onClick={() => onCompare(baseRole && !owner ? [role.id, baseRole.id] : [role.id])} className={WELL_BTN}>
						Vergelijken
					</button>
					{manage.ok ? (
						<>
							{owner ? null : (
								<button type="button" onClick={duplicate} className={WELL_BTN}>
									<Copy className="size-3.5" strokeWidth={1.75} />
									Dupliceren
								</button>
							)}
							{altered ? (
								<button type="button" onClick={reset} className={WELL_BTN}>
									<RotateCcw className="size-3.5" strokeWidth={1.75} />
									Standaard herstellen
								</button>
							) : null}
							{role.custom ? (
								<button type="button" onClick={() => onDelete(role)} className={cn(WELL_BTN, "text-signal-red hover:text-signal-red")}>
									<Trash2 className="size-3.5" strokeWidth={1.75} />
									Verwijderen
								</button>
							) : null}
						</>
					) : (
						<Blocked reason={manage.reason}>
							<button type="button" className={WELL_BTN}>
								<Copy className="size-3.5" strokeWidth={1.75} />
								Dupliceren
							</button>
						</Blocked>
					)}
				</div>
				{owner ? (
					<Notice icon={Lock}>
						De eigenaar kan altijd alles en is niet te wijzigen.
					</Notice>
				) : !manage.ok ? (
					<Notice icon={Lock}>Alleen lezen. {manage.reason}, dus je ziet deze rol zoals hij is.</Notice>
				) : null}
			</div>

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
				<div className="flex min-w-0 flex-col gap-8">
					<SettingCard title="Per onderdeel" icon={Grid2x2}>
						<LevelMatrix
							levels={draft.levels}
							onChange={setLevel}
							onAll={(level) => setDraft((d) => ({ ...d, levels: Object.fromEntries(Object.keys(d.levels).map((a) => [a, clampLevel(a as AreaId, level)])) as Record<AreaId, Level> }))}
							readOnly={readOnly}
							base={baseRole && !owner ? baseRole.levels : undefined}
						/>
					</SettingCard>

					<SettingCard title="Bijzondere acties" icon={Shield}>
						<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
							{SPECIALS.map((s) => {
								const area = AREA_BY_ID[s.needs.area];
								const possible = draft.levels[s.needs.area] >= s.needs.level;
								const on = draft.specials[s.id] && possible;
								return (
									<li key={s.id} className="flex flex-col gap-2 px-3.5 py-3">
										<div className="flex items-start gap-3">
											<div className="flex min-w-0 flex-1 flex-col gap-0.5">
												<span className="font-medium text-base text-ink">{s.label}</span>
												<span className="text-ink-3 text-sm">
													{possible ? s.detail : `Vraagt ${area.label} · ${levelLabel(s.needs.level)} of hoger.`}
												</span>
											</div>
											<Switch
												checked={owner ? true : on}
												disabled={readOnly || !possible}
												onCheckedChange={(v) => setDraft((d) => ({ ...d, specials: { ...d.specials, [s.id]: v } }))}
												aria-label={s.label}
												className="mt-1"
											/>
										</div>
										{s.id === "refunds.write" && on && !owner ? (
											<RefundLimit value={draft.refundLimit} readOnly={readOnly} onChange={(refundLimit) => setDraft((d) => ({ ...d, refundLimit }))} />
										) : null}
									</li>
								);
							})}
						</ul>
					</SettingCard>

					<SettingCard title="Winkels">
						{owner ? (
							<p className="text-base text-ink">Alle winkels, ook die later gekoppeld worden.</p>
						) : (
							<fieldset disabled={readOnly} className="disabled:opacity-60">
								<StoreAccessPicker value={draft.stores} onChange={(stores) => setDraft((d) => ({ ...d, stores }))} />
							</fieldset>
						)}
					</SettingCard>
				</div>

				<aside className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
					<section className="flex flex-col gap-2.5 rounded-xl bg-paper px-4 py-4">
						<h2 className="font-medium text-base text-ink">Wat deze rol kan</h2>
						<ul className="flex flex-col gap-2">
							{sentences.map((s) => (
								<li key={s} className="text-ink-2 text-sm leading-normal">
									{s}
								</li>
							))}
						</ul>
					</section>
					{baseRole && !owner ? (
						<section className="flex flex-col gap-2.5 px-1">
							<h2 className="font-medium text-base text-ink">{role.system ? "Anders dan de standaard" : `Anders dan ${baseRole.label}`}</h2>
							{changes.length === 0 ? (
								<p className="text-ink-3 text-sm">{role.system ? "Staat zoals hij uit de doos komt." : `Nog gelijk aan ${baseRole.label}.`}</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{changes.map((c) => (
										<li key={c.key} className="flex items-start gap-2 text-sm">
											{c.up ? <ArrowUp className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={2} /> : <ArrowDown className="mt-0.5 size-3.5 shrink-0 text-signal-amber" strokeWidth={2} />}
											<span className="min-w-0 text-ink-2">
												<span className="font-medium text-ink">{c.label}</span> {c.from.toLowerCase()} → {c.to.toLowerCase()}
											</span>
										</li>
									))}
								</ul>
							)}
						</section>
					) : null}
				</aside>
			</div>

			<UnsavedBar visible={dirty && !readOnly} onDiscard={() => setDraft(saved)} onSave={save} />
		</>
	);
}

function Notice({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
	return (
		<p className="flex items-start gap-2 rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm leading-normal">
			<Icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			<span>{children}</span>
		</p>
	);
}

/** The role's name: the title, and for a custom role a pencil that turns it into a field in place. */
function RoleTitle({ role, readOnly, holders }: { role: RoleDef; readOnly: boolean; holders: string }) {
	const roles = useSettings((s) => s.roles);
	const fresh = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("nieuw") === "1";
	const [editing, setEditing] = useState(fresh && role.custom === true && !readOnly);
	const [name, setName] = useState(role.label);
	useEffect(() => setName(role.label), [role.label]);
	const label = name.trim();
	const taken = roles.some((r) => r.id !== role.id && r.label.toLowerCase() === label.toLowerCase());

	function commit() {
		setEditing(false);
		if (!label || taken || label === role.label) {
			setName(role.label);
			if (taken) toast.error(`Er is al een rol die ${label} heet`);
			return;
		}
		const before = role.label;
		const undo = renameRole(role.id, label);
		if (undo) undoable(`${before} heet nu ${label}`, undo, holders);
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{editing ? (
				<input
					// biome-ignore lint/a11y/noAutofocus: the field replaces the title the operator just clicked
					autoFocus
					value={name}
					aria-label="Naam rol"
					aria-invalid={taken || undefined}
					onChange={(e) => setName(e.target.value)}
					onFocus={(e) => e.currentTarget.select()}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							setName(role.label);
							setEditing(false);
						}
					}}
					className="field h-9 w-full max-w-[360px] rounded-md px-2.5 font-medium text-lg text-ink outline-none focus:bg-paper"
				/>
			) : (
				<h2 className="font-medium text-lg text-ink">{role.label}</h2>
			)}
			{role.id === "owner" ? <StatusPill tone="neutral" label="Vergrendeld" /> : role.system ? <StatusPill tone="neutral" label="Systeemrol" /> : <StatusPill tone="info" label="Eigen rol" />}
			{role.custom && !readOnly && !editing ? (
				<button type="button" onClick={() => setEditing(true)} className={cn(GHOST_BTN, "h-7 px-2 text-sm")}>
					<Edit3 className="size-3.5" strokeWidth={1.75} />
					Hernoemen
				</button>
			) : null}
			{role.description ? <p className="w-full text-ink-2 text-sm">{role.description}</p> : null}
			{role.basedOn && role.custom ? (
				<p className="w-full text-ink-3 text-sm">Gemaakt vanuit {roles.find((r) => r.id === role.basedOn)?.label ?? "een rol die er niet meer is"}.</p>
			) : null}
		</div>
	);
}

const LIMITS = [50, 100, 250, 500, 1000];

/** The most one refund may be. A few common amounts, a field for any other, or no limit at all. */
function RefundLimit({ value, onChange, readOnly }: { value: number | null; onChange: (v: number | null) => void; readOnly: boolean }) {
	const [text, setText] = useState(value === null ? "" : String(value));
	useEffect(() => setText(value === null ? "" : String(value)), [value]);
	return (
		<div className="flex flex-wrap items-center gap-1.5 pl-0">
			<span className="mr-1 text-ink-2 text-sm">Per bestelling tot</span>
			{LIMITS.map((n) => (
				<button
					key={n}
					type="button"
					disabled={readOnly}
					aria-pressed={value === n}
					onClick={() => onChange(n)}
					className={cn("h-7 rounded-md px-2 font-medium text-sm tabular-nums transition-colors", value === n ? "bg-abyss text-mesh-ink" : "field text-ink-2 enabled:hover:field-hover enabled:hover:text-ink")}
				>
					{euro(n)}
				</button>
			))}
			<label className="field flex h-7 w-24 items-center gap-1 rounded-md px-2 text-sm focus-within:bg-paper">
				<span className="text-ink-3">€</span>
				<input
					inputMode="numeric"
					disabled={readOnly}
					value={LIMITS.includes(value ?? -1) ? "" : text}
					placeholder="Anders"
					aria-label="Ander bedrag"
					onChange={(e) => {
						const digits = e.target.value.replace(/[^0-9]/g, "");
						setText(digits);
						if (digits) onChange(Number(digits));
					}}
					className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3"
				/>
			</label>
			<button
				type="button"
				disabled={readOnly}
				aria-pressed={value === null}
				onClick={() => onChange(null)}
				className={cn("h-7 rounded-md px-2 font-medium text-sm transition-colors", value === null ? "bg-abyss text-mesh-ink" : "field text-ink-2 enabled:hover:field-hover enabled:hover:text-ink")}
			>
				Geen limiet
			</button>
		</div>
	);
}
