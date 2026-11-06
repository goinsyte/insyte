import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Plus, X } from "../../icons";
import { useEffect, useMemo, useState } from "react";
import { Field, SelectField, TextField } from "../common/form-dialog";
import { HolderDiscs, holdersLine, LevelMark, useHolders } from "./bits";
import { GHOST_BTN, PRIMARY_BTN, Segmented } from "../team/bits";
import { AREAS, euro, type RoleDef, SPECIALS, storeScopeLabel } from "../lib/permissions";
import { cn } from "../lib/utils";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";

const BLANK = "__leeg";

/** A new custom role: a name, and the role it starts as (or nothing). It opens in the editor. */
export function NewRoleDialog({
	open,
	onOpenChange,
	initialFrom,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	initialFrom?: string;
	onCreate: (label: string, from: string | null) => void;
}) {
	const roles = useSettings((s) => s.roles);
	const [name, setName] = useState("");
	const [from, setFrom] = useState(initialFrom ?? "service");
	useEffect(() => {
		if (!open) return;
		setName("");
		setFrom(initialFrom ?? "service");
	}, [open, initialFrom]);
	const label = name.trim();
	const taken = roles.some((r) => r.label.toLowerCase() === label.toLowerCase());
	const options = [BLANK, ...roles.filter((r) => r.id !== "owner").map((r) => r.id)];

	function submit() {
		if (!label || taken) return;
		onCreate(label, from === BLANK ? null : from);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent style={{ maxWidth: 480 }}>
				<DialogHeader>
					<DialogTitle>Nieuwe rol</DialogTitle>
					<DialogDescription>Begin vanuit de rol die er het dichtst bij zit en pas daarna aan wat anders moet. Je ziet steeds wat er verschilt.</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<Field label="Naam">
						<TextField value={name} onChange={setName} placeholder="Retourbalie" />
					</Field>
					{taken ? <p className="-mt-2 text-signal-red text-sm">Er is al een rol met deze naam.</p> : null}
					<Field label="Begin vanuit">
						<SelectField value={from} onChange={setFrom} options={options} renderLabel={(id) => (id === BLANK ? "Niets, alles op geen" : (roles.find((r) => r.id === id)?.label ?? id))} />
					</Field>
					<DialogFooter>
						<button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
							Annuleren
						</button>
						<button type="submit" disabled={!label || taken} className={PRIMARY_BTN}>
							Rol maken
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Deleting a role that people hold: they go somewhere first. The dialog names them, asks where to,
 * and the delete itself has Undo, which puts the role and everyone back.
 */
export function DeleteRoleDialog({ role, onClose, onConfirm }: { role: RoleDef | null; onClose: () => void; onConfirm: (role: RoleDef, toId: string) => void }) {
	return (
		<Dialog open={role !== null} onOpenChange={(v) => !v && onClose()}>
			<DialogContent style={{ maxWidth: 480 }}>{role ? <DeleteBody role={role} onClose={onClose} onConfirm={onConfirm} /> : null}</DialogContent>
		</Dialog>
	);
}

function DeleteBody({ role, onClose, onConfirm }: { role: RoleDef; onClose: () => void; onConfirm: (role: RoleDef, toId: string) => void }) {
	const roles = useSettings((s) => s.roles);
	const holders = useHolders(role);
	const targets = roles.filter((r) => r.id !== "owner" && r.id !== role.id);
	const [to, setTo] = useState(role.basedOn && targets.some((t) => t.id === role.basedOn) ? role.basedOn : "view");
	const target = targets.find((t) => t.id === to);
	return (
		<>
			<DialogHeader>
				<DialogTitle>{role.label} verwijderen</DialogTitle>
				<DialogDescription>Eerst krijgt iedereen met deze rol een andere. Daarna verdwijnt hij, met een kans om het ongedaan te maken.</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-3 rounded-lg bg-mist px-3.5 py-3">
				<div className="flex items-center gap-2">
					<HolderDiscs members={holders.members} max={6} />
					<span className="min-w-0 text-ink-2 text-sm">
						{holdersLine(holders)}
						{holders.members.length > 0 && holders.members.length <= 4 ? `: ${holders.members.map((m) => m.name).join(", ")}` : ""}
					</span>
				</div>
				<Field label="Zet ze op">
					<SelectField value={to} onChange={setTo} options={targets.map((t) => t.id)} renderLabel={(id) => targets.find((t) => t.id === id)?.label ?? id} />
				</Field>
			</div>
			<DialogFooter>
				<button type="button" onClick={onClose} className={GHOST_BTN}>
					Annuleren
				</button>
				<button type="button" disabled={!target} onClick={() => onConfirm(role, to)} className={cn(PRIMARY_BTN, "bg-signal-red hover:bg-signal-red/90")}>
					Overzetten en verwijderen
				</button>
			</DialogFooter>
		</>
	);
}

/* ── Vergelijk rollen ─────────────────────────────────────────────────────────────────────────── */

type Row = { key: string; label: string; cells: Array<{ text: string; level?: 0 | 1 | 2 | 3 }> };

/**
 * Two to four roles side by side, row for row. A row where they disagree carries a medium label and
 * its cells in full ink; "Alleen verschillen" hides the rest, which is usually the question.
 */
export function CompareDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial: string[] }) {
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const [ids, setIds] = useState<string[]>(initial);
	const [only, setOnly] = useState<"all" | "diff">("all");
	useEffect(() => {
		if (!open) return;
		const start = initial.filter((id) => roles.some((r) => r.id === id));
		const fill = roles.map((r) => r.id).filter((id) => !start.includes(id) && id !== "owner");
		setIds(start.length >= 2 ? start : [...start, ...fill].slice(0, 2));
		setOnly("all");
	}, [open, initial, roles]);

	const picked = ids.map((id) => roles.find((r) => r.id === id)).filter((r): r is RoleDef => r !== undefined);

	const rows = useMemo<Row[]>(() => {
		const out: Row[] = AREAS.map((a) => ({
			key: a.id,
			label: a.label,
			cells: picked.map((r) => {
				const l = r.id === "owner" ? 3 : r.levels[a.id];
				return { text: ["Geen", "Bekijken", "Bewerken", "Beheren"][l]!, level: l };
			}),
		}));
		for (const s of SPECIALS) {
			out.push({
				key: s.id,
				label: s.label,
				cells: picked.map((r) => {
					const on = r.id === "owner" || (r.specials[s.id] && r.levels[s.needs.area] >= s.needs.level);
					if (s.id === "refunds.write" && on) return { text: r.id === "owner" || r.refundLimit === null ? "Zonder limiet" : `Tot ${euro(r.refundLimit)}` };
					return { text: on ? "Ja" : "Nee" };
				}),
			});
		}
		out.push({ key: "stores", label: "Winkels", cells: picked.map((r) => ({ text: r.id === "owner" ? "Alle winkels" : storeScopeLabel(r.stores, stores).replace(/^./, (c) => c.toUpperCase()) })) });
		return out;
	}, [picked, stores]);

	const differs = (row: Row) => new Set(row.cells.map((c) => c.text)).size > 1;
	const shown = only === "diff" ? rows.filter(differs) : rows;
	const cols = `minmax(150px,1fr) repeat(${picked.length}, minmax(120px,1fr))`;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88vh] overflow-y-auto" style={{ maxWidth: 960 }}>
				<DialogHeader>
					<DialogTitle>Vergelijk rollen</DialogTitle>
					<DialogDescription>{`${rows.filter(differs).length} van de ${rows.length} rijen verschillen.`}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-wrap items-center gap-2">
					<Segmented
						label="Rijen"
						value={only}
						onChange={setOnly}
						options={[
							{ id: "all", label: "Alles" },
							{ id: "diff", label: "Alleen verschillen" },
						]}
					/>
					<span className="flex-1" />
					{picked.length < 4 ? (
						<button
							type="button"
							onClick={() => {
								const next = roles.find((r) => !ids.includes(r.id));
								if (next) setIds([...ids, next.id]);
							}}
							className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
						>
							<Plus className="size-3.5" strokeWidth={2} />
							Rol toevoegen
						</button>
					) : null}
				</div>
				<div className="table-scroll overflow-x-auto rounded-xl bg-paper">
					<div className="min-w-max">
						<div className="grid items-center gap-2 bg-mist px-3 py-2" style={{ gridTemplateColumns: cols }}>
							<span className="font-medium text-ink-3 text-xs">Recht</span>
							{picked.map((r, i) => (
								<div key={`${r.id}-${i}`} className="flex min-w-0 items-center gap-1">
									<select
										value={r.id}
										aria-label={`Rol ${i + 1}`}
										onChange={(e) => setIds(ids.map((x, j) => (j === i ? e.target.value : x)))}
										className="field h-8 min-w-0 flex-1 rounded-md bg-paper px-2 font-medium text-ink text-sm outline-none"
									>
										{roles.map((o) => (
											<option key={o.id} value={o.id}>
												{o.label}
											</option>
										))}
									</select>
									{picked.length > 2 ? (
										<button type="button" aria-label={`${r.label} weghalen`} onClick={() => setIds(ids.filter((_, j) => j !== i))} className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
											<X className="size-3.5" strokeWidth={1.75} />
										</button>
									) : null}
								</div>
							))}
						</div>
						{shown.length === 0 ? <p className="px-3 py-6 text-center text-ink-3 text-sm">Deze rollen mogen precies hetzelfde.</p> : null}
						<ul className="[&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
							{shown.map((row) => {
								const d = differs(row);
								return (
									<li key={row.key} className="grid min-h-9 items-center gap-2 px-3 py-1.5" style={{ gridTemplateColumns: cols }}>
										<span className={cn("flex items-center gap-1.5 text-sm", d ? "font-medium text-ink" : "text-ink-2")}>
											{d ? <span className="size-1.5 shrink-0 rounded-[1px] bg-arc" aria-label="Verschilt" /> : null}
											{row.label}
										</span>
										{row.cells.map((c, i) => (
											<span key={i} className={cn("flex items-center gap-2 text-sm", d ? "text-ink" : "text-ink-3")}>
												{c.level !== undefined ? <LevelMark level={c.level} /> : null}
												{c.text}
											</span>
										))}
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
