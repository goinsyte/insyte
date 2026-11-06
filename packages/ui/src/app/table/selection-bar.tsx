import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "../../components/command";
import { type IconComponent, X } from "../../icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { canRole, type Level, type Permission, permissionName } from "../lib/permissions";
import { cn } from "../lib/utils";
import { useCurrentRole } from "../stores/access-store";

/**
 * What a screen can do to the rows it lists.
 *
 * One declaration feeds three surfaces, so they cannot disagree: the floating bar that rises when
 * rows are picked (the `bar` actions), the ⌘K menu that lists every action for the selection, and
 * the single-key shortcut that runs one without opening anything. Linear and ClickUp work this way
 * and it is the right shape for a list someone lives in — the "Bulk action" dropdown it replaces sat
 * in the page header, had no idea what was selected, and toasted at nothing.
 */
export type RowAction<T> = {
	id: string;
	label: string;
	icon?: IconComponent;
	/** Heading the action sits under in the ⌘K menu. */
	group?: string;
	/** One key, pressed with rows selected and no field focused. */
	shortcut?: string;
	/** Also shown as a button on the bar. Keep it to two or three. */
	bar?: boolean;
	destructive?: boolean;
	/** Rows this action does not apply to are skipped; when none apply, the action is disabled. */
	applies?: (row: T) => boolean;
	/** The permission it takes. Without it the action stays listed, disabled, and says what is missing. */
	needs?: { perm: Permission; arg?: Level | number };
	run: (rows: Array<T>) => void;
};

export function SelectionBar<T>({
	rows,
	actions,
	noun,
	onClear,
}: {
	rows: Array<T>;
	actions: ReadonlyArray<RowAction<T>>;
	/** Singular and plural: ["order", "orders"]. */
	noun: readonly [string, string];
	onClear: () => void;
}) {
	const still = useReducedMotion();
	const [menu, setMenu] = useState(false);
	const count = rows.length;
	const what = `${count} ${count === 1 ? noun[0] : noun[1]}`;

	const role = useCurrentRole();
	const usable = useMemo(
		() =>
			actions.map((a) => {
				const blocked = a.needs && !canRole(role, a.needs.perm, a.needs.arg) ? `Je rol ${role.label} mist ${permissionName(a.needs.perm, a.needs.arg)}` : null;
				const targets = blocked ? [] : a.applies ? rows.filter(a.applies) : rows;
				return { action: a, targets, blocked };
			}),
		[actions, rows, role],
	);

	function run(a: RowAction<T>, targets: Array<T>) {
		if (targets.length === 0) return;
		setMenu(false);
		a.run(targets);
		onClear();
	}

	/*
	 * ⌘K belongs to the selection while there is one. The app-wide palette listens on `window` in
	 * the bubble phase; this listens in the capture phase and stops the event, so the same keys open
	 * the menu for what is picked rather than the one for the whole console.
	 */
	useEffect(() => {
		if (count === 0) return;
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setMenu((v) => !v);
				return;
			}
			if (menu || e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
			if (e.key === "Escape") {
				onClear();
				return;
			}
			const hit = usable.find((u) => u.action.shortcut?.toLowerCase() === e.key.toLowerCase());
			if (hit !== undefined) {
				e.preventDefault();
				run(hit.action, hit.targets);
			}
		}
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	const groups = useMemo(() => {
		const out = new Map<string, typeof usable>();
		for (const u of usable) {
			const g = u.action.group ?? "Acties";
			out.set(g, [...(out.get(g) ?? []), u]);
		}
		return [...out];
	}, [usable]);

	return (
		<>
			<AnimatePresence>
				{count > 0 ? (
					<motion.div
						key="bar"
						role="toolbar"
						aria-label={`${what} geselecteerd`}
						initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
						transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
						className="-translate-x-1/2 fixed bottom-5 left-1/2 z-40 flex h-11 items-center gap-1 rounded-xl bg-abyss pr-1.5 pl-1.5 text-mesh-ink shadow-primary"
					>
						<button
							type="button"
							onClick={onClear}
							aria-label="Selectie wissen"
							className="flex h-8 items-center gap-2 rounded-lg pr-2.5 pl-2 font-medium text-sm transition-colors hover:bg-white/10"
						>
							<X className="size-3.5 opacity-70" strokeWidth={2} />
							<span className="tabular-nums">{what}</span>
						</button>
						<span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
						{usable
							.filter((u) => u.action.bar)
							.map(({ action: a, targets, blocked }) => {
								const Icon = a.icon;
								return (
									<button
										key={a.id}
										type="button"
										title={blocked ?? undefined}
										disabled={targets.length === 0}
										onClick={() => run(a, targets)}
										className={cn(
											"flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-medium text-sm transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40",
											a.destructive && "text-signal-red-bg",
										)}
									>
										{Icon ? <Icon className="size-3.5 opacity-80" strokeWidth={1.75} /> : null}
										{a.label}
										{a.shortcut ? <BarKey>{a.shortcut.toUpperCase()}</BarKey> : null}
									</button>
								);
							})}
						<button
							type="button"
							onClick={() => setMenu(true)}
							className="ml-0.5 flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 font-medium text-sm transition-colors hover:bg-white/16"
						>
							Acties
							<BarKey>⌘K</BarKey>
						</button>
					</motion.div>
				) : null}
			</AnimatePresence>

			<CommandDialog
				open={menu}
				onOpenChange={setMenu}
				title={`Acties voor ${what}`}
				description={`Voer een actie uit op de ${what} die je hebt geselecteerd`}
			>
				<div className="flex items-center gap-2 px-5 pt-4">
					<span className="rounded-sm bg-arc-tint px-1.5 py-0.5 font-medium text-arc-ink text-xs tabular-nums">
						{what}
					</span>
				</div>
				<CommandInput placeholder={`Wat moet er met ${count === 1 ? "deze" : "deze selectie"} gebeuren?`} />
				<CommandList>
					<CommandEmpty>Geen actie met die naam.</CommandEmpty>
					{groups.map(([heading, items]) => (
						<CommandGroup key={heading} heading={heading}>
							{items.map(({ action: a, targets, blocked }) => {
								const Icon = a.icon;
								const partial = targets.length > 0 && targets.length < count;
								return (
									<CommandItem
										key={a.id}
										value={`${a.label} ${heading}`}
										disabled={targets.length === 0}
										onSelect={() => run(a, targets)}
										className={cn(a.destructive && "text-signal-red [&_svg]:text-signal-red!")}
									>
										{Icon ? <Icon className="size-4" strokeWidth={1.75} /> : null}
										<span>{a.label}</span>
										{blocked ? <span className="truncate text-ink-3 text-xs">{blocked}</span> : null}
										{partial ? (
											<span className="font-medium text-ink-3 text-xs tabular-nums">
												{targets.length} van {count}
											</span>
										) : null}
										{a.shortcut ? (
											<CommandShortcut>
												<MenuKey>{a.shortcut.toUpperCase()}</MenuKey>
											</CommandShortcut>
										) : null}
									</CommandItem>
								);
							})}
						</CommandGroup>
					))}
				</CommandList>
			</CommandDialog>
		</>
	);
}

function BarKey({ children }: { children: string }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-white/12 px-1 font-medium text-2xs leading-none tabular-nums">
			{children}
		</kbd>
	);
}

function MenuKey({ children }: { children: string }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-mist px-1 font-medium text-2xs text-ink-2 leading-none tabular-nums">
			{children}
		</kbd>
	);
}
