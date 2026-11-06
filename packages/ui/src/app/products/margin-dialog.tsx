import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import { ArrowRight } from "../../icons";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../lib/format";
import { marginOf } from "../lib/catalog";
import type { Product } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/**
 * Recalculate margins: price the picked products so each keeps a target margin over what it costs.
 * Every row shows its price and margin now and after, so the change is read before it is made, and
 * products with no cost on record are named and left alone rather than priced on a guess. Prices
 * round to the whole unit, the way the store already prices.
 */
export function MarginDialog({
	open,
	onOpenChange,
	picked,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	picked: ReadonlyArray<Product>;
}) {
	const editProducts = useWorkspace((s) => s.editProducts);
	const restore = useWorkspace((s) => s.restoreProducts);
	const [target, setTarget] = useState("60");

	useEffect(() => {
		if (open) setTarget("60");
	}, [open]);

	const t = Math.min(90, Math.max(5, Number(target) || 0)) / 100;
	const rows = useMemo(
		() =>
			picked.map((p) => {
				const next = p.cost === undefined ? null : Math.max(1, Math.round(p.cost / (1 - t)));
				return { p, next, before: marginOf(p.price, p.cost), after: next === null ? null : marginOf(next, p.cost) };
			}),
		[picked, t],
	);
	const priced = rows.filter((r) => r.next !== null && r.next !== r.p.price);
	const noCost = rows.filter((r) => r.next === null).length;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Marges herberekenen</DialogTitle>
					<DialogDescription>Zet elke prijs zo dat hij een marge boven de inkoopprijs houdt. Shopify krijgt de nieuwe prijzen bij de volgende synchronisatie.</DialogDescription>
				</DialogHeader>
				<label className="flex items-center gap-3 text-base text-ink-2">
					Doelmarge
					<span className="field flex h-9 w-24 items-center gap-1 rounded-md px-2.5 focus-within:bg-paper">
						<input
							type="number"
							min={5}
							max={90}
							value={target}
							onChange={(e) => setTarget(e.target.value)}
							aria-label="Doelmarge in procent"
							className="min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none"
						/>
						<span className="text-ink-3">%</span>
					</span>
				</label>
				<ul className="flex max-h-72 flex-col overflow-y-auto">
					{rows.map((r, i) => (
						<li key={r.p.id} className={cn("flex h-10 items-center gap-3 rounded-md px-2.5 text-base", i % 2 === 0 && "bg-mist")}>
							<span className="min-w-0 flex-1 truncate text-ink">{r.p.title}</span>
							{r.next === null ? (
								<span className="text-sm text-ink-3">Geen inkoopprijs bekend</span>
							) : (
								<>
									<span className="w-28 text-right text-ink-2 tabular-nums">
										{formatCurrency(r.p.price)} <span className="text-ink-3">{Math.round(r.before * 100)}%</span>
									</span>
									<ArrowRight className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} />
									<span className={cn("w-28 text-right tabular-nums", r.next === r.p.price ? "text-ink-3" : "font-medium text-ink")}>
										{formatCurrency(r.next)} <span className="font-normal text-ink-3">{Math.round((r.after ?? 0) * 100)}%</span>
									</span>
								</>
							)}
						</li>
					))}
				</ul>
				{noCost > 0 ? (
					<p className="text-sm text-ink-3">
						{noCost} {noCost === 1 ? "product heeft" : "producten hebben"} geen inkoopprijs en {noCost === 1 ? "houdt zijn" : "houden hun"} prijs.
					</p>
				) : null}
				<DialogFooter>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="h-9 cursor-pointer rounded-md px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						Annuleren
					</button>
					<button
						type="button"
						disabled={priced.length === 0}
						onClick={() => {
							const before = useWorkspace.getState().productEdits;
							editProducts(Object.fromEntries(priced.map((r) => [r.p.id, { price: r.next ?? r.p.price }])));
							undoable(`${priced.length} ${priced.length === 1 ? "prijs" : "prijzen"} ingesteld op ${Math.round(t * 100)}% marge`, () => restore(before));
							onOpenChange(false);
						}}
						className="h-9 cursor-pointer rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
					>
						{priced.length === 0 ? "Geen prijswijzigingen" : `${priced.length} ${priced.length === 1 ? "prijs" : "prijzen"} wijzigen`}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
