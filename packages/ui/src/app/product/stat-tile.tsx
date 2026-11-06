import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
   StatTile — bigger cousin of KpiTile for headline numbers on
   dashboards: payouts, conversion rate, total clicks, etc. Same
   typographic vocabulary as KpiTile but with a more spacious layout
   so individual numbers can carry their own row.

   Use KpiTile for compact KPI strips (4-up grids); use StatTile when a
   stat is the headline of a column.
   ──────────────────────────────────────────────────────────────────────── */

export type StatTileProps = {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	hintTone?: "neutral" | "up" | "down" | "warn";
	variant?: "outline" | "mist" | "white";
	className?: string;
	icon?: ReactNode;
};

const VARIANT: Record<NonNullable<StatTileProps["variant"]>, string> = {
	outline: "bg-glacier ",
	mist: "bg-mist",
	white: "panel",
};

const HINT_TONE: Record<NonNullable<StatTileProps["hintTone"]>, string> = {
	neutral: "text-ink-3",
	up: "text-signal-green",
	down: "text-signal-red",
	warn: "text-signal-amber",
};

export function StatTile({
	label,
	value,
	hint,
	hintTone = "neutral",
	variant = "outline",
	className,
	icon,
}: StatTileProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 rounded-xl px-5 py-4",
				VARIANT[variant],
				className,
			)}
		>
			<div className="flex items-baseline justify-between">
				<span className="font-medium text-xs text-ink-3">
					{label}
				</span>
				{icon && <span className="text-ink-3">{icon}</span>}
			</div>
			<span className="font-medium tabular-nums text-2xl text-ink tabular-nums leading-[1.05] tracking-[-0.4px] sm:text-2xl">
				{value}
			</span>
			{hint && (
				<span
					className={cn(
						"tabular-nums font-medium text-xs tabular-nums",
						HINT_TONE[hintTone],
					)}
				>
					{hint}
				</span>
			)}
		</div>
	);
}
