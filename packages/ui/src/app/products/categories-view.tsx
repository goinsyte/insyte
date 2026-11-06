import { ArrowRight } from "../../icons";
import { useMemo } from "react";
import { CATEGORIES, categoryOf, marginOf, stockOf } from "../lib/catalog";
import type { Product } from "../lib/types/domain";
import { cn } from "../lib/utils";

/**
 * Categories: the catalogue grouped by what the products are, each group with its count, how many
 * need restocking and its average margin, measured on one shared bar so the groups compare at a
 * glance. A group opens the product list cut to it.
 */
export function CategoriesView({ products, onOpen }: { products: ReadonlyArray<Product>; onOpen: (category: string) => void }) {
	const groups = useMemo(
		() =>
			CATEGORIES.map((name) => {
				const items = products.filter((p) => p.status !== "archived" && categoryOf(p.title) === name);
				const margin = items.length === 0 ? 0 : items.reduce((n, p) => n + marginOf(p.price, p.cost), 0) / items.length;
				return {
					name,
					count: items.length,
					restock: items.filter((p) => stockOf(p) !== "available").length,
					margin,
					titles: items.slice(0, 3).map((p) => p.title),
				};
			}).filter((g) => g.count > 0),
		[products],
	);

	return (
		<ul className="flex flex-col">
			<li className="flex h-8 items-center gap-4 px-3 text-xs text-ink-3" aria-hidden>
				<span className="min-w-0 flex-1">Categorie</span>
				<span className="w-20 text-right">Producten</span>
				<span className="w-28 text-right">Bij te bestellen</span>
				<span className="w-48">Gemiddelde marge</span>
				<span className="w-4" />
			</li>
			{groups.map((g, i) => (
				<li key={g.name}>
					<button
						type="button"
						onClick={() => onOpen(g.name)}
						className={cn(
							"group/cat flex h-14 w-full cursor-pointer items-center gap-4 rounded-md px-3 text-left transition-colors hover:bg-ink/6",
							i % 2 === 0 && "bg-mist",
						)}
					>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium text-base text-ink">{g.name}</span>
							<span className="truncate text-sm text-ink-3">{g.titles.join(", ")}</span>
						</span>
						<span className="w-20 text-right text-base text-ink-2 tabular-nums">{g.count}</span>
						<span className={cn("w-28 text-right text-base tabular-nums", g.restock > 0 ? "font-medium text-signal-amber" : "text-ink-3")}>
							{g.restock === 0 ? "Geen" : g.restock}
						</span>
						<span className="flex w-48 items-center gap-2.5">
							<span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
								<span className="block h-full rounded-full bg-arc" style={{ width: `${Math.round(g.margin * 100)}%` }} />
							</span>
							<span className="w-10 text-right text-base text-ink-2 tabular-nums">{Math.round(g.margin * 100)}%</span>
						</span>
						<ArrowRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover/cat:translate-x-0.5 group-hover/cat:text-ink-2" strokeWidth={1.75} />
					</button>
				</li>
			))}
		</ul>
	);
}
