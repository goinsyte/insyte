import { Link } from "@tanstack/react-router";
import { pct } from "../lib/returns";

/** What the Retouren block shows, from whoever hosts it: the design from its queue, the console from `Returns.list`. */
export type ProductReturnsFigures = {
	sold: number;
	returned: number;
	rate: number;
	reasons: ReadonlyArray<{ id: string; label: string; n: number }>;
};

/**
 * The product page's Retouren block over the host's figures: the rate against the 10% the Aandacht view watches, and
 * the reasons.
 */
export function ProductReturnsPanel({ r }: { r: ProductReturnsFigures }) {
	return (
		<section className="panel flex flex-col gap-3 rounded-lg p-4">
			<span className="flex items-baseline justify-between font-medium text-ink-2 text-xs">
				Retouren
				<Link to="/returns" className="font-normal text-arc-ink hover:underline">
					Alle retouren
				</Link>
			</span>
			<p className="flex items-baseline gap-2">
				<span className={r.rate > 0.1 ? "font-medium text-lg text-signal-amber tabular-nums" : "font-medium text-ink text-lg tabular-nums"}>{pct(r.rate)}</span>
				<span className="text-ink-3 text-sm">
					{r.returned} van {r.sold} verkochte stuks terug
				</span>
			</p>
			{r.reasons.length ? (
				<ul className="flex flex-col gap-1">
					{r.reasons.map((x) => (
						<li key={x.id} className="flex items-center justify-between text-sm">
							<span className="text-ink-2">{x.label}</span>
							<span className="text-ink-3 tabular-nums">{x.n}</span>
						</li>
					))}
				</ul>
			) : (
				<p className="text-ink-3 text-sm">Nog niets teruggekomen.</p>
			)}
		</section>
	);
}
