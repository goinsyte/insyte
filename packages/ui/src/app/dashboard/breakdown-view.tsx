import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { ArrowUpRight } from "../../icons";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { formatCurrency } from "../lib/format";
import type { Currency } from "../lib/types/domain";

/**
 * The breakdown over its parts, already in the board's currency: the demo's from its history, the console's from
 * `Home.revenueBreakdown`. The parts add back up to `total`.
 */
export function RevenueBreakdownView({
	open,
	onOpenChange,
	total,
	count,
	previous,
	days,
	currency,
	byStore,
	top,
	rest,
	shipping,
	excluded,
	rateNote,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	total: number;
	count: number;
	previous: number;
	days: number;
	currency: Currency;
	byStore: ReadonlyArray<{ name: string; value: number }>;
	top: ReadonlyArray<{ title: string; units: number; value: number }>;
	rest: { count: number; value: number };
	/** What the orders carry beyond their lines: shipping and tax, less discounts. */
	shipping: number;
	excluded: { cancelled: number; refunded: number };
	/** Said when a conversion went into the figure. */
	rateNote: string | null;
}) {
	const still = useReducedMotion();
	const money = (n: number) => formatCurrency(n, currency);
	const aov = count === 0 ? 0 : total / count;
	const left = excluded.cancelled + excluded.refunded;

	const Bar = ({ value, of }: { value: number; of: number }) => (
		<span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/6">
			<motion.span
				className="block h-full rounded-full bg-arc"
				initial={still ? false : { width: 0 }}
				animate={{ width: `${of === 0 ? 0 : (value / of) * 100}%` }}
				transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
			/>
		</span>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Waar {money(total)} vandaan komt</DialogTitle>
					<DialogDescription>
						Bestelwaarde van {count} {count === 1 ? "bestelling" : "bestellingen"} in de laatste {days} dagen met bestellingen, in{" "}
						{currency}.
					</DialogDescription>
				</DialogHeader>

				<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-mist">
					{[
						["Bestellingen geteld", String(count)],
						["Gemiddelde bestelling", money(aov)],
						["De periode ervoor", money(previous)],
					].map(([k, v]) => (
						<div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
							<dt className="text-xs text-ink-3">{k}</dt>
							<dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
						</div>
					))}
				</dl>

				<section className="flex flex-col gap-1.5">
					<h3 className="font-medium text-ink-3 text-xs">Per winkel</h3>
					{byStore.map((s) => (
						<div key={s.name} className="flex items-center gap-3 text-base">
							<span className="w-32 shrink-0 truncate text-ink">{s.name}</span>
							<Bar value={s.value} of={total} />
							<span className="w-20 shrink-0 text-right text-ink-2 tabular-nums">{money(s.value)}</span>
						</div>
					))}
				</section>

				<section className="flex flex-col gap-1.5">
					<h3 className="font-medium text-ink-3 text-xs">Per product</h3>
					{top.map((p) => (
						<div key={p.title} className="flex items-center gap-3 text-base">
							<span className="min-w-0 flex-1 truncate text-ink">{p.title}</span>
							<span className="w-16 shrink-0 text-right text-sm text-ink-3 tabular-nums">{p.units} verkocht</span>
							<span className="w-20 shrink-0 text-right text-ink-2 tabular-nums">{money(p.value)}</span>
						</div>
					))}
					{rest.value > 0 ? (
						<div className="flex items-center gap-3 text-base text-ink-3">
							<span className="min-w-0 flex-1">{rest.count} andere producten</span>
							<span className="w-20 shrink-0 text-right tabular-nums">{money(rest.value)}</span>
						</div>
					) : null}
					{Math.abs(shipping) >= 1 ? (
						<div className="flex items-center gap-3 text-base text-ink-3">
							<span className="min-w-0 flex-1">Verzending, btw en kortingen</span>
							<span className="w-20 shrink-0 text-right tabular-nums">{money(shipping)}</span>
						</div>
					) : null}
				</section>

				<section className="flex flex-col gap-1 text-sm text-ink-2">
					<h3 className="font-medium text-ink-3 text-xs">Niet meegeteld</h3>
					<p>
						{excluded.cancelled} geannuleerde en {excluded.refunded} terugbetaalde {left === 1 ? "bestelling" : "bestellingen"} in dezelfde periode{" "}
						{left === 1 ? "telt" : "tellen"} niet mee.
					</p>
					{rateNote ? <p className="text-ink-3">{rateNote}</p> : null}
				</section>

				<DialogFooter>
					<Link
						to="/orders"
						onClick={() => onOpenChange(false)}
						className="flex h-9 items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
					>
						Bestellingen openen
						<ArrowUpRight className="size-3.5" strokeWidth={2} />
					</Link>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
