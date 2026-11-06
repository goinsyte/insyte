import { cn } from "../lib/utils";
import { useSeats } from "../stores/team-store";

/**
 * The plan's seats as one line: a bar with a tick per seat, the count, and what fills it. Full is
 * said in words and in amber, with the way out beside it, never by the bar alone.
 */
export function SeatMeter({ onBuy }: { onBuy: () => void }) {
	const s = useSeats();
	return (
		<div className="flex flex-col gap-2 rounded-xl bg-paper px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:flex-row sm:items-center sm:gap-4">
			<div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
				<span className="font-medium text-ink text-lg">{s.used}</span>
				<span className="text-base text-ink-2">van {s.total} plekken</span>
			</div>
			<div className="flex min-w-0 flex-1 gap-0.5" aria-hidden>
				{Array.from({ length: s.total }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: seats are positions, not records
						key={i}
						className={cn("h-1.5 min-w-0 flex-1 rounded-full", i < s.active ? "bg-abyss" : i < s.used ? "bg-arc" : "bg-ink/10", s.full && i < s.used && "bg-signal-amber")}
					/>
				))}
			</div>
			<p className="shrink-0 text-sm text-ink-2 tabular-nums">
				{s.active} {s.active === 1 ? "teamlid" : "teamleden"} · {s.pending} {s.pending === 1 ? "uitnodiging" : "uitnodigingen"} open
				{s.extra > 0 ? ` · ${s.extra} extra` : ""}
				{s.full ? (
					<>
						{" · "}
						<span className="font-medium text-signal-amber">vol</span>{" "}
						<button type="button" onClick={onBuy} className="font-medium text-arc-ink underline decoration-arc-ink/35 underline-offset-2 hover:decoration-arc-ink">
							Plek bijkopen
						</button>
					</>
				) : (
					` · ${s.free} vrij`
				)}
			</p>
		</div>
	);
}
