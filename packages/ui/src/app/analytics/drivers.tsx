import { motion, useReducedMotion } from "motion/react";
import { dec1, money } from "../lib/analytics/engine";
import { cn } from "../lib/utils";

/**
 * What moved a number, as signed bars on a centre line: right for what added, left for what took
 * away, each with its value written out so the sign never rests on the bar alone. The same drawing
 * serves the plate (in chalk) and the explain drawer (in ink).
 */
export type DriverUnit = "$" | "orders" | "pts" | "refunds" | "cases" | "h";

export function formatDriver(v: number, unit: DriverUnit) {
	const sign = v > 0 ? "+" : v < 0 ? "−" : "";
	const abs = Math.abs(v);
	if (unit === "$") return `${sign}${money(abs)}`;
	if (unit === "h") return `${sign}${dec1(abs)} u`;
	if (unit === "pts") return `${sign}${abs.toLocaleString("nl-NL")} pp`;
	return `${sign}${abs.toLocaleString("nl-NL")}`;
}

export function Drivers({
	drivers,
	unit,
	dark = false,
}: {
	drivers: ReadonlyArray<{ label: string; value: number; detail?: string }>;
	unit: DriverUnit;
	dark?: boolean;
}) {
	const still = useReducedMotion();
	const max = Math.max(1, ...drivers.map((d) => Math.abs(d.value)));
	return (
		<ul className="flex flex-col gap-1">
			{drivers.map((d, i) => {
				const w = (Math.abs(d.value) / max) * 50;
				const up = d.value >= 0;
				return (
					<li key={d.label} className="grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
						<span className={cn("flex min-w-0 flex-col", dark ? "text-mesh-ink-2" : "text-ink-2")}>
							<span className="truncate">{d.label}</span>
							{d.detail ? <span className={cn("truncate text-xs", dark ? "text-mesh-ink-3" : "text-ink-3")}>{d.detail}</span> : null}
						</span>
						<span className="relative h-3">
							<span aria-hidden className={cn("absolute top-0 bottom-0 left-1/2 w-px", dark ? "bg-mesh-ink/35" : "bg-ink/20")} />
							<motion.span
								aria-hidden
								className={cn(
									"absolute top-1/2 h-1.5 -translate-y-1/2 rounded-[1px]",
									dark ? (up ? "bg-mesh-ink" : "bg-mesh-ink/45") : up ? "bg-arc" : "bg-signal-red",
								)}
								style={up ? { left: "50%" } : { right: "50%" }}
								initial={still ? false : { width: 0 }}
								animate={{ width: `${w}%` }}
								transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
							/>
						</span>
						<span className={cn("text-right tabular-nums", dark ? "text-mesh-ink" : "text-ink")}>{formatDriver(d.value, unit)}</span>
					</li>
				);
			})}
		</ul>
	);
}
