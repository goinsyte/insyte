import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { Check } from "../../icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { DuplicateGroup } from "../lib/duplicates";
import { formatCurrency, initials } from "../lib/format";
import { countryFlag, countryName } from "../lib/format-flag";
import { personStyle } from "../lib/person-color";
import type { Customer } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/**
 * The duplicate review: one group at a time, "are these the same person?", and the operator says.
 *
 * Each profile is a column the operator can pick as the one to keep — the one whose name and email
 * stay — and a band under them says what the merged profile will be before it is merged: every order
 * and every euro counted once, every address kept. "Not the same person" is an answer too, and the
 * group is not asked about again. Merging has Undo; nothing about it is a guess the product made.
 */

const MATCH_LABEL: Record<DuplicateGroup["match"], { label: string; tone: string }> = {
	"same email": { label: "Zelfde e-mailadres", tone: "bg-arc-tint text-arc-ink" },
	"same name and country": { label: "Zelfde naam en land", tone: "bg-arc-tint text-arc-ink" },
	"same name": { label: "Alleen zelfde naam", tone: "bg-signal-amber-bg text-signal-amber" },
};

export function MergeReview({
	open,
	onOpenChange,
	groups,
	customers,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	groups: ReadonlyArray<DuplicateGroup>;
	customers: ReadonlyArray<Customer>;
}) {
	const merge = useWorkspace((s) => s.mergeCustomers);
	const notDuplicate = useWorkspace((s) => s.notDuplicate);
	const still = useReducedMotion();
	// The queue is fixed when the review opens, so merging one group does not reshuffle the rest.
	const [queue, setQueue] = useState<ReadonlyArray<DuplicateGroup>>([]);
	const [at, setAt] = useState(0);
	const [keep, setKeep] = useState<string | null>(null);
	const [merged, setMerged] = useState(0);
	const [dismissed, setDismissed] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the queue is taken once, when the review opens
	useEffect(() => {
		if (!open) return;
		setQueue(groups);
		setAt(0);
		setMerged(0);
		setDismissed(0);
	}, [open]);

	const group = queue[at];
	const members = group ? group.ids.map((id) => customers.find((c) => c.id === id)).filter((c): c is Customer => c !== undefined) : [];
	// The default keeper is the profile with the most history.
	const keeper = members.find((c) => c.id === keep) ?? [...members].sort((a, b) => b.orders_count - a.orders_count)[0];

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new group starts with no choice made
	useEffect(() => setKeep(null), [at]);

	const next = () => setAt((i) => i + 1);

	function doMerge() {
		if (!group || !keeper) return;
		const before = useWorkspace.getState();
		const snapshot = { edits: before.customerEdits, not: before.notDuplicates };
		const others = members.filter((c) => c.id !== keeper.id);
		merge(keeper, others);
		setMerged((n) => n + 1);
		undoable(`${others.length + 1} profielen samengevoegd tot ${keeper.name}`, () => useWorkspace.getState().restoreCustomers(snapshot.edits, snapshot.not));
		next();
	}

	const total = {
		orders: members.reduce((n, c) => n + c.orders_count, 0),
		value: members.reduce((n, c) => n + c.lifetime_value, 0),
		emails: new Set(members.map((c) => c.email)).size,
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[680px]">
				{group && keeper ? (
					<>
						<DialogHeader>
							<DialogTitle>Is dit dezelfde persoon?</DialogTitle>
							<DialogDescription className="flex items-center gap-2">
								<span className="tabular-nums">
									{at + 1} van {queue.length}
								</span>
								<span aria-hidden>·</span>
								<span className={cn("rounded-sm px-1.5 py-0.5 font-medium text-xs", MATCH_LABEL[group.match].tone)}>
									{MATCH_LABEL[group.match].label}
								</span>
							</DialogDescription>
						</DialogHeader>

						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={group.key}
								initial={still ? false : { opacity: 0, x: 24 }}
								animate={{ opacity: 1, x: 0 }}
								exit={still ? { opacity: 0 } : { opacity: 0, x: -16 }}
								transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
								className="flex flex-col gap-3"
							>
								<div role="radiogroup" aria-label="Profiel om te houden" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${members.length}, minmax(0, 1fr))` }}>
									{members.map((c) => {
										const on = c.id === keeper.id;
										return (
											<button
												key={c.id}
												type="button"
												role="radio"
												aria-checked={on}
												onClick={() => setKeep(c.id)}
												className={cn(
													"relative flex cursor-pointer flex-col gap-3 rounded-lg bg-mist p-3 text-left transition-shadow",
													on ? "ring-2 ring-arc" : "hover:ring-1 hover:ring-ink/15",
												)}
											>
												<span className="flex items-center gap-2.5">
													<span className="flex size-8 shrink-0 items-center justify-center rounded-full font-medium text-xs" style={personStyle(c.id)}>
														{initials(c.name)}
													</span>
													<span className="flex min-w-0 flex-col">
														<span className="truncate font-medium text-base text-ink">{c.name}</span>
														<span className="truncate text-sm text-ink-3">{c.email}</span>
													</span>
												</span>
												<dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
													<dt className="text-ink-3">Land</dt>
													<dd className="truncate text-ink-2">
														{countryFlag(c.address?.country ?? "US")} {countryName(c.address?.country ?? "US")}
													</dd>
													<dt className="text-ink-3">Bestellingen</dt>
													<dd className="text-ink-2 tabular-nums">{c.orders_count}</dd>
													<dt className="text-ink-3">Klantwaarde</dt>
													<dd className="text-ink-2 tabular-nums">{formatCurrency(c.lifetime_value)}</dd>
													<dt className="text-ink-3">Sinds</dt>
													<dd className="text-ink-2 tabular-nums">
														{new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric" }).format(new Date(c.created_at))}
													</dd>
												</dl>
												<span className={cn("flex h-6 items-center gap-1 text-xs", on ? "font-medium text-arc-ink" : "text-ink-3")}>
													{on ? <Check className="size-3.5" strokeWidth={2.25} /> : null}
													{on ? "Dit profiel houden" : "Liever dit profiel houden"}
												</span>
											</button>
										);
									})}
								</div>
								<p className="rounded-lg bg-mist px-3 py-2.5 text-sm text-ink-2">
									Samengevoegd is dit één profiel: <span className="font-medium text-ink">{keeper.name}</span>,{" "}
									<span className="tabular-nums">{total.orders}</span> {total.orders === 1 ? "bestelling" : "bestellingen"} en{" "}
									<span className="tabular-nums">{formatCurrency(total.value)}</span> klantwaarde, met{" "}
									{total.emails === 1 ? "één e-mailadres" : `${total.emails} e-mailadressen bewaard`}.
								</p>
							</motion.div>
						</AnimatePresence>

						<DialogFooter className="sm:justify-between">
							<button
								type="button"
								onClick={() => {
									notDuplicate(group.key);
									setDismissed((n) => n + 1);
									next();
								}}
								className="h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								Niet dezelfde persoon
							</button>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={next}
									className="h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
								>
									Overslaan
								</button>
								<button
									type="button"
									onClick={doMerge}
									className="h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
								>
									{members.length} profielen samenvoegen
								</button>
							</div>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>{queue.length === 0 ? "Geen dubbele profielen om te bekijken" : "Alles bekeken"}</DialogTitle>
							<DialogDescription>
								{queue.length === 0
									? "Geen twee profielen delen een e-mailadres, of een naam in hetzelfde land."
									: `${merged} samengevoegd, ${dismissed} apart gehouden, ${queue.length - merged - dismissed} overgeslagen.`}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
							>
								Klaar
							</button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
