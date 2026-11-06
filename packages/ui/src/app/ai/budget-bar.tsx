import { budgetShare, budgetState } from "../lib/autonomy";
import { euro } from "../lib/permissions";
import { cn } from "../lib/utils";

/*
 * What has been spent of an AI budget, as a bar and its words: `arc` while there is room, amber
 * from 80%, red at the limit, each with the figure beside it so the colour is never the only signal.
 * No limit draws the spend alone, on a quiet track.
 */
export function BudgetBar({ used, limit, className, wide = false }: { used: number; limit: number | null; className?: string; wide?: boolean }) {
	const state = budgetState(used, limit);
	const share = budgetShare(used, limit);
	return (
		<div className={cn("flex min-w-0 items-center gap-2.5", className)}>
			<span className={cn("relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8", wide ? "min-w-40" : "min-w-20")}>
				{limit !== null ? (
					<span
						className={cn("absolute inset-y-0 left-0 rounded-full", state === "spent" ? "bg-signal-red" : state === "warn" ? "bg-signal-amber" : "bg-arc")}
						style={{ width: `${Math.max(2, share * 100)}%` }}
					/>
				) : null}
			</span>
			<span className={cn("shrink-0 text-sm tabular-nums", state === "spent" ? "text-signal-red" : state === "warn" ? "text-signal-amber" : "text-ink-2")}>
				{limit === null ? `${euroCents(used)} · geen limiet` : `${euroCents(used)} van ${euro(limit)}`}
			</span>
		</div>
	);
}

/** Spend is small enough that cents matter: €38,40. */
export const euroCents = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(n);
