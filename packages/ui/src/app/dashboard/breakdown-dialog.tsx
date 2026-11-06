import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { ArrowUpRight } from "../../icons";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { formatCurrency } from "../lib/format";
import { convert, RATE_NOTE } from "../lib/money";
import type { RevenueWindow } from "../lib/revenue";
import type { Currency } from "../lib/types/domain";
import { useWorkspace } from "../stores/workspace-store";

/**
 * "Where does this number come from": the revenue figure on Home, taken apart. Every part adds back
 * up to the figure — by store, then by product — and what was left out is named and counted, with
 * the rate any conversion used. Precision is the trust mechanism; a figure nobody can trace is one
 * nobody acts on.
 */
export function RevenueBreakdown({
	open,
	onOpenChange,
	window: w,
	days,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	window: RevenueWindow;
	days: number;
	currency: Currency;
}) {
	const stores = useWorkspace((s) => s.stores);
	const still = useReducedMotion();
	const money = (n: number) => formatCurrency(n, currency);

	const byStore = useMemo(() => {
		const m = new Map<string, number>();
		for (const o of w.counted) m.set(o.store_id, (m.get(o.store_id) ?? 0) + convert(o.total, o.currency, currency));
		return [...m]
			.map(([id, value]) => ({ name: stores.find((s) => s.id === id)?.name ?? "Overig", value }))
			.sort((a, b) => b.value - a.value);
	}, [w.counted, stores, currency]);

	const byProduct = useMemo(() => {
		const m = new Map<string, { value: number; units: number }>();
		for (const o of w.counted)
			for (const li of o.line_items) {
				const r = m.get(li.title) ?? { value: 0, units: 0 };
				r.value += convert(li.unit_price * li.quantity, o.currency, currency);
				r.units += li.quantity;
				m.set(li.title, r);
			}
		return [...m].map(([title, r]) => ({ title, ...r })).sort((a, b) => b.value - a.value);
	}, [w.counted, currency]);

	const top = byProduct.slice(0, 5);
	const rest = byProduct.slice(5).reduce((n, p) => n + p.value, 0);
	const aov = w.counted.length === 0 ? 0 : w.total / w.counted.length;
	const mixed = new Set(w.counted.map((o) => o.currency)).size > 1 || w.counted.some((o) => o.currency !== currency);
	const lineTotal = byProduct.reduce((n, p) => n + p.value, 0);
	const shipping = w.total - lineTotal;

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
					<DialogTitle>Waar {money(w.total)} vandaan komt</DialogTitle>
					<DialogDescription>
						Bestelwaarde van {w.counted.length} {w.counted.length === 1 ? "bestelling" : "bestellingen"} in de laatste {days} dagen met bestellingen, in{" "}
						{currency}.
					</DialogDescription>
				</DialogHeader>

				<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-mist">
					{[
						["Bestellingen geteld", String(w.counted.length)],
						["Gemiddelde bestelling", money(aov)],
						["De periode ervoor", money(w.previous)],
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
							<Bar value={s.value} of={w.total} />
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
					{rest > 0 ? (
						<div className="flex items-center gap-3 text-base text-ink-3">
							<span className="min-w-0 flex-1">{byProduct.length - 5} andere producten</span>
							<span className="w-20 shrink-0 text-right tabular-nums">{money(rest)}</span>
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
						{w.excluded.cancelled.length} geannuleerde en {w.excluded.refunded.length} terugbetaalde{" "}
						{w.excluded.cancelled.length + w.excluded.refunded.length === 1 ? "bestelling" : "bestellingen"} in dezelfde periode{" "}
						{w.excluded.cancelled.length + w.excluded.refunded.length === 1 ? "telt" : "tellen"} niet mee.
					</p>
					{mixed ? <p className="text-ink-3">{RATE_NOTE}</p> : null}
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
